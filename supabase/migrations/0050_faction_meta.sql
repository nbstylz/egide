-- Migration 0050 : statistiques méta par faction (US-11.3)
--
-- C'est ici que revient le taux de victoire, renvoyé par l'US-9.2 : sur cinq
-- parties, « 60 % de victoires » couvre en réalité de 15 % à 95 % et n'informe
-- pas. À l'échelle de la communauté, l'échantillon peut enfin porter un
-- pourcentage — mais pas toujours, et c'est la fonction qui le dit.
--
-- **`sample_sufficient`** : le taux n'est calculé qu'au-delà de 30 parties.
-- En dessous, la fonction renvoie les entiers et laisse le pourcentage à null.
-- L'écran n'a donc aucun seuil à connaître, et ne peut pas afficher un taux que
-- la base juge non significatif. Le seuil vit à un seul endroit.
--
-- **Les tournois par équipes sont exclus.** Leurs appariements sont négociés
-- par les capitaines : un taux de victoire y mesure autant le flair du
-- capitaine que la force de la faction. Les mélanger produirait un chiffre que
-- personne ne saurait interpréter.
--
-- Seules les parties **réellement jouées** comptent : le bye et les forfaits
-- (adversaire absent) sont écartés, sinon une faction paraîtrait forte d'avoir
-- eu de la chance au tirage.

create or replace function public.faction_meta_stats(
  p_since date default null,
  p_region text default null
)
returns table (
  faction text,
  players integer,
  games integer,
  wins integer,
  draws integer,
  losses integer,
  /** Points de partie marqués en moyenne, sur 80 possibles. */
  average_points numeric,
  /** Null tant que l'échantillon ne le porte pas — jamais un chiffre creux. */
  win_rate numeric,
  sample_sufficient boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with played as (
    select r.faction,
           r.player_id,
           pr.points_for,
           pr.points_against
    from public.player_results pr
    join public.tournaments t on t.id = pr.tournament_id
    join public.registrations r
      on r.tournament_id = pr.tournament_id and r.player_id = pr.player_id
    where t.status = 'completed'
      and t.type = 'individual'
      and r.faction is not null
      -- Une partie sans adversaire n'a pas été jouée.
      and pr.opponent_id is not null
      and (p_since is null or t.event_date >= p_since)
      and (p_region is null or t.region = p_region)
  ),
  totals as (
    select p.faction,
           count(distinct p.player_id)::int as players,
           count(*)::int as games,
           count(*) filter (where p.points_for > p.points_against)::int as wins,
           count(*) filter (where p.points_for = p.points_against)::int as draws,
           count(*) filter (where p.points_for < p.points_against)::int as losses,
           round(avg(p.points_for), 1) as average_points
    from played p
    group by p.faction
  )
  select t.faction,
         t.players,
         t.games,
         t.wins,
         t.draws,
         t.losses,
         t.average_points,
         case
           when t.games >= 30
           then round(100.0 * (t.wins + t.draws * 0.5) / t.games, 1)
           else null
         end as win_rate,
         t.games >= 30 as sample_sufficient
  from totals t
  order by t.games desc, t.faction;
$$;

-- `security definer` pour la même raison que `circuit_standings` (0025) : la
-- fonction lit `registrations.faction`, réservée aux membres connectés. Les
-- statistiques agrégées, elles, ne disent rien de personne en particulier — et
-- une page méta doit pouvoir se partager.
revoke execute on function public.faction_meta_stats(date, text) from public;
grant execute on function public.faction_meta_stats(date, text) to authenticated, anon;

/**
 * De quoi dire honnêtement sur quoi reposent ces chiffres : combien de
 * tournois, de parties et de joueurs, et depuis quand.
 *
 * Sans ce cadre, un tableau de pourcentages laisse croire à une mesure établie
 * là où il n'y a parfois que deux tournois.
 */
create or replace function public.meta_coverage(
  p_since date default null,
  p_region text default null
)
returns table (
  tournaments integer,
  games integer,
  players integer,
  first_event date,
  last_event date
)
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct t.id)::int,
         count(*)::int,
         count(distinct pr.player_id)::int,
         min(t.event_date),
         max(t.event_date)
  from public.player_results pr
  join public.tournaments t on t.id = pr.tournament_id
  join public.registrations r
    on r.tournament_id = pr.tournament_id and r.player_id = pr.player_id
  where t.status = 'completed'
    and t.type = 'individual'
    and r.faction is not null
    and pr.opponent_id is not null
    and (p_since is null or t.event_date >= p_since)
    and (p_region is null or t.region = p_region);
$$;

revoke execute on function public.meta_coverage(date, text) from public;
grant execute on function public.meta_coverage(date, text) to authenticated, anon;
