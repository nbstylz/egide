-- Migration 0038 : la faction se déclare sur l'inscription (US-9.3a)
--
-- Jusqu'ici la faction n'existait qu'à un seul endroit : `army_lists.faction`,
-- donc uniquement pour les joueurs ayant soumis une liste d'armée. Les tournois
-- qui n'en demandent pas ne produisaient aucune faction, et le bloc
-- « Factions jouées » de l'historique restait dominé par « non renseignée ».
--
-- Elle rejoint donc l'inscription, où elle a toujours eu sa place : on aligne
-- une armée à un tournoi, pas à une liste. `registrations.faction` devient la
-- source de vérité ; `army_lists.faction` reste alimentée comme trace, mais
-- plus personne ne la lit pour statuer.
--
-- Deux règles tranchées par le porteur le 27 août 2026 :
--
-- 1. Visible des membres connectés, jamais des visiteurs anonymes. C'est le
--    niveau où se trouve déjà la faction favorite (`profiles` est réservée aux
--    connectés). En AoS le secret qui compte est le *contenu* de la liste —
--    unités, artefacts, manifestations — pas le nom de l'armée : c'est bien ce
--    que protège la 0018, et elle continue de le protéger.
-- 2. Combler oui, réécrire non. Tant que le tournoi est ouvert, on déclare et
--    on modifie librement. Une fois lancé, on peut encore renseigner une
--    faction absente — combler un trou n'a jamais falsifié personne — mais plus
--    changer celle qui a déjà été annoncée aux adversaires.

-- ---------------------------------------------------------------------------
-- 1. La liste fermée des factions, en base
-- ---------------------------------------------------------------------------
-- Elle vivait seulement dans `src/lib/factions.ts`. Trois raisons de la poser
-- ici : le back office n'a aucune copie de ce fichier et en aura besoin
-- (US-9.4) ; une clé étrangère refuse le texte libre bien mieux qu'une
-- validation côté client ; et une faction se renomme parfois d'une édition à
-- l'autre, ce que `on update cascade` propage sans réécrire l'historique.
--
-- MIROIR DE `src/lib/factions.ts` : les deux changent dans le même commit.

create table public.factions (
  name text primary key,
  alliance text not null check (alliance in ('Order', 'Chaos', 'Death', 'Destruction')),
  -- Rang d'affichage à l'intérieur d'une alliance ; laisse la place aux ajouts.
  position integer not null
);

insert into public.factions (name, alliance, position) values
  ('Cities of Sigmar',       'Order', 10),
  ('Daughters of Khaine',    'Order', 20),
  ('Fyreslayers',            'Order', 30),
  ('Idoneth Deepkin',        'Order', 40),
  ('Kharadron Overlords',    'Order', 50),
  ('Lumineth Realm-lords',   'Order', 60),
  ('Seraphon',               'Order', 70),
  ('Stormcast Eternals',     'Order', 80),
  ('Sylvaneth',              'Order', 90),
  ('Blades of Khorne',       'Chaos', 10),
  ('Disciples of Tzeentch',  'Chaos', 20),
  ('Hedonites of Slaanesh',  'Chaos', 30),
  ('Helsmiths of Hashut',    'Chaos', 40),
  ('Maggotkin of Nurgle',    'Chaos', 50),
  ('Skaven',                 'Chaos', 60),
  ('Slaves to Darkness',     'Chaos', 70),
  ('Flesh-eater Courts',     'Death', 10),
  ('Nighthaunt',             'Death', 20),
  ('Ossiarch Bonereapers',   'Death', 30),
  ('Soulblight Gravelords',  'Death', 40),
  ('Gloomspite Gitz',        'Destruction', 10),
  ('Ogor Mawtribes',         'Destruction', 20),
  ('Orruk Warclans',         'Destruction', 30),
  ('Sons of Behemat',        'Destruction', 40);

alter table public.factions enable row level security;

-- Référentiel public : l'annuaire d'un visiteur non connecté peut vouloir
-- nommer une faction, et il n'y a rien à y protéger.
create policy "Le référentiel des factions est public"
  on public.factions for select
  to authenticated, anon
  using (true);

-- Aucune politique d'écriture : la liste évolue par migration, pas par client.
grant select on public.factions to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 2. La colonne, et sa reprise depuis les listes existantes
-- ---------------------------------------------------------------------------

alter table public.registrations
  add column faction text references public.factions (name) on update cascade;

comment on column public.registrations.faction is
  'Faction alignée à ce tournoi, déclarée par le joueur. Source de vérité des statistiques.';

-- Reprise : les factions déjà déclarées sur une liste d'armée rejoignent leur
-- inscription. Sans cette étape, l'historique se viderait le temps d'une
-- migration — et l'US se paierait d'une régression visible.
update public.registrations r
   set faction = nullif(btrim(a.faction), '')
  from public.army_lists a
 where a.registration_id = r.id
   and nullif(btrim(a.faction), '') is not null
   and exists (select 1 from public.factions f where f.name = btrim(a.faction));

