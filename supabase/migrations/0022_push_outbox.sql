-- Migration 0022 : file d'attente des notifications (US-6.2 à 6.4)
--
-- Les événements à notifier naissent dans des transactions SQL (promotion de
-- liste d'attente, génération de ronde…) déclenchées par des acteurs variés.
-- Plutôt que d'appeler l'extérieur depuis la base, chaque événement est posé
-- dans `push_outbox` ; la fonction Edge `send-push` la vide et compose les
-- messages. La vider tôt ou tard ne change que le délai de livraison :
-- n'importe quel utilisateur connecté peut le demander sans risque, le
-- contenu ne vient jamais de lui.

-- Préférences de notification (US-6.3 critère 3, US-6.4 critère 2).
alter table public.profiles
  add column notify_region boolean not null default true,
  add column notify_registrations boolean not null default true;

create table public.push_outbox (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (
    kind in ('round_published', 'promoted', 'list_reviewed', 'new_registration', 'tournament_published')
  ),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

-- Personne ne lit ni n'écrit la file directement : triggers en entrée,
-- clé service en sortie.
alter table public.push_outbox enable row level security;

/** Ronde générée : un événement par ronde, pas par table. */
create or replace function public.queue_round_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.push_outbox (kind, payload)
  select 'round_published', jsonb_build_object('round_id', new.round_id)
  where not exists (
    select 1 from public.push_outbox
    where kind = 'round_published' and payload->>'round_id' = new.round_id::text
  );
  return null;
end;
$$;

create trigger push_round_published
  after insert on public.pairings
  for each row execute function public.queue_round_published();

/** Promotion depuis la liste d'attente. */
create or replace function public.queue_promoted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'waitlisted' and new.status = 'registered' then
    insert into public.push_outbox (kind, payload)
    values ('promoted', jsonb_build_object('registration_id', new.id));
  end if;
  return null;
end;
$$;

create trigger push_promoted
  after update on public.registrations
  for each row execute function public.queue_promoted();

/** Liste d'armée validée ou refusée. */
create or replace function public.queue_list_reviewed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('approved', 'rejected') and old.status is distinct from new.status then
    insert into public.push_outbox (kind, payload)
    values ('list_reviewed', jsonb_build_object('list_id', new.id, 'status', new.status));
  end if;
  return null;
end;
$$;

create trigger push_list_reviewed
  after update on public.army_lists
  for each row execute function public.queue_list_reviewed();

/** Nouvelle inscription : l'organisateur peut vouloir le savoir. */
create or replace function public.queue_new_registration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('registered', 'waitlisted') then
    insert into public.push_outbox (kind, payload)
    values ('new_registration', jsonb_build_object('registration_id', new.id));
  end if;
  return null;
end;
$$;

create trigger push_new_registration
  after insert on public.registrations
  for each row execute function public.queue_new_registration();

/**
 * Tournoi publié : alerte régionale, une seule fois par tournoi — une
 * modification ultérieure ne refait pas d'événement (US-6.4 critère 3).
 */
create or replace function public.queue_tournament_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'open' and (tg_op = 'INSERT' or old.status = 'draft') then
    insert into public.push_outbox (kind, payload)
    select 'tournament_published', jsonb_build_object('tournament_id', new.id)
    where not exists (
      select 1 from public.push_outbox
      where kind = 'tournament_published'
        and payload->>'tournament_id' = new.id::text
    );
  end if;
  return null;
end;
$$;

create trigger push_tournament_published
  after insert or update on public.tournaments
  for each row execute function public.queue_tournament_published();
