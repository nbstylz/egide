-- Migration 0025 : rend `circuit_standings` lisible par un visiteur non connecté
--
-- La page publique /circuit/:id appelle `circuit_standings` sans compte (rôle
-- `anon`). En `security invoker`, la fonction s'exécutait avec les droits de
-- l'anonyme : or la table `profiles` n'est lisible que par les comptes
-- connectés (politique de la migration 0001), et le classement fait un
-- `join profiles` pour le pseudo. Conséquence : classement VIDE pour un
-- visiteur non connecté, alors que toutes les autres données (tournois,
-- appariements, résultats) lui sont accessibles.
--
-- On passe la fonction en `security definer`. Elle ne renvoie que des données
-- de classement déjà destinées au public (pseudo, région, points agrégés) et
-- filtre explicitement les tournois `completed` : aucune fuite au-delà de ce
-- qu'un classement de tournoi expose déjà. Même schéma que les nombreuses
-- fonctions publiques `security definer` de l'app.
--
-- (Note : le même mécanisme affecte `tournament_standings` pour un visiteur
--  réellement anonyme ; à traiter séparément si l'on veut des classements de
--  tournoi visibles hors connexion. Hors périmètre de cette migration.)

create or replace function public.circuit_standings(p_circuit_id uuid)
returns table (
  rank integer,
  player_id uuid,
  pseudo text,
  region text,
  circuit_points numeric,
  tournaments_counted integer,
  tournaments_played integer,
  best_result integer
)
language sql
stable
security definer
set search_path = public
as $$
  with circ as (
    select * from public.circuits where id = p_circuit_id
  ),
  elig as (
    select t.id
    from public.tournaments t
    cross join circ c
    where t.status = 'completed'
      and t.type = 'individual'
      and t.event_date between c.start_date and c.end_date
      and (c.region is null or t.region = c.region)
  ),
  per_tournament as (
    select e.id as tournament_id,
           s.player_id,
           s.rank,
           count(*) over (partition by e.id) as field_size
    from elig e
    cross join lateral public.tournament_standings(e.id) s
  ),
  scored as (
    select player_id,
           tournament_id,
           (field_size - rank + 1)::numeric as pts
    from per_tournament
  ),
  ranked_results as (
    select player_id, tournament_id, pts,
           row_number() over (partition by player_id order by pts desc) as rn,
           count(*) over (partition by player_id) as played
    from scored
  ),
  best as (
    select r.player_id,
           sum(r.pts) filter (where r.rn <= (select best_n from circ)) as circuit_points,
           count(*) filter (where r.rn <= (select best_n from circ))::int as tournaments_counted,
           max(r.played)::int as tournaments_played,
           max(r.pts)::int as best_result
    from ranked_results r
    group by r.player_id
  )
  select row_number() over (
           order by b.circuit_points desc,
                    b.tournaments_counted desc,
                    b.best_result desc,
                    md5(b.player_id::text || p_circuit_id::text)
         )::int as rank,
         b.player_id,
         pr.pseudo,
         pr.region,
         b.circuit_points,
         b.tournaments_counted,
         b.tournaments_played,
         b.best_result
  from best b
  join public.profiles pr on pr.id = b.player_id
  order by rank;
$$;

grant execute on function public.circuit_standings(uuid) to authenticated, anon;

do $$
begin
  assert (
    select prosecdef from pg_proc where proname = 'circuit_standings'
  ), 'circuit_standings doit être en security definer';
  raise notice 'Migration 0025 : circuit_standings est désormais public (security definer).';
end;
$$;