-- ---------------------------------------------------------------------------
-- 3. Confidentialité : RLS filtre les lignes, jamais les colonnes (piège 0016)
-- ---------------------------------------------------------------------------
-- `registrations` est lisible par `anon` (l'annuaire affiche les places
-- restantes sans compte). Un `grant select` de table aurait donc offert la
-- faction au premier visiteur venu. On repasse colonne par colonne.
--
-- RÈGLE PERMANENTE QUI EN DÉCOULE : toute colonne ajoutée désormais à
-- `registrations` est privée par défaut. Pour la rendre publique, il faut un
-- `grant` explicite dans une migration — donc un geste réfléchi.

revoke select on public.registrations from anon;
grant select (
  id, tournament_id, player_id, status,
  created_at, updated_at, promoted_at, dropped_round, payment_deadline
) on public.registrations to anon;

-- ---------------------------------------------------------------------------
-- 4. Écriture : plus aucune main directe sur la table
-- ---------------------------------------------------------------------------
-- La 0001 avait accordé UPDATE sur `profiles` entière ; la colonne `role` de la
-- 0028 est devenue modifiable par son propriétaire, et chacun pouvait se nommer
-- administrateur. Le même piège attendait ici : `registrations` porte un
-- `GRANT UPDATE` de table, dont toute colonne nouvelle hérite.
--
-- Le remède est plus simple qu'en 0028 : aucun client n'écrit directement dans
-- cette table — inscription, désistement, pointage, promotion, abandon et
-- retrait passent tous par des fonctions `security definer`. On retire donc le
-- droit au lieu de le découper.

revoke update on public.registrations from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. « Combler oui, réécrire non », garanti en base
-- ---------------------------------------------------------------------------
-- Le point 4 suffit aujourd'hui. Ce garde-fou existe pour demain : le jour où
-- quelqu'un re-accordera un UPDATE pour une fonctionnalité sans rapport, la
-- règle tiendra toujours. Une règle qui ne vit que dans l'écran n'est pas une
-- règle, c'est une politesse.

create or replace function public.guard_registration_faction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament_status text;
begin
  if new.faction is not distinct from old.faction then
    return new;
  end if;

  select t.status into v_tournament_status
  from public.tournaments t where t.id = new.tournament_id;

  -- Renseigner une faction absente reste possible après le lancement : c'est
  -- justement une fois le tournoi joué que le joueur découvre le trou dans ses
  -- statistiques. Changer une faction déjà annoncée, non : les adversaires
  -- l'ont vue sur les tables.
  if v_tournament_status <> 'open' and old.faction is not null then
    raise exception 'FACTION_LOCKED';
  end if;

  return new;
end;
$$;

create trigger registrations_faction_guard
  before update on public.registrations
  for each row execute function public.guard_registration_faction();

-- ---------------------------------------------------------------------------
-- 6. La porte du joueur
-- ---------------------------------------------------------------------------

