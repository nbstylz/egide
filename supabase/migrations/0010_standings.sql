-- Migration 0010 : tactiques marquées et classement (US-3.5)
--
-- Ordre des départages validé par le porteur du projet le 2026-07-26 :
--   1. nombre de victoires
--   2. points marqués
--   3. nombre de tactiques marquées
--   4. différentiel de score (marqués − encaissés)
--   5. force des adversaires rencontrés (SoS)
--   6. aléatoire stable
--
-- Le critère 3 impose de mémoriser les tactiques par joueur et par partie :
-- c'est l'objet des deux colonnes ajoutées ici.

alter table public.pairings
  add column tactics_a integer check (tactics_a >= 0),
  add column tactics_b integer check (tactics_b >= 0);

comment on column public.pairings.tactics_a is
  'Nombre de tactiques marquées par le joueur A (départage n°3).';
comment on column public.pairings.tactics_b is
  'Nombre de tactiques marquées par le joueur B.';

-- Le joueur exempt reçoit 3 tactiques (règle validée) : ni pénalisé ni
-- sur-récompensé au 3e départage, cohérent avec sa victoire 15-5.
update public.pairings set tactics_a = 3, tactics_b = 0 where player_b_id is null;

-- L'ancienne signature à trois arguments rendrait l'appel ambigu.
drop function if exists public.set_pairing_score(uuid, integer, integer);

/** Saisie d'un résultat : points de partie et tactiques des deux joueurs. */
create or replace function public.set_pairing_score(
  p_pairing_id uuid,
  p_score_a integer,
  p_score_b integer,
  p_tactics_a integer default null,
  p_tactics_b integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_organizer uuid;
  v_tournament uuid;
  v_tournament_status text;
  v_round_number integer;
  v_last_round integer;
  v_is_bye boolean;
begin
  if v_caller is null then
    raise exception 'Il faut être connecté.';
  end if;

  select t.organizer_id, t.id, t.status, r.number, (p.player_b_id is null)
  into v_organizer, v_tournament, v_tournament_status, v_round_number, v_is_bye
  from public.pairings p
  join public.rounds r on r.id = p.round_id
  join public.tournaments t on t.id = r.tournament_id
  where p.id = p_pairing_id;

  if v_organizer is null then
    raise exception 'Appariement introuvable.';
  end if;
  if v_organizer <> v_caller then
    raise exception 'Seul l''organisateur peut saisir les scores.';
  end if;
  if v_tournament_status <> 'in_progress' then
    raise exception 'Les scores ne sont modifiables que pendant le tournoi.';
  end if;
  if v_is_bye then
    raise exception 'Le score d''un joueur exempt est attribué automatiquement.';
  end if;

  select max(number) into v_last_round
  from public.rounds where tournament_id = v_tournament;

  if v_round_number < v_last_round then
    raise exception 'Cette ronde est close : la ronde suivante a déjà été générée.';
  end if;

  if (p_score_a is null) <> (p_score_b is null) then
    raise exception 'Il faut saisir les deux scores, ou aucun.';
  end if;
  if p_score_a is not null and (p_score_a < 0 or p_score_b < 0) then
    raise exception 'Un score ne peut pas être négatif.';
  end if;
  if (p_tactics_a is not null and p_tactics_a < 0)
     or (p_tactics_b is not null and p_tactics_b < 0) then
    raise exception 'Un nombre de tactiques ne peut pas être négatif.';
  end if;

  update public.pairings
  set score_a = p_score_a,
      score_b = p_score_b,
      -- Effacer le résultat efface aussi les tactiques.
      tactics_a = case when p_score_a is null then null else p_tactics_a end,
      tactics_b = case when p_score_b is null then null else p_tactics_b end,
      updated_at = now()
  where id = p_pairing_id;
end;
$$;

/**
 * Résultats à plat : une ligne par joueur et par partie jouée.
 * Sert de base au classement, et évite de dupliquer la logique
 * « joueur A / joueur B » partout.
 */
create or replace view public.player_results
with (security_invoker = true) as
  select r.tournament_id,
         r.number as round_number,
         p.player_a_id as player_id,
         p.player_b_id as opponent_id,
         p.score_a as points_for,
         p.score_b as points_against,
         coalesce(p.tactics_a, 0) as tactics
  from public.pairings p
  join public.rounds r on r.id = p.round_id
  where p.score_a is not null
  union all
  select r.tournament_id,
         r.number,
         p.player_b_id,
         p.player_a_id,
         p.score_b,
         p.score_a,
         coalesce(p.tactics_b, 0)
  from public.pairings p
  join public.rounds r on r.id = p.round_id
  where p.score_b is not null and p.player_b_id is not null;

/**
 * Classement d'un tournoi, départages appliqués dans l'ordre validé.
 * La force des adversaires (SoS) est la somme des victoires de tous les
 * adversaires rencontrés ; l'aléatoire final est stable, dérivé des
 * identifiants, pour que le classement ne bouge pas d'un affichage à l'autre.
 */
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
  /** Victoires nuls compris (un nul vaut 0,5), qui sert au 1er départage. */
  win_score numeric,
  opponents_wins numeric
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
           -- Un match nul compte pour une demi-victoire (règle validée).
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
  -- Victoires de chaque joueur, pour mesurer la force des adversaires.
  -- Force des adversaires : somme de leurs victoires (nuls compris pour moitié).
  wins_by_player as (
    select player_id,
           (count(*) filter (where points_for > points_against)
            + count(*) filter (where points_for = points_against) * 0.5) as wins
    from results group by player_id
  ),
  sos as (
    -- L'adversaire fictif du bye est exclu : il n'existe pas.
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
         coalesce(s.opponents_wins, 0) as opponents_wins
  from totals t
  join public.profiles pr on pr.id = t.player_id
  left join sos s on s.player_id = t.player_id
  order by rank;
$$;

revoke execute on function public.set_pairing_score(uuid, integer, integer, integer, integer)
  from public, anon;
grant execute on function public.set_pairing_score(uuid, integer, integer, integer, integer)
  to authenticated;
-- Le classement est public : les joueurs le consultent depuis l'app mobile.
grant execute on function public.tournament_standings(uuid) to authenticated, anon;
grant select on public.player_results to authenticated, anon;
