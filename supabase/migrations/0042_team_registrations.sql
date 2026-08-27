-- Migration 0042 : inscription d'une équipe à un tournoi (US-7.2)
--
-- LE CHOIX DE MODÈLE DE TOUT L'EPIC-7, en une phrase : `team_registrations` se
-- pose **au-dessus** de `registrations`, elle ne la remplace pas. Chaque joueur
-- d'un roster reste une ligne de `registrations` ordinaire, simplement
-- rattachée à l'inscription de son équipe.
--
-- Ce que cela fait fonctionner sans une ligne réécrite : le pointage
-- (`set_check_in`), la saisie des scores (`set_pairing_score`), la vue
-- `player_results`, le classement individuel, les listes d'armées, la faction
-- déclarée (0038-0040), l'historique du joueur, l'écran des tables, le bloc
-- « Le jour J » et les notifications de ronde.
--
-- Des tables parallèles auraient imposé deux sources de vérité pour « à quelle
-- table je joue », deux classements individuels, deux historiques, deux
-- exports. Le vrai coût n'aurait pas été de les écrire : c'est le jour où deux
-- copies d'une même règle divergent en silence.
--
-- Deuxième principe, hérité du reste du projet : **une équipe entre ou attend
-- en entier**. Jamais deux joueurs inscrits et un troisième en liste d'attente.
-- La capacité d'un tournoi par équipes se compte donc en équipes (0041).

-- ---------------------------------------------------------------------------
-- 1. L'inscription d'une équipe
-- ---------------------------------------------------------------------------

create table public.team_registrations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  -- Le capitaine au moment de l'inscription : le capitanat peut se transmettre
  -- (migration 0015), on garde qui a engagé l'équipe.
  captain_id uuid not null references public.profiles (id) on delete restrict,
  status text not null default 'registered'
    check (status in ('registered', 'waitlisted', 'withdrawn', 'checked_in')),
  promoted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Une équipe ne s'inscrit qu'une fois à un tournoi donné.
  unique (tournament_id, team_id)
);

create index team_registrations_tournament_idx
  on public.team_registrations (tournament_id, status);
create index team_registrations_team_idx on public.team_registrations (team_id);

alter table public.team_registrations enable row level security;

-- Lecture publique, comme `registrations` : l'annuaire doit afficher « 6 / 12
-- équipes » à un visiteur sans compte. Rien de secret ici — l'équipe, son
-- capitaine et son statut sont déjà publics par ailleurs.
create policy "Les inscriptions d'équipe sont visibles par tous"
  on public.team_registrations for select
  to authenticated, anon
  using (true);

-- Aucune politique d'écriture : tout passe par les fonctions ci-dessous.
grant select on public.team_registrations to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 2. Le rattachement des joueurs
-- ---------------------------------------------------------------------------
-- RÈGLE PERMANENTE DE LA 0038 appliquée : `anon` a des droits COLONNE PAR
-- COLONNE sur `registrations`. Les deux colonnes ajoutées ici ne lui sont donc
-- pas accordées, et restent privées par défaut. C'est le bon défaut : la
-- composition d'un roster se lit sur la fiche du tournoi par un membre
-- connecté, pas par un moteur de recherche.

alter table public.registrations
  add column team_registration_id uuid references public.team_registrations (id) on delete cascade,
  add column roster_position integer;

alter table public.registrations
  add constraint registrations_roster_position_valid
  check (roster_position is null or roster_position between 1 and 8);

create index registrations_team_registration_idx
  on public.registrations (team_registration_id);

comment on column public.registrations.team_registration_id is
  'Inscription d''équipe dont ce joueur fait partie, ou null en tournoi individuel.';
comment on column public.registrations.roster_position is
  'Rang du joueur dans le roster (1..N). Sert d''appariement de repli avant l''écran capitaines.';

-- ---------------------------------------------------------------------------
-- 3. Combien d'équipes occupent réellement une place
-- ---------------------------------------------------------------------------

