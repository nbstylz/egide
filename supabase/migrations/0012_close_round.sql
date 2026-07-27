-- Migration 0012 : clôture de ronde, issue de secours et compte rendu (US-3.6)
--
-- Deux ajouts par rapport à 0011 :
--   • en fin de tournoi sur un petit effectif, il arrive qu'aucun appariement
--     ne soit possible sans refaire une rencontre. Plutôt que de bloquer
--     l'organisateur, on lui permet d'autoriser explicitement un match retour ;
--   • la fonction renvoie de quoi rédiger le message de confirmation
--     (ronde créée, nombre de tables, joueur exempt, tables en match retour).

drop function if exists public.generate_next_round(uuid);

create or replace function public.generate_next_round(
  p_tournament_id uuid,
  p_allow_rematch boolean default false
)
returns jsonb
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
  v_current_status text;
  v_missing integer;
  v_players uuid[];
  v_bye uuid;
  v_bye_pseudo text;
  v_pairs uuid[];
  v_new_round uuid;
  v_table integer := 1;
  v_bye_scores record;
  v_rematch_tables integer[] := array[]::integer[];
  i integer;
begin
  if v_caller is null then
    raise exception 'Il faut être connecté.' using errcode = 'P0001';
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

  select id, number, status
  into v_current_id, v_current_number, v_current_status
  from public.rounds
  where tournament_id = p_tournament_id
  order by number desc
  limit 1;

  if v_current_id is null then
    raise exception 'Aucune ronde à clôturer.';
  end if;

  -- Idempotence : un double clic ne doit jamais créer deux rondes.
  if v_current_status = 'completed' then
    raise exception 'ROUND_ALREADY_CLOSED';
  end if;

  select count(*) into v_missing
  from public.pairings
  where round_id = v_current_id and score_a is null;

  if v_missing > 0 then
    raise exception 'MISSING_SCORES:%', v_missing;
  end if;

  update public.rounds set status = 'completed' where id = v_current_id;

  -- Dernière ronde prévue : on clôt sans générer de suite.
  if v_current_number >= v_rounds_count then
    return jsonb_build_object(
      'next_round_number', null,
      'tables_count', 0,
      'bye_pseudo', null,
      'rematch_tables', '[]'::jsonb
    );
  end if;

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
    select pseudo into v_bye_pseudo from public.profiles where id = v_bye;
  end if;

  v_pairs := public.swiss_pair(p_tournament_id, v_players);

  if v_pairs is null then
    if not p_allow_rematch then
      -- On annule la clôture : l'organisateur doit décider.
      raise exception 'NO_PAIRING_POSSIBLE';
    end if;
    -- Repli assumé : on apparie les voisins de classement, quitte à refaire
    -- une rencontre. Les tables concernées sont signalées à l'appelant.
    v_pairs := v_players;
  end if;

  insert into public.rounds (tournament_id, number)
  values (p_tournament_id, v_current_number + 1)
  returning id into v_new_round;

  i := 1;
  while i < array_length(v_pairs, 1) loop
    if public.already_met(p_tournament_id, v_pairs[i], v_pairs[i + 1]) then
      v_rematch_tables := v_rematch_tables || v_table;
    end if;
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

  return jsonb_build_object(
    'next_round_number', v_current_number + 1,
    'tables_count', v_table - 1,
    'bye_pseudo', v_bye_pseudo,
    'rematch_tables', to_jsonb(v_rematch_tables)
  );
end;
$$;

revoke execute on function public.generate_next_round(uuid, boolean) from public, anon;
grant execute on function public.generate_next_round(uuid, boolean) to authenticated;
