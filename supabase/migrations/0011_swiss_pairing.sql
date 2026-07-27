-- Migration 0011 : rondes suisses suivantes (US-3.6)
--
-- Principe du système suisse : on classe les joueurs, puis on apparie les
-- voisins de classement — les premiers entre eux, les derniers entre eux —
-- sans jamais rejouer un adversaire déjà rencontré.

/** Vrai si les deux joueurs se sont déjà affrontés dans ce tournoi. */
create or replace function public.already_met(
  p_tournament_id uuid,
  p_one uuid,
  p_two uuid
)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.pairings p
    join public.rounds r on r.id = p.round_id
    where r.tournament_id = p_tournament_id
      and (
        (p.player_a_id = p_one and p.player_b_id = p_two)
        or (p.player_a_id = p_two and p.player_b_id = p_one)
      )
  );
$$;

/**
 * Apparie une liste de joueurs déjà triée par classement.
 *
 * On tente d'abord le voisin immédiat — c'est ce qui donne des appariements
 * « par groupes de score ». S'il a déjà été rencontré, on descend au suivant,
 * et on revient en arrière si la suite s'avère impossible. Renvoie une liste
 * à plat [a1, b1, a2, b2, …], ou null si aucun appariement n'existe.
 */
create or replace function public.swiss_pair(p_tournament_id uuid, p_players uuid[])
returns uuid[]
language plpgsql
stable
set search_path = public
as $$
declare
  v_count integer := coalesce(array_length(p_players, 1), 0);
  v_first uuid;
  v_candidate uuid;
  v_remaining uuid[];
  v_sub uuid[];
  i integer;
begin
  if v_count = 0 then
    return array[]::uuid[];
  end if;

  v_first := p_players[1];

  for i in 2..v_count loop
    v_candidate := p_players[i];
    if public.already_met(p_tournament_id, v_first, v_candidate) then
      continue;
    end if;

    -- On retire les deux joueurs et on apparie le reste.
    v_remaining := array_remove(p_players[2:v_count], v_candidate);
    v_sub := public.swiss_pair(p_tournament_id, v_remaining);
    if v_sub is not null then
      return array[v_first, v_candidate] || v_sub;
    end if;
  end loop;

  -- Aucun adversaire possible pour le premier joueur : impasse.
  return null;
end;
$$;

/**
 * Clôt la ronde en cours et génère la suivante.
 * Renvoie l'identifiant de la ronde créée.
 */
create or replace function public.generate_next_round(p_tournament_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_organizer uuid;
  v_status text;
  v_rounds_count integer;
  v_current_number integer;
  v_current_id uuid;
  v_missing integer;
  v_players uuid[];
  v_bye uuid;
  v_pairs uuid[];
  v_new_round uuid;
  v_table integer := 1;
  v_bye_scores record;
  i integer;
begin
  if v_caller is null then
    raise exception 'Il faut être connecté.';
  end if;

  select organizer_id, status, rounds_count
  into v_organizer, v_status, v_rounds_count
  from public.tournaments where id = p_tournament_id
  for update;

  if v_organizer is null then
    raise exception 'Tournoi introuvable.';
  end if;
  if v_organizer <> v_caller then
    raise exception 'Seul l''organisateur peut clôturer une ronde.';
  end if;
  if v_status <> 'in_progress' then
    raise exception 'Ce tournoi n''est pas en cours.';
  end if;

  select id, number into v_current_id, v_current_number
  from public.rounds
  where tournament_id = p_tournament_id
  order by number desc
  limit 1;

  if v_current_id is null then
    raise exception 'Aucune ronde à clôturer.';
  end if;

  -- Tous les scores doivent être saisis : les appariements en dépendent.
  select count(*) into v_missing
  from public.pairings
  where round_id = v_current_id and score_a is null;

  if v_missing > 0 then
    raise exception 'Il reste % table(s) sans score.', v_missing;
  end if;

  if v_current_number >= v_rounds_count then
    raise exception 'La dernière ronde prévue est déjà jouée.';
  end if;

  update public.rounds set status = 'completed' where id = v_current_id;

  -- Joueurs encore en lice, dans l'ordre du classement.
  select array_agg(s.player_id order by s.rank)
  into v_players
  from public.tournament_standings(p_tournament_id) s
  join public.registrations reg
    on reg.player_id = s.player_id and reg.tournament_id = p_tournament_id
  where reg.status = 'checked_in';

  if coalesce(array_length(v_players, 1), 0) < 2 then
    raise exception 'Il faut au moins deux joueurs pour générer une ronde.';
  end if;

  -- Nombre impair : le bye va au moins bien classé qui n'en a pas encore eu.
  if array_length(v_players, 1) % 2 = 1 then
    select p_id into v_bye from (
      select unnest(v_players) as p_id, generate_subscripts(v_players, 1) as pos
    ) ordered
    where not exists (
      select 1 from public.pairings p
      join public.rounds r on r.id = p.round_id
      where r.tournament_id = p_tournament_id
        and p.player_b_id is null
        and p.player_a_id = ordered.p_id
    )
    order by pos desc
    limit 1;

    if v_bye is null then
      -- Tout le monde a déjà été exempt : on redonne au moins bien classé.
      v_bye := v_players[array_length(v_players, 1)];
    end if;
    v_players := array_remove(v_players, v_bye);
  end if;

  v_pairs := public.swiss_pair(p_tournament_id, v_players);
  if v_pairs is null then
    raise exception 'Impossible d''apparier les joueurs sans refaire une rencontre déjà jouée.';
  end if;

  insert into public.rounds (tournament_id, number)
  values (p_tournament_id, v_current_number + 1)
  returning id into v_new_round;

  i := 1;
  while i < array_length(v_pairs, 1) loop
    insert into public.pairings (round_id, table_number, player_a_id, player_b_id)
    values (v_new_round, v_table, v_pairs[i], v_pairs[i + 1]);
    v_table := v_table + 1;
    i := i + 2;
  end loop;

  if v_bye is not null then
    select * into v_bye_scores from public.bye_scores();
    insert into public.pairings (
      round_id, table_number, player_a_id, player_b_id, score_a, score_b, tactics_a, tactics_b
    )
    values (v_new_round, v_table, v_bye, null, v_bye_scores.winner, v_bye_scores.loser, 3, 0);
  end if;

  return v_new_round;
end;
$$;

revoke execute on function public.swiss_pair(uuid, uuid[]) from public, anon, authenticated;
revoke execute on function public.already_met(uuid, uuid, uuid) from public, anon;
revoke execute on function public.generate_next_round(uuid) from public, anon;
grant execute on function public.generate_next_round(uuid) to authenticated;
