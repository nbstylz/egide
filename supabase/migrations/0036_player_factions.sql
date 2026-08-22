-- Migration 0036 : statistiques par faction jouée (US-9.2)
--
-- La faction réellement jouée n'existe qu'à un seul endroit :
-- `army_lists.faction`, renseignée par le joueur au moment de soumettre sa
-- liste. Ni obligatoire, ni systématique.
--
-- On n'utilise PAS `profiles.faction_favorite` en remplacement. C'est la
-- faction déclarée en préférence, pas celle alignée ce jour-là : un joueur
-- qui change d'armée verrait des statistiques fausses. Le projet a déjà
-- tranché plusieurs fois dans ce sens — mieux vaut ne rien montrer que
-- raconter une histoire fausse.
--
-- Conséquence assumée : la couverture est partielle. La fonction renvoie
-- donc aussi de quoi la dire honnêtement (`covered` / `total`), pour que
-- l'écran n'ait pas à deviner combien de tournois manquent à l'appel.
--
-- `security invoker` : la RLS de la 0018 réserve une liste d'armée au joueur
-- et à son organisateur. Un joueur obtient donc ses propres statistiques, et
-- personne n'obtient celles d'un autre. C'est exactement le périmètre voulu
-- pour une section de profil.

create or replace function public.player_factions(p_player_id uuid)
returns table (
  faction text,
  tournaments bigint,
  played bigint,
  wins bigint,
  draws bigint,
  losses bigint,
  points_for bigint
)
language sql
security invoker
stable
set search_path = public
as $$
  with mine as (
    -- Une inscription, sa faction déclarée, sur un tournoi effectivement joué.
    select r.tournament_id,
           nullif(btrim(a.faction), '') as faction
    from public.registrations r
    join public.army_lists a on a.registration_id = r.id
    join public.tournaments t on t.id = r.tournament_id
    where r.player_id = p_player_id
      and t.status = 'completed'
  ),
  -- Les résultats partie par partie, pris à la source commune du classement.
  games as (
    select pr.tournament_id, pr.points_for, pr.points_against
    from public.player_results pr
    where pr.player_id = p_player_id
  )
  select
    m.faction,
    count(distinct m.tournament_id),
    count(g.*),
    count(*) filter (where g.points_for > g.points_against),
    count(*) filter (where g.points_for = g.points_against),
    count(*) filter (where g.points_for < g.points_against),
    coalesce(sum(g.points_for), 0)
  from mine m
  join games g on g.tournament_id = m.tournament_id
  where m.faction is not null
  group by m.faction
  -- La faction la plus jouée d'abord : c'est celle qui dit qui l'on est.
  order by count(g.*) desc, m.faction;
$$;

revoke execute on function public.player_factions(uuid) from public, anon;
grant execute on function public.player_factions(uuid) to authenticated;

/**
 * Couverture des factions : combien de tournois terminés portent une faction
 * renseignée, sur combien de tournois joués. Sans ce rapport, l'écran
 * afficherait des statistiques sans dire sur quelle part elles reposent.
 */
create or replace function public.player_faction_coverage(p_player_id uuid)
returns table (covered bigint, total bigint)
language sql
security invoker
stable
set search_path = public
as $$
  with played as (
    select distinct pr.tournament_id
    from public.player_results pr
    join public.tournaments t on t.id = pr.tournament_id
    where pr.player_id = p_player_id
      and t.status = 'completed'
  )
  select
    count(*) filter (
      where exists (
        select 1
        from public.registrations r
        join public.army_lists a on a.registration_id = r.id
        where r.tournament_id = p.tournament_id
          and r.player_id = p_player_id
          and nullif(btrim(a.faction), '') is not null
      )
    ),
    count(*)
  from played p;
$$;

revoke execute on function public.player_faction_coverage(uuid) from public, anon;
grant execute on function public.player_faction_coverage(uuid) to authenticated;
