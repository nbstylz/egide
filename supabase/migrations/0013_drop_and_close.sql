-- Migration 0013 : abandon en cours de tournoi et clôture (US-3.8, US-3.9)
--
-- Un joueur qui abandonne conserve les résultats déjà acquis — ils comptent
-- pour ses adversaires — mais n'est plus apparié aux rondes suivantes.

alter table public.registrations
  drop constraint registrations_status_check;

alter table public.registrations
  add constraint registrations_status_check
  check (status in ('registered', 'waitlisted', 'withdrawn', 'checked_in', 'dropped'));

comment on column public.registrations.status is
  'registered : inscrit · waitlisted : liste d''attente · withdrawn : désisté avant le tournoi · checked_in : présent · dropped : a abandonné en cours de tournoi';

/** Retire un joueur du tournoi en cours ; ses résultats sont conservés. */
create or replace function public.drop_player(p_registration_id uuid, p_dropped boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_organizer uuid;
  v_tournament_status text;
  v_status text;
begin
  if v_caller is null then
    raise exception 'Il faut être connecté.';
  end if;

  select t.organizer_id, t.status, r.status
  into v_organizer, v_tournament_status, v_status
  from public.registrations r
  join public.tournaments t on t.id = r.tournament_id
  where r.id = p_registration_id;

  if v_organizer is null then
    raise exception 'Inscription introuvable.';
  end if;
  if v_organizer <> v_caller then
    raise exception 'Seul l''organisateur peut faire abandonner un joueur.';
  end if;
  if v_tournament_status <> 'in_progress' then
    raise exception 'L''abandon ne concerne qu''un tournoi en cours.';
  end if;

  if p_dropped then
    if v_status <> 'checked_in' then
      raise exception 'Ce joueur ne participe pas au tournoi.';
    end if;
    update public.registrations
    set status = 'dropped', updated_at = now()
    where id = p_registration_id;
  else
    -- Retour en jeu : l'organisateur peut corriger une erreur.
    if v_status <> 'dropped' then
      raise exception 'Ce joueur n''a pas abandonné.';
    end if;
    update public.registrations
    set status = 'checked_in', updated_at = now()
    where id = p_registration_id;
  end if;
end;
$$;

/** Clôt définitivement le tournoi : le classement devient final. */
create or replace function public.close_tournament(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_organizer uuid;
  v_status text;
  v_rounds_count integer;
  v_played integer;
  v_open_rounds integer;
  v_missing integer;
begin
  if v_caller is null then
    raise exception 'Il faut être connecté.';
  end if;

  select organizer_id, status, rounds_count
  into v_organizer, v_status, v_rounds_count
  from public.tournaments where id = p_tournament_id
  for update;

  if v_organizer is null then
    raise exception 'Tournoi introuvable.';
  end if;
  if v_organizer <> v_caller then
    raise exception 'Seul l''organisateur peut clôturer le tournoi.';
  end if;
  if v_status = 'completed' then
    raise exception 'TOURNAMENT_ALREADY_CLOSED';
  end if;
  if v_status <> 'in_progress' then
    raise exception 'Ce tournoi n''est pas en cours.';
  end if;

  select count(*), count(*) filter (where status <> 'completed')
  into v_played, v_open_rounds
  from public.rounds where tournament_id = p_tournament_id;

  -- Toutes les tables doivent avoir un score, y compris celles de la
  -- dernière ronde : le classement final en dépend.
  select count(*) into v_missing
  from public.pairings p
  join public.rounds r on r.id = p.round_id
  where r.tournament_id = p_tournament_id and p.score_a is null;

  if v_missing > 0 then
    raise exception 'MISSING_SCORES:%', v_missing;
  end if;

  update public.rounds
  set status = 'completed'
  where tournament_id = p_tournament_id and status <> 'completed';

  update public.tournaments
  set status = 'completed', updated_at = now()
  where id = p_tournament_id;
end;
$$;

-- Le classement signale les abandons, sans les déclasser : leurs résultats
-- restent acquis.
drop function if exists public.tournament_standings(uuid);

create or replace function public.tournament_standings(p_tournament_id uuid)
returns table (
  rank integer,
  player_id uuid,
  pseudo text,
  faction_favorite text,
  played integer,
  wins integer,
  draws integer,
  losses integer,
  points_for integer,
  points_against integer,
  point_diff integer,
  tactics integer,
  win_score numeric,
  opponents_wins numeric,
  dropped boolean
)
language sql
stable
set search_path = public
as $$
  with results as (
    select * from public.player_results where tournament_id = p_tournament_id
  ),
  totals as (
    select r.player_id,
           count(*)::int as played,
           (count(*) filter (where r.points_for > r.points_against)
            + count(*) filter (where r.points_for = r.points_against) * 0.5) as win_score,
           count(*) filter (where r.points_for > r.points_against)::int as wins,
           count(*) filter (where r.points_for = r.points_against)::int as draws,
           count(*) filter (where r.points_for < r.points_against)::int as losses,
           coalesce(sum(r.points_for), 0)::int as points_for,
           coalesce(sum(r.points_against), 0)::int as points_against,
           coalesce(sum(r.tactics), 0)::int as tactics
    from results r
    group by r.player_id
  ),
  wins_by_player as (
    select player_id,
           (count(*) filter (where points_for > points_against)
            + count(*) filter (where points_for = points_against) * 0.5) as wins
    from results group by player_id
  ),
  sos as (
    select r.player_id, coalesce(sum(w.wins), 0) as opponents_wins
    from results r
    left join wins_by_player w on w.player_id = r.opponent_id
    where r.opponent_id is not null
    group by r.player_id
  )
  select row_number() over (
           order by t.win_score desc,
                    t.points_for desc,
                    t.tactics desc,
                    (t.points_for - t.points_against) desc,
                    coalesce(s.opponents_wins, 0) desc,
                    md5(t.player_id::text || p_tournament_id::text)
         )::int as rank,
         t.player_id,
         pr.pseudo,
         pr.faction_favorite,
         t.played,
         t.wins,
         t.draws,
         t.losses,
         t.points_for,
         t.points_against,
         (t.points_for - t.points_against)::int as point_diff,
         t.tactics,
         t.win_score,
         coalesce(s.opponents_wins, 0) as opponents_wins,
         coalesce(reg.status = 'dropped', false) as dropped
  from totals t
  join public.profiles pr on pr.id = t.player_id
  left join sos s on s.player_id = t.player_id
  left join public.registrations reg
    on reg.player_id = t.player_id and reg.tournament_id = p_tournament_id
  order by rank;
$$;

revoke execute on function public.drop_player(uuid, boolean) from public, anon;
revoke execute on function public.close_tournament(uuid) from public, anon;
grant execute on function public.drop_player(uuid, boolean) to authenticated;
grant execute on function public.close_tournament(uuid) to authenticated;
grant execute on function public.tournament_standings(uuid) to authenticated, anon;