create or replace function public.set_registration_faction(
  p_tournament_id uuid,
  p_faction text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_registration uuid;
  v_reg_status text;
  v_current text;
  v_tournament_status text;
  v_faction text := nullif(btrim(coalesce(p_faction, '')), '');
begin
  if v_caller is null then
    raise exception 'Il faut être connecté.';
  end if;

  select r.id, r.status, r.faction, t.status
    into v_registration, v_reg_status, v_current, v_tournament_status
  from public.registrations r
  join public.tournaments t on t.id = r.tournament_id
  where r.tournament_id = p_tournament_id
    and r.player_id = v_caller;

  if v_registration is null or v_reg_status = 'withdrawn' then
    raise exception 'NOT_REGISTERED';
  end if;

  if v_faction is not null
     and not exists (select 1 from public.factions f where f.name = v_faction) then
    raise exception 'UNKNOWN_FACTION';
  end if;

  -- Une liste validée engage la parole de l'organisation : la faction est
  -- figée avec elle, quel que soit le statut du tournoi.
  if exists (
    select 1 from public.army_lists a
    where a.registration_id = v_registration and a.status = 'approved'
  ) then
    raise exception 'LIST_APPROVED';
  end if;

  -- Même règle que le trigger, énoncée ici pour que le message d'erreur soit le
  -- bon dès l'appel : on comble, on ne réécrit pas. Effacer sa déclaration est
  -- aussi une réécriture.
  if v_tournament_status <> 'open' and (v_current is not null or v_faction is null) then
    raise exception 'FACTION_LOCKED';
  end if;

  update public.registrations
     set faction = v_faction,
         updated_at = now()
   where id = v_registration;
end;
$$;

revoke execute on function public.set_registration_faction(uuid, text) from public, anon;
grant execute on function public.set_registration_faction(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Un seul champ, deux portes
-- ---------------------------------------------------------------------------
-- Le formulaire de liste d'armée demande déjà la faction. Il écrit désormais la
-- même colonne, dans la même transaction : dans la tête du joueur il n'y a
-- qu'une faction, l'app ne doit pas lui en inventer deux.
--
-- Nouveauté par rapport à la 0018 : la faction transmise doit appartenir au
-- référentiel. Le client la choisit déjà dans une liste fermée ; refuser ici
-- rend la garantie vraie même si un jour un autre client appelle la fonction.

create or replace function public.submit_army_list(
  p_tournament_id uuid,
  p_content text,
  p_faction text default null::text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_registration uuid;
  v_reg_status text;
  v_tournament_status text;
  v_current text;
  v_faction text := nullif(btrim(coalesce(p_faction, '')), '');
begin
  if v_caller is null then
    raise exception 'Il faut être connecté.';
  end if;
  if char_length(coalesce(trim(p_content), '')) = 0 then
    raise exception 'La liste est vide.';
  end if;

  select r.id, r.status, t.status into v_registration, v_reg_status, v_tournament_status
  from public.registrations r
  join public.tournaments t on t.id = r.tournament_id
  where r.tournament_id = p_tournament_id and r.player_id = v_caller;

  if v_registration is null then
    raise exception 'NOT_REGISTERED';
  end if;
  if v_reg_status not in ('registered', 'checked_in') then
    raise exception 'NOT_REGISTERED';
  end if;
  if v_tournament_status <> 'open' then
    raise exception 'SUBMISSIONS_CLOSED';
  end if;

  if v_faction is not null
     and not exists (select 1 from public.factions f where f.name = v_faction) then
    raise exception 'UNKNOWN_FACTION';
  end if;

  select status into v_current from public.army_lists where registration_id = v_registration;
  if v_current = 'approved' then
    raise exception 'LIST_APPROVED';
  end if;

  insert into public.army_lists (registration_id, content, faction)
  values (v_registration, trim(p_content), v_faction)
  on conflict (registration_id) do update
  set content = excluded.content,
      faction = excluded.faction,
      status = 'submitted',
      organizer_comment = null,
      reviewed_at = null,
      submitted_at = now(),
      updated_at = now();

  -- La liste fait foi sur la faction : le joueur vient de la confirmer en
  -- soumettant. Il n'a pas provoqué un conflit, il a changé d'avis.
  update public.registrations
     set faction = v_faction,
         updated_at = now()
   where id = v_registration
     and faction is distinct from v_faction;
end;
$$;

revoke execute on function public.submit_army_list(uuid, text, text) from public, anon;
grant execute on function public.submit_army_list(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. L'historique lit la déclaration
-- ---------------------------------------------------------------------------
-- La 0037 lisait `army_lists.faction` sous RLS, ce qui rendait la faction
-- invisible dans l'historique d'un tiers. Elle vient maintenant de
-- `registrations`, lisible par tout membre connecté : c'est la conséquence
-- assumée de l'arbitrage du 27 août, pas un oubli.
--
-- `player_history` reste `security invoker`, et `anon` perd donc le droit de
-- l'exécuter : sans accès à la colonne `faction`, l'appel échouerait sur une
-- erreur de permission plutôt que de renvoyer une ligne incomplète. Aucun écran
-- ne l'appelle sans session (`/historique` est derrière l'authentification).

create or replace function public.player_history(p_player_id uuid)
returns table (
  tournament_id uuid,
  name text,
  city text,
  region text,
  event_date date,
  status text,
  rounds_count integer,
  points_limit integer,
  field_size bigint,
  rank integer,
  played integer,
  wins integer,
  draws integer,
  losses integer,
  points_for integer,
  points_against integer,
  dropped boolean,
  /** Faction déclarée sur l'inscription, ou null si le joueur n'a rien déclaré. */
  faction text
)
language sql
security invoker
stable
set search_path = public
as $$
  with mine as (
    select distinct t.id, t.name, t.city, t.region, t.event_date,
           t.status, t.rounds_count, t.points_limit
    from public.tournaments t
    join public.registrations r on r.tournament_id = t.id
    where r.player_id = p_player_id
      and t.status in ('in_progress', 'completed')
  ),
  per_tournament as (
    select m.id as tournament_id,
           m.name, m.city, m.region, m.event_date,
           m.status, m.rounds_count, m.points_limit,
           count(*) over (partition by m.id) as field_size,
           s.*
    from mine m
    cross join lateral public.tournament_standings(m.id) s
  )
  select
    p.tournament_id, p.name, p.city, p.region, p.event_date, p.status,
    p.rounds_count, p.points_limit, p.field_size,
    p.rank, p.played, p.wins, p.draws, p.losses, p.points_for, p.points_against,
    p.dropped,
    (
      select r.faction
      from public.registrations r
      where r.tournament_id = p.tournament_id
        and r.player_id = p_player_id
      limit 1
    ) as faction
  from per_tournament p
  where p.player_id = p_player_id
  order by p.event_date desc;
$$;

revoke execute on function public.player_history(uuid) from public, anon;
grant execute on function public.player_history(uuid) to authenticated;
