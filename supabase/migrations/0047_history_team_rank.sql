-- Migration 0047 : l'historique dit le rang de l'équipe, pas celui du joueur (US-7.9)
--
-- Dans un tournoi par équipes, les appariements sont **négociés par les
-- capitaines**, pas produits par le système suisse. Un « 3e sur 24 » y serait
-- un rang obtenu sur des adversaires choisis : afficher ce nombre dans un
-- historique, à côté de rangs individuels gagnés en suisse, laisserait croire
-- qu'ils se comparent.
--
-- C'est « mieux vaut ne rien montrer que raconter une histoire fausse »
-- appliqué à un rang. L'historique d'un tournoi par équipes affiche donc le
-- rang de l'ÉQUIPE, son nom, et le bilan personnel du joueur — jamais un rang
-- individuel.
--
-- Le classement individuel d'un tournoi par équipes continue d'exister et reste
-- consultable sur la fiche du tournoi : il n'est pas faux, il est simplement
-- incomparable. Ce sont deux choses différentes.
--
-- Piège 13 du dépôt : le type de retour change, d'où le `drop function`.

drop function if exists public.player_history(uuid);

create function public.player_history(p_player_id uuid)
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
  /** Rang individuel. **Null en tournoi par équipes**, volontairement. */
  rank integer,
  played integer,
  wins integer,
  draws integer,
  losses integer,
  points_for integer,
  points_against integer,
  dropped boolean,
  faction text,
  /** 'individual' ou 'team' : l'écran n'a pas à le deviner. */
  tournament_type text,
  team_name text,
  team_rank integer,
  team_field_size bigint
)
language sql
security invoker
stable
set search_path = public
as $$
  with mine as (
    select distinct t.id, t.name, t.city, t.region, t.event_date,
           t.status, t.rounds_count, t.points_limit, t.type
    from public.tournaments t
    join public.registrations r on r.tournament_id = t.id
    where r.player_id = p_player_id
      and t.status in ('in_progress', 'completed')
  ),
  per_tournament as (
    select m.id as tournament_id,
           m.name, m.city, m.region, m.event_date,
           m.status, m.rounds_count, m.points_limit, m.type,
           count(*) over (partition by m.id) as field_size,
           s.*
    from mine m
    cross join lateral public.tournament_standings(m.id) s
  ),
  my_team as (
    select r.tournament_id, tr.id as team_registration_id, te.name as team_name
    from public.registrations r
    join public.team_registrations tr on tr.id = r.team_registration_id
    join public.teams te on te.id = tr.team_id
    where r.player_id = p_player_id
  ),
  team_ranks as (
    select m.id as tournament_id,
           s.team_registration_id,
           s.rank,
           count(*) over (partition by m.id) as team_field_size
    from mine m
    cross join lateral public.team_standings(m.id) s
    where m.type = 'team'
  )
  select
    p.tournament_id, p.name, p.city, p.region, p.event_date, p.status,
    p.rounds_count, p.points_limit, p.field_size,
    -- Le rang individuel d'un tournoi par équipes ne se compare à rien.
    case when p.type = 'team' then null else p.rank end as rank,
    p.played, p.wins, p.draws, p.losses, p.points_for, p.points_against,
    p.dropped,
    p.faction,
    p.type as tournament_type,
    mt.team_name,
    tr.rank as team_rank,
    tr.team_field_size
  from per_tournament p
  left join my_team mt on mt.tournament_id = p.tournament_id
  left join team_ranks tr
    on tr.tournament_id = p.tournament_id
   and tr.team_registration_id = mt.team_registration_id
  where p.player_id = p_player_id
  order by p.event_date desc;
$$;

revoke execute on function public.player_history(uuid) from public, anon;
grant execute on function public.player_history(uuid) to authenticated;
