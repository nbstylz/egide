-- Migration 0023 : paiement des inscriptions (Rail A — Stripe Connect Express)
--
-- Les frais d'inscription rémunèrent un service rendu dans le monde réel
-- (une place à un tournoi physique) : ils passent par Stripe et non par
-- l'achat intégré, conformément à la guideline Apple 3.1.3(e). Voir
-- PAIEMENTS.md pour le raisonnement complet.
--
-- Modèle retenu : Stripe Connect Express. Chaque organisateur possède son
-- compte connecté ; les fonds vont directement chez lui et EGIDE prélève une
-- commission au passage (`application_fee`). EGIDE ne touche jamais les fonds.
--
-- Trois précautions structurent cette migration :
--   1. `registrations` et `tournaments` sont en lecture publique (annuaire) :
--      aucune donnée Stripe sensible ne doit y atterrir. Les identifiants de
--      compte, de session et les montants vivent dans des tables à part, à la
--      RLS restrictive (même piège que le `invite_code`, migration 0016).
--   2. Le prix reste NULL/0 = tournoi gratuit : le parcours actuel est
--      inchangé, aucune régression sur l'existant.
--   3. Le client ne s'écrit jamais « payé » lui-même : seules les Edge
--      Functions (clé de service) écrivent les tables de paiement.

