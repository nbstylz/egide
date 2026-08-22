-- Migration 0024 : circuits — classement de saison agrégé (fonctionnalité « Circuit FR »)
--
-- Un circuit agrège AUTOMATIQUEMENT les résultats de tous les tournois
-- individuels terminés dont la date tombe dans sa saison (et sa région si
-- elle est définie), en un classement de saison.
--
-- Barème validé avec le porteur du projet le 2026-08-22 :
--   • « place pondérée par la taille » : points d'un joueur sur un tournoi
--     = (nombre de joueurs classés − rang + 1). Gagner un gros tournoi
--     rapporte donc plus que gagner un petit.
--   • on ne retient que les N meilleurs résultats de la saison (best_n).
--   • comptage automatique : aucun rattachement manuel, le circuit est une
--     simple définition (saison + région) au-dessus des tournois existants.
--
-- Rien n'est ajouté au cœur du moteur : on réutilise `tournament_standings`
-- (migration 0010/0013) et la vue `player_results`.
--
-- NB numérotation : PAIEMENTS.md évoque un « 0024 » pour le premium (RevenueCat),
-- non encore construit ; il prendra le prochain numéro libre le jour venu.

-- ---------------------------------------------------------------------------
-- 1. Définition d'un circuit
-- ---------------------------------------------------------------------------

create table public.circuits (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 3 and 80),
  season text not null,                 -- libellé libre, ex. « 2026 »
  region text,                          -- NULL = national (toutes régions)
  start_date date not null,
  end_date date not null,
  -- Nombre de meilleurs résultats retenus par joueur sur la saison.
  best_n integer not null default 4 check (best_n >= 1),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index circuits_dates_idx on public.circuits (start_date, end_date);

alter table public.circuits enable row level security;

-- Lecture publique : un classement de circuit se consulte sans compte,
-- comme les tournois et leurs classements.
create policy "Les circuits sont visibles par tous"
  on public.circuits for select
  to authenticated, anon
  using (true);

create policy "Un utilisateur connecté peut créer un circuit"
  on public.circuits for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "Seul le propriétaire modifie son circuit"
  on public.circuits for update
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Seul le propriétaire supprime son circuit"
  on public.circuits for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

-- ---------------------------------------------------------------------------
-- 2. Classement de circuit
-- ---------------------------------------------------------------------------
--
-- Pour chaque tournoi éligible on rejoue `tournament_standings` (départages
-- déjà validés), on transforme le rang en points de circuit, puis on ne garde
-- que les `best_n` meilleurs résultats de chaque joueur avant d'additionner.
--
-- `security invoker` : la fonction ne lit que des données déjà publiques
-- (tournois terminés, classements, profils), inutile d'élever les droits.
create or replace function public.circuit_standings(p_circuit_id uuid)
returns table (
  rank integer,
  player_id uuid,
  pseudo text,
  region text,
  circuit_points numeric,
  tournaments_counted integer,   -- nb de résultats réellement comptés (≤ best_n)
  tournaments_played integer,    -- nb de tournois joués dans la saison
  best_result integer            -- meilleur total de points sur un seul tournoi
)
language sql
stable
security invoker
set search_path = public
as $$
  with circ as (
    select * from public.circuits where id = p_circuit_id
  ),
  -- Tournois éligibles : individuels, terminés, dans la saison, région ok.
  elig as (
    select t.id
    from public.tournaments t
    cross join circ c
    where t.status = 'completed'
      and t.type = 'individual'
      and t.event_date between c.start_date and c.end_date
      and (c.region is null or t.region = c.region)
  ),
  -- Classement de chaque tournoi + taille du plateau (nb de joueurs classés).
  per_tournament as (
    select e.id as tournament_id,
           s.player_id,
           s.rank,
           count(*) over (partition by e.id) as field_size
    from elig e
    cross join lateral public.tournament_standings(e.id) s
  ),
  -- Barème « place pondérée par la taille ».
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

-- Le classement de circuit est public, comme celui des tournois.
grant execute on function public.circuit_standings(uuid) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 3. Assertions : vérifient le schéma produit
-- ---------------------------------------------------------------------------

do $$
begin
  assert exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'circuits'
  ), 'la table circuits doit exister';

  assert (select relrowsecurity from pg_class where oid = 'public.circuits'::regclass),
    'la RLS doit être active sur circuits';

  -- Lecture publique attendue (anon peut lire), mais pas écrire.
  assert exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'circuits'
      and grantee = 'anon' and privilege_type = 'SELECT'
  ), 'anon doit pouvoir lire les circuits';

  assert exists (
    select 1 from pg_proc where proname = 'circuit_standings'
  ), 'la fonction circuit_standings doit exister';

  assert has_function_privilege('anon', 'public.circuit_standings(uuid)', 'execute'),
    'circuit_standings doit être exécutable publiquement';

  raise notice 'Migration 0024 : assertions OK.';
end;
$$;
