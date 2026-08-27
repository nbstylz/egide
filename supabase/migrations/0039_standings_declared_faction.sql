-- Migration 0039 : le classement montre la faction jouée, pas la préférée (US-9.3c)
--
-- `tournament_standings` renvoyait `profiles.faction_favorite`. Cette colonne
-- dit « ce que j'aime jouer », pas « ce que j'ai aligné ce jour-là » — et elle
-- s'affichait partout dans un contexte de tournoi : classement mobile,
-- classement du back office, modale de clôture, export CSV. Une préférence de
-- profil y tenait lieu d'armée réellement jouée.
--
-- Elle est remplacée par `registrations.faction`, la déclaration du joueur
-- (0038). La colonne change donc de nom en même temps que de source : garder
-- `faction_favorite` sur une valeur qui n'est plus la favorite aurait été le
-- même mensonge, déplacé d'un cran.
--
-- Le classement ne fabrique rien : sans déclaration, la colonne est nulle et
-- l'écran n'affiche rien. Mieux vaut ne rien montrer que raconter une histoire
-- fausse.
--
-- Piège 13 du dépôt : `create or replace` refuse un changement de type de
-- retour, d'où le `drop function` préalable. La jointure sur `registrations`
-- existait déjà (elle sert aux abandons) : rien à ajouter au plan de requête.

drop function if exists public.tournament_standings(uuid);

create function public.tournament_standings(p_tournament_id uuid)
returns table (
  rank integer,
  player_id uuid,
  pseudo text,
  /** Faction déclarée pour CE tournoi, ou null si le joueur n'a rien déclaré. */
  faction text,
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
  dropped boolean,
  dropped_round integer
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
         reg.faction,
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
         coalesce(reg.status = 'dropped', false) as dropped,
         reg.dropped_round
  from totals t
  join public.profiles pr on pr.id = t.player_id
  left join sos s on s.player_id = t.player_id
  left join public.registrations reg
    on reg.player_id = t.player_id and reg.tournament_id = p_tournament_id
  order by rank;
$$;

revoke execute on function public.tournament_standings(uuid) from public;
grant execute on function public.tournament_standings(uuid) to authenticated, anon;

-- L'historique n'a plus besoin d'aller chercher la faction lui-même : le
-- classement la porte désormais. Une source de moins à tenir cohérente.

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
    p.faction
  from per_tournament p
  where p.player_id = p_player_id
  order by p.event_date desc;
$$;

revoke execute on function public.player_history(uuid) from public, anon;
grant execute on function public.player_history(uuid) to authenticated;