-- ---------------------------------------------------------------------------
-- 1. Prix du tournoi (public : le joueur doit le voir dans l'annuaire)
-- ---------------------------------------------------------------------------

-- NULL ou 0 = tournoi gratuit. Les tournois existants restent gratuits.
alter table public.tournaments
  add column price_cents integer check (price_cents is null or price_cents >= 0),
  add column currency text not null default 'eur';

-- ---------------------------------------------------------------------------
-- 2. Réservation temporaire de la place (nouveau statut d'inscription)
-- ---------------------------------------------------------------------------
--
-- Le joueur obtient la place tout de suite avec un délai pour payer ; passé le
-- délai, la place repart (voir `release_unpaid_registrations` plus bas). On
-- AJOUTE `pending_payment` à l'ensemble existant : `dropped` (migration 0013)
-- reste indispensable au classement et aux abandons — ne pas le retirer.
alter table public.registrations
  drop constraint registrations_status_check;

alter table public.registrations
  add constraint registrations_status_check
  check (status in (
    'pending_payment',  -- place réservée, en attente de paiement
    'registered',
    'waitlisted',
    'withdrawn',
    'checked_in',
    'dropped'
  ));

-- Échéance de la réservation. NULL pour les tournois gratuits (pas de délai).
alter table public.registrations
  add column payment_deadline timestamptz;

-- Index partiel pour le balayage des places impayées : seules les lignes en
-- attente de paiement portent une échéance utile.
create index registrations_deadline_idx
  on public.registrations (payment_deadline)
  where status = 'pending_payment';

-- ---------------------------------------------------------------------------
-- 3. Comptes connectés des organisateurs (Stripe Connect Express)
-- ---------------------------------------------------------------------------
--
-- L'identifiant `acct_…` et l'état d'onboarding sont sensibles : les profils
-- étant lisibles par tout compte connecté (migration 0001), on ne les met pas
-- sur `profiles`. Table dédiée, lisible par le seul organisateur concerné.
-- Alimentée par les Edge Functions (création du compte, webhook `account.updated`).
create table public.stripe_accounts (
  organizer_id uuid primary key references public.profiles (id) on delete cascade,
  stripe_account_id text not null unique,
  -- Drapeaux renvoyés par Stripe : tant que `charges_enabled` est faux, le
  -- compte ne peut pas encaisser — l'app doit alors bloquer les tournois payants.
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.stripe_accounts enable row level security;

-- L'organisateur consulte son propre compte (pour savoir où en est l'onboarding).
-- Personne d'autre, et surtout pas `anon`.
create policy "L'organisateur consulte son compte Stripe"
  on public.stripe_accounts for select
  to authenticated
  using ((select auth.uid()) = organizer_id);

-- Aucune écriture côté client : seules les Edge Functions (clé de service)
-- créent et mettent à jour le compte connecté.
revoke insert, update, delete on public.stripe_accounts from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 4. Paiements d'inscription (une ligne par inscription)
-- ---------------------------------------------------------------------------

create table public.registration_payments (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique
    references public.registrations (id) on delete cascade,
  stripe_session_id text unique,
  stripe_payment_intent_id text,
  -- Compte connecté destinataire des fonds, et commission réellement prélevée
  -- par EGIDE (renseignés par le webhook — le montant de commission est une
  -- décision produit encore ouverte, on enregistre ce qui a été appliqué).
  stripe_account_id text,
  amount_cents integer not null check (amount_cents >= 0),
  application_fee_cents integer check (application_fee_cents is null or application_fee_cents >= 0),
  currency text not null default 'eur',
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'refunded', 'failed', 'expired')),
  paid_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.registration_payments enable row level security;

-- Le joueur voit son propre paiement ; l'organisateur voit ceux de son tournoi
-- (il doit savoir qui a réglé). Personne d'autre, et surtout pas `anon`.
create policy "Le joueur ou l'organisateur consulte le paiement"
  on public.registration_payments for select
  to authenticated
  using (
    exists (
      select 1
      from public.registrations r
      join public.tournaments t on t.id = r.tournament_id
      where r.id = registration_id
        and ((select auth.uid()) = r.player_id
             or (select auth.uid()) = t.organizer_id)
    )
  );

-- Aucune politique d'écriture : seule l'Edge Function du webhook écrit ici,
-- avec la clé de service. Le client ne doit jamais pouvoir se déclarer payé.
revoke insert, update, delete on public.registration_payments from authenticated, anon;

-- ---------------------------------------------------------------------------
-- 5. Libération des places non payées
-- ---------------------------------------------------------------------------
--
-- Rend « withdrawn » les places dont le délai est dépassé, puis promeut la
-- liste d'attente. Destinée à pg_cron (toutes les 5 minutes).
--
-- NB : `promote_waitlist` (migration 0004) promeut encore directement en
-- `registered`. La promotion en `pending_payment` avec sa propre échéance
-- (cf. PAIEMENTS.md §2.6, dépendante de l'EPIC-6) fera l'objet d'une migration
-- ultérieure ; sans conséquence sur les tournois gratuits, majoritaires.
create or replace function public.release_unpaid_registrations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament_id uuid;
  v_batch int;
  v_released int := 0;
begin
  for v_tournament_id in
    select distinct tournament_id
    from public.registrations
    where status = 'pending_payment'
      and payment_deadline < now()
  loop
    update public.registrations
    set status = 'withdrawn', updated_at = now()
    where tournament_id = v_tournament_id
      and status = 'pending_payment'
      and payment_deadline < now();

    get diagnostics v_batch = row_count;
    v_released := v_released + v_batch;

    -- La place libérée profite immédiatement au premier en attente.
    perform public.promote_waitlist(v_tournament_id);
  end loop;

  return v_released;
end;
$$;

-- Appelée par le planificateur, jamais par l'app.
revoke execute on function public.release_unpaid_registrations() from public, anon, authenticated;

-- Planification pg_cron. L'extension s'active dans le dashboard Supabase
-- (Database → Extensions) ; on ne fait pas échouer la migration si elle n'est
-- pas encore là — la planification pourra être rejouée une fois activée.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $cron$
      select cron.schedule(
        'liberer-inscriptions-impayees',
        '*/5 * * * *',
        $job$select public.release_unpaid_registrations()$job$
      )
    $cron$;
  else
    raise notice 'pg_cron absent : activez l''extension puis planifiez « liberer-inscriptions-impayees ».';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Assertions : vérifient que la migration a bien produit le schéma attendu
-- ---------------------------------------------------------------------------

do $$
begin
  -- Prix du tournoi ajouté, et tournoi gratuit toujours possible (colonne
  -- nullable, pas de contrainte NOT NULL qui casserait l'existant).
  assert exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tournaments'
      and column_name = 'price_cents' and is_nullable = 'YES'
  ), 'tournaments.price_cents doit exister et rester nullable (tournoi gratuit)';

  assert exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tournaments'
      and column_name = 'currency'
  ), 'tournaments.currency doit exister';

  -- Le nouveau statut est accepté…
  assert (
    select pg_get_constraintdef(oid) from pg_constraint
    where conname = 'registrations_status_check'
  ) like '%pending_payment%', 'le statut pending_payment doit être autorisé';

  -- …sans avoir fait disparaître « dropped » (indispensable au classement).
  assert (
    select pg_get_constraintdef(oid) from pg_constraint
    where conname = 'registrations_status_check'
  ) like '%dropped%', 'le statut dropped ne doit pas disparaître';

  assert exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'registrations'
      and column_name = 'payment_deadline'
  ), 'registrations.payment_deadline doit exister';

  -- Tables de paiement présentes et RLS active (sinon fuite de données).
  assert (select relrowsecurity from pg_class where oid = 'public.stripe_accounts'::regclass),
    'la RLS doit être active sur stripe_accounts';

  assert (select relrowsecurity from pg_class where oid = 'public.registration_payments'::regclass),
    'la RLS doit être active sur registration_payments';

  -- Aucune fuite : ni anon ni authenticated ne peuvent écrire les paiements.
  assert not exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'registration_payments'
      and grantee in ('anon', 'authenticated')
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  ), 'registration_payments ne doit accepter aucune écriture côté client';

  assert not exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'stripe_accounts'
      and grantee in ('anon', 'authenticated')
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  ), 'stripe_accounts ne doit accepter aucune écriture côté client';

  -- Le balayeur existe et n'est pas exécutable par le client.
  assert exists (
    select 1 from pg_proc where proname = 'release_unpaid_registrations'
  ), 'la fonction release_unpaid_registrations doit exister';

  assert not has_function_privilege('authenticated', 'public.release_unpaid_registrations()', 'execute'),
    'release_unpaid_registrations ne doit pas être exécutable par authenticated';

  raise notice 'Migration 0023 : assertions OK.';
end;
$$;