create or replace function public.team_slots_taken(p_tournament_id uuid)
returns integer
language sql
stable
set search_path = public
as $$
  select count(*)::int
  from public.team_registrations tr
  where tr.tournament_id = p_tournament_id
    and tr.status in ('registered', 'checked_in');
$$;

revoke execute on function public.team_slots_taken(uuid) from public;
grant execute on function public.team_slots_taken(uuid) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 4. Promouvoir la première équipe en attente
-- ---------------------------------------------------------------------------
-- Interne : appelée après tout retrait. Une équipe promue l'est en entier,
-- avec toutes ses lignes joueur.

create or replace function public.promote_waitlist_team(p_tournament_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capacity integer;
  v_next uuid;
begin
  select capacity into v_capacity from public.tournaments where id = p_tournament_id;
  if v_capacity is null then
    return null;
  end if;
  if public.team_slots_taken(p_tournament_id) >= v_capacity then
    return null;
  end if;

  -- L'ordre d'arrivée fait la file d'attente, comme pour les joueurs (0004).
  select id into v_next
  from public.team_registrations
  where tournament_id = p_tournament_id and status = 'waitlisted'
  order by created_at
  limit 1;

  if v_next is null then
    return null;
  end if;

  update public.team_registrations
     set status = 'registered', promoted_at = now(), updated_at = now()
   where id = v_next;

  update public.registrations
     set status = 'registered', promoted_at = now(), updated_at = now()
   where team_registration_id = v_next;

  return v_next;
end;
$$;

revoke execute on function public.promote_waitlist_team(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. La porte du capitaine
-- ---------------------------------------------------------------------------

create or replace function public.register_team(
  p_tournament_id uuid,
  p_player_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_team uuid;
  v_type text;
  v_status text;
  v_team_size integer;
  v_capacity integer;
  v_new_status text;
  v_registration uuid;
  v_conflict text;
  v_missing text;
  v_count integer;
begin
  if v_caller is null then
    raise exception 'Il faut être connecté.';
  end if;

  -- Le capitaine, et lui seul. Un joueur n'a qu'une équipe (0015), il n'y a
  -- donc rien à choisir : on retrouve l'équipe par son capitanat.
  select id into v_team from public.teams where captain_id = v_caller;
  if v_team is null then
    raise exception 'NOT_CAPTAIN';
  end if;

  -- Verrou sur le tournoi : deux capitaines qui inscrivent en même temps sur
  -- la dernière place doivent être départagés par la base, pas par la chance.
  -- Même remède que la course à la dernière place de la 0004.
  select type, status, team_size, capacity
    into v_type, v_status, v_team_size, v_capacity
  from public.tournaments where id = p_tournament_id for update;

  if v_type is null then
    raise exception 'NOT_FOUND';
  end if;
  if v_type <> 'team' then
    raise exception 'NOT_A_TEAM_TOURNAMENT';
  end if;
  if v_status <> 'open' then
    raise exception 'REGISTRATIONS_CLOSED';
  end if;

  if p_player_ids is null or array_length(p_player_ids, 1) is distinct from v_team_size then
    raise exception 'ROSTER_SIZE:%', v_team_size;
  end if;
  -- Deux fois le même joueur ferait un roster de N lignes pour N-1 personnes.
  select count(distinct pid) into v_count from unnest(p_player_ids) pid;
  if v_count <> v_team_size then
    raise exception 'ROSTER_DUPLICATE';
  end if;

  -- Tous les joueurs doivent appartenir à l'équipe. On nomme le fautif : « un
  -- joueur n'est pas dans ton équipe » enverrait chercher lequel à la main.
  select p.pseudo into v_missing
  from unnest(p_player_ids) pid
  join public.profiles p on p.id = pid
  where not exists (
    select 1 from public.team_members m
    where m.team_id = v_team and m.player_id = pid
  )
  limit 1;
  if v_missing is not null then
    raise exception 'NOT_A_MEMBER:%', v_missing;
  end if;

  -- Déjà inscrit à ce tournoi — seul, ou avec une autre équipe. Le capitaine
  -- ne peut pas désinscrire quelqu'un d'autre : le message dit qui doit agir.
  select p.pseudo into v_conflict
  from unnest(p_player_ids) pid
  join public.registrations r
    on r.tournament_id = p_tournament_id and r.player_id = pid
  join public.profiles p on p.id = pid
  where r.status <> 'withdrawn'
  limit 1;
  if v_conflict is not null then
    raise exception 'PLAYER_ALREADY_REGISTERED:%', v_conflict;
  end if;

  if exists (
    select 1 from public.team_registrations
    where tournament_id = p_tournament_id and team_id = v_team and status <> 'withdrawn'
  ) then
    raise exception 'TEAM_ALREADY_REGISTERED';
  end if;

  -- Complet : l'équipe attend, en entier.
  v_new_status := case
    when public.team_slots_taken(p_tournament_id) >= v_capacity then 'waitlisted'
    else 'registered'
  end;

  insert into public.team_registrations (tournament_id, team_id, captain_id, status)
  values (p_tournament_id, v_team, v_caller, v_new_status)
  on conflict (tournament_id, team_id) do update
    set status = excluded.status,
        captain_id = excluded.captain_id,
        promoted_at = null,
        updated_at = now()
  returning id into v_registration;

  -- Une ligne joueur par membre du roster, dans la même transaction. Une
  -- inscription retirée est réactivée plutôt que dupliquée : l'unicité
  -- (tournament_id, player_id) de la 0003 l'exige, et l'historique y gagne.
  insert into public.registrations (
    tournament_id, player_id, status, team_registration_id, roster_position
  )
  select p_tournament_id, pid, v_new_status, v_registration, pos::int
  from unnest(p_player_ids) with ordinality as t(pid, pos)
  on conflict (tournament_id, player_id) do update
    set status = excluded.status,
        team_registration_id = excluded.team_registration_id,
        roster_position = excluded.roster_position,
        updated_at = now();

  return v_registration;
end;
$$;

revoke execute on function public.register_team(uuid, uuid[]) from public, anon;
grant execute on function public.register_team(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Retirer l'équipe
-- ---------------------------------------------------------------------------

create or replace function public.withdraw_team(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_team uuid;
  v_registration uuid;
  v_status text;
begin
  if v_caller is null then
    raise exception 'Il faut être connecté.';
  end if;

  select id into v_team from public.teams where captain_id = v_caller;
  if v_team is null then
    raise exception 'NOT_CAPTAIN';
  end if;

  select status into v_status from public.tournaments where id = p_tournament_id for update;
  if v_status is null then
    raise exception 'NOT_FOUND';
  end if;
  -- Après le lancement, on n'efface pas une équipe : ses parties existent.
  -- L'abandon individuel (0013) reste le bon outil.
  if v_status <> 'open' then
    raise exception 'REGISTRATIONS_CLOSED';
  end if;

  select id into v_registration
  from public.team_registrations
  where tournament_id = p_tournament_id and team_id = v_team and status <> 'withdrawn';
  if v_registration is null then
    raise exception 'NOT_REGISTERED';
  end if;

  update public.team_registrations
     set status = 'withdrawn', updated_at = now()
   where id = v_registration;

  update public.registrations
     set status = 'withdrawn', updated_at = now()
   where team_registration_id = v_registration;

  perform public.promote_waitlist_team(p_tournament_id);
end;
$$;

revoke execute on function public.withdraw_team(uuid) from public, anon;
grant execute on function public.withdraw_team(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Changer un joueur du roster
-- ---------------------------------------------------------------------------
-- Une blessure, un désistement, un renfort : le capitaine recompose tant que
-- les inscriptions sont ouvertes. La place de l'équipe, elle, ne bouge pas —
-- c'est tout l'intérêt de séparer l'inscription d'équipe du roster.

create or replace function public.update_team_roster(
  p_tournament_id uuid,
  p_player_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_team uuid;
  v_registration uuid;
  v_team_status text;
  v_tournament_status text;
  v_team_size integer;
  v_missing text;
  v_conflict text;
  v_count integer;
begin
  if v_caller is null then
    raise exception 'Il faut être connecté.';
  end if;

  select id into v_team from public.teams where captain_id = v_caller;
  if v_team is null then
    raise exception 'NOT_CAPTAIN';
  end if;

  select t.status, t.team_size into v_tournament_status, v_team_size
  from public.tournaments t where t.id = p_tournament_id;
  if v_tournament_status <> 'open' then
    raise exception 'REGISTRATIONS_CLOSED';
  end if;

  select id, status into v_registration, v_team_status
  from public.team_registrations
  where tournament_id = p_tournament_id and team_id = v_team and status <> 'withdrawn';
  if v_registration is null then
    raise exception 'NOT_REGISTERED';
  end if;

  if p_player_ids is null or array_length(p_player_ids, 1) is distinct from v_team_size then
    raise exception 'ROSTER_SIZE:%', v_team_size;
  end if;
  select count(distinct pid) into v_count from unnest(p_player_ids) pid;
  if v_count <> v_team_size then
    raise exception 'ROSTER_DUPLICATE';
  end if;

  select p.pseudo into v_missing
  from unnest(p_player_ids) pid
  join public.profiles p on p.id = pid
  where not exists (
    select 1 from public.team_members m
    where m.team_id = v_team and m.player_id = pid
  )
  limit 1;
  if v_missing is not null then
    raise exception 'NOT_A_MEMBER:%', v_missing;
  end if;

  -- Un entrant déjà inscrit ailleurs sur ce tournoi bloque, comme à
  -- l'inscription. Les sortants du roster, eux, ne sont pas concernés.
  select p.pseudo into v_conflict
  from unnest(p_player_ids) pid
  join public.registrations r
    on r.tournament_id = p_tournament_id and r.player_id = pid
  join public.profiles p on p.id = pid
  where r.status <> 'withdrawn'
    and (r.team_registration_id is distinct from v_registration)
  limit 1;
  if v_conflict is not null then
    raise exception 'PLAYER_ALREADY_REGISTERED:%', v_conflict;
  end if;

  -- Les sortants quittent le tournoi ; ils gardent leur ligne, retirée.
  update public.registrations
     set status = 'withdrawn',
         team_registration_id = null,
         roster_position = null,
         updated_at = now()
   where team_registration_id = v_registration
     and player_id <> all (p_player_ids);

  insert into public.registrations (
    tournament_id, player_id, status, team_registration_id, roster_position
  )
  select p_tournament_id, pid, v_team_status, v_registration, pos::int
  from unnest(p_player_ids) with ordinality as t(pid, pos)
  on conflict (tournament_id, player_id) do update
    set status = excluded.status,
        team_registration_id = excluded.team_registration_id,
        roster_position = excluded.roster_position,
        updated_at = now();
end;
$$;

revoke execute on function public.update_team_roster(uuid, uuid[]) from public, anon;
grant execute on function public.update_team_roster(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. La taille d'équipe se fige dès la première inscription
-- ---------------------------------------------------------------------------
-- Changer la taille sous les pieds d'équipes déjà inscrites produirait des
-- rosters de la mauvaise taille, sans que rien ne le signale.

create or replace function public.guard_team_size()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.team_size is not distinct from old.team_size then
    return new;
  end if;
  if exists (
    select 1 from public.team_registrations
    where tournament_id = new.id and status <> 'withdrawn'
  ) then
    raise exception 'TEAM_SIZE_LOCKED';
  end if;
  return new;
end;
$$;

create trigger tournaments_team_size_guard
  before update on public.tournaments
  for each row execute function public.guard_team_size();
