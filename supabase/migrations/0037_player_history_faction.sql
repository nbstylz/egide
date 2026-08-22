-- Migration 0037 : la faction rejoint l'historique (US-9.2)
--
-- La 0036 avait sorti deux fonctions dédiées (`player_factions`,
-- `player_faction_coverage`). On les retire : l'écran d'historique charge
-- déjà `player_history`, et trois appels réseau pour une même page, c'est
-- trois états de chargement et trois façons d'échouer. La faction devient
-- une colonne de l'historique ; l'agrégation par faction se fait côté client
-- sur une quinzaine de lignes, et la couverture s'en déduit sans rien
-- demander de plus.
--
-- Bénéfice second : la faction est désormais disponible pour la ligne
-- d'historique elle-même, si on veut un jour l'y afficher.
--
-- ATTENTION : la valeur reste celle saisie à l'époque, potentiellement en
-- texte libre pour les listes antérieures au sélecteur fermé. C'est
-- `matchFaction()` (src/lib/factions.ts) qui la ramène à l'entrée officielle
-- côté client, et qui renvoie null si rien ne correspond — mieux vaut
-- « faction non renseignée » qu'un regroupement faux.

drop function if exists public.player_factions(uuid);
drop function if exists public.player_faction_coverage(uuid);

-- `create or replace` refuse un changement de type de retour : ajouter une
-- colonne à une fonction table impose de la supprimer d'abord.
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
  rank integer,
  played integer,
  wins integer,
  draws integer,
  losses integer,
  points_for integer,
  points_against integer,
  dropped boolean,
  /** Faction déclarée sur la liste d'armée, ou null si aucune liste. */
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
    -- `security invoker` + RLS de la 0018 : on ne lit ici que ses propres
    -- listes. L'historique d'un tiers n'exposerait aucune faction.
    (
      select nullif(btrim(a.faction), '')
      from public.registrations r
      join public.army_lists a on a.registration_id = r.id
      where r.tournament_id = p.tournament_id
        and r.player_id = p_player_id
      limit 1
    ) as faction
  from per_tournament p
  where p.player_id = p_player_id
  order by p.event_date desc;
$$;

revoke execute on function public.player_history(uuid) from public;
grant execute on function public.player_history(uuid) to authenticated, anon;
