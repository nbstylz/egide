-- Migration 0035 : historique des tournois d'un joueur (US-9.1)
--
-- Transformer des résultats épars en une trajectoire : ce qu'un joueur a
-- disputé, où il a fini, et contre quel plateau.
--
-- Rien de nouveau n'est calculé. On rejoue `tournament_standings` par tournoi
-- (départages déjà validés, migrations 0010/0013) et on n'en garde que la
-- ligne du joueur. Réimplémenter le rang ici, c'était se condamner à ce que
-- les deux versions divergent au premier changement de règle.
--
-- `security invoker` : la fonction ne lit que ce que l'appelant a déjà le
-- droit de voir. Les classements sont publics, les brouillons restent cachés
-- par la RLS de la 0002. Élever les droits n'apporterait rien et ouvrirait
-- une fuite là où il n'y en a pas.

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
  /** Nombre de joueurs classés : un 3e sur 40 ne vaut pas un 3e sur 4. */
  field_size bigint,
  rank integer,
  played integer,
  wins integer,
  draws integer,
  losses integer,
  points_for integer,
  points_against integer,
  dropped boolean
)
language sql
security invoker
stable
set search_path = public
as $$
  with mine as (
    -- On ne balaie que les tournois où ce joueur a une inscription : sans ce
    -- filtre, on rejouerait le classement de toute la plateforme.
    select distinct t.id, t.name, t.city, t.region, t.event_date,
           t.status, t.rounds_count, t.points_limit
    from public.tournaments t
    join public.registrations r on r.tournament_id = t.id
    where r.player_id = p_player_id
      and t.status in ('in_progress', 'completed')
  ),
  per_tournament as (
    -- La taille du plateau se compte AVANT de filtrer sur notre joueur :
    -- une fois la ligne isolée, il n'y a plus rien à dénombrer.
    select m.id as tournament_id,
           m.name, m.city, m.region, m.event_date,
           m.status, m.rounds_count, m.points_limit,
           count(*) over (partition by m.id) as field_size,
           s.*
    from mine m
    cross join lateral public.tournament_standings(m.id) s
  )
  select
    tournament_id, name, city, region, event_date, status,
    rounds_count, points_limit, field_size,
    rank, played, wins, draws, losses, points_for, points_against, dropped
  from per_tournament
  where player_id = p_player_id
  -- Le plus récent d'abord : un historique se lit à rebours.
  order by event_date desc;
$$;

revoke execute on function public.player_history(uuid) from public;
grant execute on function public.player_history(uuid) to authenticated, anon;
