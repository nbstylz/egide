-- Migration 0051 : classement ELO national (US-11.1)
--
-- Un classement qui traverse les tournois, là où `tournament_standings` s'arrête
-- à un événement et `circuit_standings` à une saison régionale.
--
-- LES CHOIX, ET POURQUOI :
--
-- * **1000 au départ, K = 24.** Un K modéré : en AoS on dispute cinq parties
--   par week-end, pas trois par semaine. Trop haut, le classement suivrait le
--   dernier tournoi ; trop bas, il ne bougerait jamais.
-- * **La marge ne compte pas.** Gagner 20-0 ou 41-39 rapporte autant. L'ELO
--   mesure « qui bat qui », et un écart de points dépend surtout du scénario.
--   Le différentiel a déjà sa place dans les départages d'un tournoi.
-- * **Les tournois par équipes sont exclus**, comme pour le méta : leurs
--   appariements sont négociés par les capitaines, pas produits par le système
--   suisse. Un ELO suppose des adversaires qu'on ne choisit pas.
-- * **Le bye et les forfaits ne comptent pas** : il n'y a pas eu de partie.
-- * **Cinq parties minimum pour apparaître.** Un classement bâti sur une seule
--   partie n'est pas un classement, c'est un tirage. Même famille de décision
--   que le seuil du taux de victoire (0050) : mieux vaut ne rien montrer.
--
-- Le calcul est rejoué à chaque appel, dans l'ordre chronologique
-- (date d'événement, ronde, table). Rien n'est stocké : un score corrigé par
-- l'organisateur se répercute donc sans recalcul et sans divergence possible.
-- Le jour où le volume l'exigera, ce sera une table de cache — pas une
-- deuxième source de vérité.

create or replace function public.national_elo(p_min_games integer default 5)
returns table (
  rank integer,
  player_id uuid,
  pseudo text,
  region text,
  rating integer,
  games integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ratings jsonb := '{}'::jsonb;
  v_games jsonb := '{}'::jsonb;
  g record;
  v_ra numeric;
  v_rb numeric;
  v_ea numeric;
  v_sa numeric;
  k constant numeric := 24;
begin
  for g in
    select p.player_a_id as a,
           p.player_b_id as b,
           p.score_a as sa,
           p.score_b as sb
    from public.pairings p
    join public.rounds ro on ro.id = p.round_id
    join public.tournaments t on t.id = ro.tournament_id
    where t.status = 'completed'
      and t.type = 'individual'
      and p.player_b_id is not null
      and p.score_a is not null
      and p.score_b is not null
    order by t.event_date, ro.number, p.table_number
  loop
    v_ra := coalesce((v_ratings ->> g.a::text)::numeric, 1000);
    v_rb := coalesce((v_ratings ->> g.b::text)::numeric, 1000);
    v_ea := 1.0 / (1.0 + power(10.0, (v_rb - v_ra) / 400.0));
    v_sa := case when g.sa > g.sb then 1 when g.sa = g.sb then 0.5 else 0 end;

    v_ratings := jsonb_set(
      v_ratings, array[g.a::text], to_jsonb(round(v_ra + k * (v_sa - v_ea), 2))
    );
    v_ratings := jsonb_set(
      v_ratings, array[g.b::text], to_jsonb(round(v_rb + k * ((1 - v_sa) - (1 - v_ea)), 2))
    );
    v_games := jsonb_set(
      v_games, array[g.a::text], to_jsonb(coalesce((v_games ->> g.a::text)::int, 0) + 1)
    );
    v_games := jsonb_set(
      v_games, array[g.b::text], to_jsonb(coalesce((v_games ->> g.b::text)::int, 0) + 1)
    );
  end loop;

  return query
    select row_number() over (
             order by (e.value)::numeric desc, pr.pseudo
           )::int as rank,
           (e.key)::uuid,
           pr.pseudo,
           pr.region,
           round((e.value)::numeric)::int,
           coalesce((v_games ->> e.key)::int, 0)
    from jsonb_each(v_ratings) e
    join public.profiles pr on pr.id = (e.key)::uuid
    where coalesce((v_games ->> e.key)::int, 0) >= greatest(coalesce(p_min_games, 5), 1)
    order by rank;
end;
$$;

-- `security definer` : la fonction lit `profiles`, réservée aux connectés
-- (0001). Un classement national doit pouvoir se consulter et se partager —
-- il ne dit rien de plus qu'un pseudo et un nombre.
revoke execute on function public.national_elo(integer) from public;
grant execute on function public.national_elo(integer) to authenticated, anon;
