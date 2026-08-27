-- Migration 0046 : appariement capitaines (US-7.7)
--
-- LE PROTOCOLE, « pose – deux – choix », itéré N-1 fois :
--   1. le capitaine **attaquant pose** un de ses joueurs encore libres ;
--   2. le capitaine **défenseur présente deux** des siens ;
--   3. l'attaquant **choisit** lequel des deux affronte son joueur posé ;
--   4. les rôles s'inversent pour la passe suivante.
-- Quand il ne reste qu'un joueur libre de chaque côté, le dernier match se
-- forme tout seul : ni geste, ni clic.
--
-- POURQUOI CE PROTOCOLE PLUTÔT QU'UN AUTRE : le format français à 3 et l'ETC à
-- 5-8 ne sont pas deux protocoles, c'est le même mécanisme paramétré par la
-- taille d'équipe. Un seul algorithme couvre les deux formats du cahier des
-- charges.
--
-- POURQUOI IL TIENT SANS TEMPS RÉEL : il est **strictement séquentiel et sans
-- aucun secret**. À tout instant, chacun voit les deux rosters, les matchs
-- figés et à qui est le tour. Personne n'attend un geste invisible, donc
-- « tirer pour rafraîchir » suffit — la décision « pas de temps réel » du
-- projet n'est pas rouverte. La variante « ordres révélés simultanément »,
-- elle, aurait exigé un scellement puis une révélation synchronisée.
--
-- LE JOURNAL EST L'ÉTAT. `captain_picks` n'est pas une trace posée à côté d'une
-- machine à états : c'est d'elle qu'on dérive à qui est le tour et quel geste
-- est attendu. Une seule source, donc rien à resynchroniser — et l'appariement
-- reste explicable après coup, geste par geste.
--
-- AUCUNE MINUTERIE. Elle exigerait un cron, une horloge partagée et du temps
-- réel, pour un problème que l'organisateur règle en marchant trois mètres :
-- il peut agir à la place d'un capitaine, ou compléter la rencontre d'un coup.

create table public.captain_picks (
  id uuid primary key default gen_random_uuid(),
  team_pairing_id uuid not null references public.team_pairings (id) on delete cascade,
  /** Numéro de passe, à partir de 1. Une passe produit un match. */
  pass_number integer not null check (pass_number >= 1),
  /** L'équipe qui agit, par son inscription au tournoi. */
  actor_team_id uuid not null references public.team_registrations (id) on delete cascade,
  gesture text not null check (gesture in ('post', 'offer', 'pick')),
  /** Un joueur pour « pose » et « choisit », deux pour « présente ». */
  player_ids uuid[] not null,
  acted_by uuid not null references public.profiles (id) on delete restrict,
  /** Vrai quand l'organisateur a agi à la place d'un capitaine absent. */
  acted_by_organizer boolean not null default false,
  created_at timestamptz not null default now()
);

create index captain_picks_pairing_idx
  on public.captain_picks (team_pairing_id, pass_number, created_at);

alter table public.captain_picks enable row level security;

-- Lecture publique, comme les appariements : un joueur suit la négociation de
-- son équipe, et l'adversaire voit tout — c'est ce qui rend le protocole
-- jouable sans temps réel.
create policy "Le journal d'appariement est visible par tous"
  on public.captain_picks for select to authenticated, anon using (true);

grant select on public.captain_picks to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 1. Qui a le droit d'agir ici
-- ---------------------------------------------------------------------------

/**
 * Renvoie l'inscription d'équipe au nom de laquelle l'appelant peut agir sur
 * cette rencontre, ou null. L'organisateur peut agir pour les deux — c'est le
 * filet quand un capitaine ne répond pas.
 */
create or replace function public.captain_authority(
  p_team_pairing_id uuid,
  p_side uuid default null
)
returns table (team_registration_id uuid, is_organizer boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_a uuid;
  v_b uuid;
  v_organizer uuid;
begin
  if v_caller is null then
    raise exception 'Il faut être connecté.';
  end if;

  select tp.team_a_id, tp.team_b_id, t.organizer_id
    into v_a, v_b, v_organizer
  from public.team_pairings tp
  join public.rounds r on r.id = tp.round_id
  join public.tournaments t on t.id = r.tournament_id
  where tp.id = p_team_pairing_id;

  if v_a is null then
    raise exception 'NOT_FOUND';
  end if;

  if v_caller = v_organizer then
    return query select coalesce(p_side, v_a), true;
    return;
  end if;

  return query
    select tr.id, false
    from public.team_registrations tr
    join public.teams te on te.id = tr.team_id
    where tr.id in (v_a, v_b) and te.captain_id = v_caller;
end;
$$;

revoke execute on function public.captain_authority(uuid, uuid) from public, anon;
grant execute on function public.captain_authority(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. L'état de la négociation, dérivé du journal
-- ---------------------------------------------------------------------------

create or replace function public.team_pairing_state(p_team_pairing_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_a uuid;
  v_b uuid;
  v_first uuid;
  v_status text;
  v_team_size integer;
  v_pass integer;
  v_last_gesture text;
  v_last_players uuid[];
  v_attacker uuid;
  v_defender uuid;
  v_step text;
  v_posted uuid;
  v_offered uuid[];
  v_taken uuid[];
  v_free_a uuid[];
  v_free_b uuid[];
begin
  select tp.team_a_id, tp.team_b_id, tp.first_picker, tp.pairing_status, t.team_size
    into v_a, v_b, v_first, v_status, v_team_size
  from public.team_pairings tp
  join public.rounds r on r.id = tp.round_id
  join public.tournaments t on t.id = r.tournament_id
  where tp.id = p_team_pairing_id;

  if v_a is null then
    raise exception 'NOT_FOUND';
  end if;

  -- Les joueurs déjà appariés sur cette rencontre, quel que soit le chemin.
  select coalesce(array_agg(x), array[]::uuid[]) into v_taken
  from (
    select p.player_a_id as x from public.pairings p where p.team_pairing_id = p_team_pairing_id
    union all
    select p.player_b_id from public.pairings p
    where p.team_pairing_id = p_team_pairing_id and p.player_b_id is not null
  ) q;

  select coalesce(array_agg(r.player_id order by r.roster_position), array[]::uuid[])
    into v_free_a
  from public.registrations r
  where r.team_registration_id = v_a
    and r.status in ('registered', 'checked_in')
    and not (r.player_id = any (v_taken));

  if v_b is not null then
    select coalesce(array_agg(r.player_id order by r.roster_position), array[]::uuid[])
      into v_free_b
    from public.registrations r
    where r.team_registration_id = v_b
      and r.status in ('registered', 'checked_in')
      and not (r.player_id = any (v_taken));
  else
    v_free_b := array[]::uuid[];
  end if;

  -- La passe courante : autant de passes achevées que de « choisit » posés.
  select count(*) + 1 into v_pass
  from public.captain_picks
  where team_pairing_id = p_team_pairing_id and gesture = 'pick';

  -- L'attaquant alterne : celui qui a été tiré au sort commence.
  if v_pass % 2 = 1 then
    v_attacker := v_first;
  else
    v_attacker := case when v_first = v_a then v_b else v_a end;
  end if;
  v_defender := case when v_attacker = v_a then v_b else v_a end;

  select cp.gesture, cp.player_ids into v_last_gesture, v_last_players
  from public.captain_picks cp
  where cp.team_pairing_id = p_team_pairing_id and cp.pass_number = v_pass
  order by cp.created_at desc
  limit 1;

  if v_last_gesture is null then
    v_step := 'post';
  elsif v_last_gesture = 'post' then
    v_step := 'offer';
    v_posted := v_last_players[1];
  elsif v_last_gesture = 'offer' then
    v_step := 'pick';
    v_offered := v_last_players;
    select cp.player_ids[1] into v_posted
    from public.captain_picks cp
    where cp.team_pairing_id = p_team_pairing_id
      and cp.pass_number = v_pass and cp.gesture = 'post'
    limit 1;
  else
    v_step := 'post';
  end if;

  -- Plus rien à négocier : soit tout est apparié, soit il ne reste qu'un
  -- joueur de chaque côté et le dernier match se forme tout seul.
  if coalesce(array_length(v_free_a, 1), 0) = 0
     or coalesce(array_length(v_free_b, 1), 0) = 0 then
    v_step := 'done';
  elsif coalesce(array_length(v_free_a, 1), 0) = 1
        and coalesce(array_length(v_free_b, 1), 0) = 1 then
    v_step := 'last';
  end if;

  return jsonb_build_object(
    'team_pairing_id', p_team_pairing_id,
    'pairing_status', v_status,
    'team_a_id', v_a,
    'team_b_id', v_b,
    'team_size', v_team_size,
    'pass_number', v_pass,
    'attacker_team_id', v_attacker,
    'defender_team_id', v_defender,
    'step', v_step,
    'posted_player_id', v_posted,
    'offered_player_ids', to_jsonb(coalesce(v_offered, array[]::uuid[])),
    'free_a', to_jsonb(v_free_a),
    'free_b', to_jsonb(v_free_b)
  );
end;
$$;

revoke execute on function public.team_pairing_state(uuid) from public;
grant execute on function public.team_pairing_state(uuid) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 3. Ouvrir la négociation
-- ---------------------------------------------------------------------------
-- Les tables d'une rencontre naissent dans l'ordre des rosters (0045) : c'est
-- ce qui rend le tournoi jouable sans cet écran. Ouvrir l'appariement défait
-- ces tables — et seulement si aucun score n'y a été saisi.

create or replace function public.open_captain_pairing(p_team_pairing_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_organizer uuid;
  v_status text;
begin
  select t.organizer_id, tp.pairing_status
    into v_organizer, v_status
  from public.team_pairings tp
  join public.rounds r on r.id = tp.round_id
  join public.tournaments t on t.id = r.tournament_id
  where tp.id = p_team_pairing_id;

  if v_organizer is null then
    raise exception 'NOT_FOUND';
  end if;
  if v_caller is distinct from v_organizer then
    raise exception 'NOT_ORGANIZER';
  end if;
  if v_status = 'locked' then
    raise exception 'ALREADY_LOCKED';
  end if;

  if exists (
    select 1 from public.pairings
    where team_pairing_id = p_team_pairing_id and score_a is not null
  ) then
    raise exception 'SCORES_ALREADY_ENTERED';
  end if;

  delete from public.pairings where team_pairing_id = p_team_pairing_id;
  delete from public.captain_picks where team_pairing_id = p_team_pairing_id;

  update public.team_pairings
  set pairing_status = 'pending'
  where id = p_team_pairing_id;
end;
$$;

revoke execute on function public.open_captain_pairing(uuid) from public, anon;
grant execute on function public.open_captain_pairing(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Les trois gestes
-- ---------------------------------------------------------------------------

/** Fige un match et lui donne sa table, dans le bloc réservé à la rencontre. */
create or replace function public.commit_captain_match(
  p_team_pairing_id uuid,
  p_player_a uuid,
  p_player_b uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round uuid;
  v_encounter integer;
  v_team_size integer;
  v_used integer;
begin
  select tp.round_id, tp.encounter_number, t.team_size
    into v_round, v_encounter, v_team_size
  from public.team_pairings tp
  join public.rounds r on r.id = tp.round_id
  join public.tournaments t on t.id = r.tournament_id
  where tp.id = p_team_pairing_id;

  select count(*) into v_used
  from public.pairings where team_pairing_id = p_team_pairing_id;

  insert into public.pairings (round_id, table_number, player_a_id, player_b_id, team_pairing_id)
  values (
    v_round,
    (v_encounter - 1) * v_team_size + v_used + 1,
    p_player_a,
    p_player_b,
    p_team_pairing_id
  );

  -- Toutes les tables composées : la rencontre se verrouille d'elle-même.
  if v_used + 1 >= v_team_size then
    update public.team_pairings set pairing_status = 'locked' where id = p_team_pairing_id;
  end if;
end;
$$;

revoke execute on function public.commit_captain_match(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.captain_post_player(
  p_team_pairing_id uuid,
  p_player_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state jsonb := public.team_pairing_state(p_team_pairing_id);
  v_auth record;
  v_side uuid := (v_state->>'attacker_team_id')::uuid;
  v_free uuid[];
begin
  select * into v_auth from public.captain_authority(p_team_pairing_id, v_side) limit 1;
  if v_auth.team_registration_id is null then
    raise exception 'NOT_CAPTAIN';
  end if;
  if not v_auth.is_organizer and v_auth.team_registration_id <> v_side then
    raise exception 'NOT_YOUR_TURN';
  end if;
  if v_state->>'step' <> 'post' then
    raise exception 'WRONG_STEP';
  end if;

  v_free := case when v_side = (v_state->>'team_a_id')::uuid
                 then array(select jsonb_array_elements_text(v_state->'free_a'))::uuid[]
                 else array(select jsonb_array_elements_text(v_state->'free_b'))::uuid[] end;
  if not (p_player_id = any (v_free)) then
    raise exception 'PLAYER_NOT_FREE';
  end if;

  insert into public.captain_picks (
    team_pairing_id, pass_number, actor_team_id, gesture, player_ids,
    acted_by, acted_by_organizer
  )
  values (
    p_team_pairing_id, (v_state->>'pass_number')::int, v_side, 'post', array[p_player_id],
    auth.uid(), v_auth.is_organizer
  );

  return public.team_pairing_state(p_team_pairing_id);
end;
$$;

revoke execute on function public.captain_post_player(uuid, uuid) from public, anon;
grant execute on function public.captain_post_player(uuid, uuid) to authenticated;

create or replace function public.captain_offer_two(
  p_team_pairing_id uuid,
  p_player_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state jsonb := public.team_pairing_state(p_team_pairing_id);
  v_auth record;
  v_side uuid := (v_state->>'defender_team_id')::uuid;
  v_free uuid[];
begin
  select * into v_auth from public.captain_authority(p_team_pairing_id, v_side) limit 1;
  if v_auth.team_registration_id is null then
    raise exception 'NOT_CAPTAIN';
  end if;
  if not v_auth.is_organizer and v_auth.team_registration_id <> v_side then
    raise exception 'NOT_YOUR_TURN';
  end if;
  if v_state->>'step' <> 'offer' then
    raise exception 'WRONG_STEP';
  end if;
  if coalesce(array_length(p_player_ids, 1), 0) <> 2
     or p_player_ids[1] = p_player_ids[2] then
    raise exception 'OFFER_TWO_REQUIRED';
  end if;

  v_free := case when v_side = (v_state->>'team_a_id')::uuid
                 then array(select jsonb_array_elements_text(v_state->'free_a'))::uuid[]
                 else array(select jsonb_array_elements_text(v_state->'free_b'))::uuid[] end;
  if not (p_player_ids[1] = any (v_free)) or not (p_player_ids[2] = any (v_free)) then
    raise exception 'PLAYER_NOT_FREE';
  end if;

  insert into public.captain_picks (
    team_pairing_id, pass_number, actor_team_id, gesture, player_ids,
    acted_by, acted_by_organizer
  )
  values (
    p_team_pairing_id, (v_state->>'pass_number')::int, v_side, 'offer', p_player_ids,
    auth.uid(), v_auth.is_organizer
  );

  return public.team_pairing_state(p_team_pairing_id);
end;
$$;

revoke execute on function public.captain_offer_two(uuid, uuid[]) from public, anon;
grant execute on function public.captain_offer_two(uuid, uuid[]) to authenticated;

create or replace function public.captain_pick_opponent(
  p_team_pairing_id uuid,
  p_player_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state jsonb := public.team_pairing_state(p_team_pairing_id);
  v_auth record;
  v_side uuid := (v_state->>'attacker_team_id')::uuid;
  v_offered uuid[];
  v_posted uuid;
  v_a uuid;
begin
  select * into v_auth from public.captain_authority(p_team_pairing_id, v_side) limit 1;
  if v_auth.team_registration_id is null then
    raise exception 'NOT_CAPTAIN';
  end if;
  if not v_auth.is_organizer and v_auth.team_registration_id <> v_side then
    raise exception 'NOT_YOUR_TURN';
  end if;
  if v_state->>'step' <> 'pick' then
    raise exception 'WRONG_STEP';
  end if;

  v_offered := array(select jsonb_array_elements_text(v_state->'offered_player_ids'))::uuid[];
  if not (p_player_id = any (v_offered)) then
    raise exception 'NOT_OFFERED';
  end if;

  v_posted := (v_state->>'posted_player_id')::uuid;
  v_a := (v_state->>'team_a_id')::uuid;

  insert into public.captain_picks (
    team_pairing_id, pass_number, actor_team_id, gesture, player_ids,
    acted_by, acted_by_organizer
  )
  values (
    p_team_pairing_id, (v_state->>'pass_number')::int, v_side, 'pick', array[p_player_id],
    auth.uid(), v_auth.is_organizer
  );

  -- La convention de la 0045 tient : player_a appartient toujours à l'équipe A.
  if v_side = v_a then
    perform public.commit_captain_match(p_team_pairing_id, v_posted, p_player_id);
  else
    perform public.commit_captain_match(p_team_pairing_id, p_player_id, v_posted);
  end if;

  return public.finish_captain_pairing_if_last(p_team_pairing_id);
end;
$$;

revoke execute on function public.captain_pick_opponent(uuid, uuid) from public, anon;
grant execute on function public.captain_pick_opponent(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Le dernier match se forme tout seul
-- ---------------------------------------------------------------------------
-- Quand il ne reste qu'un joueur libre de chaque côté, il n'y a plus rien à
-- décider. Demander un geste pour une non-décision, c'est faire perdre du temps
-- à quatre personnes debout.

create or replace function public.finish_captain_pairing_if_last(p_team_pairing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state jsonb := public.team_pairing_state(p_team_pairing_id);
  v_free_a uuid[];
  v_free_b uuid[];
begin
  if v_state->>'step' <> 'last' then
    return v_state;
  end if;

  v_free_a := array(select jsonb_array_elements_text(v_state->'free_a'))::uuid[];
  v_free_b := array(select jsonb_array_elements_text(v_state->'free_b'))::uuid[];
  perform public.commit_captain_match(p_team_pairing_id, v_free_a[1], v_free_b[1]);

  return public.team_pairing_state(p_team_pairing_id);
end;
$$;

revoke execute on function public.finish_captain_pairing_if_last(uuid) from public, anon;
grant execute on function public.finish_captain_pairing_if_last(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Le filet de l'organisateur
-- ---------------------------------------------------------------------------
-- Un capitaine parti fumer, un téléphone déchargé, une salle qui attend : la
-- rencontre se complète d'un geste, dans l'ordre des rosters. C'est aussi le
-- plan B en cas de panne réseau.

create or replace function public.autocomplete_captain_pairing(p_team_pairing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_organizer uuid;
  v_state jsonb;
  v_free_a uuid[];
  v_free_b uuid[];
  i integer;
begin
  select t.organizer_id into v_organizer
  from public.team_pairings tp
  join public.rounds r on r.id = tp.round_id
  join public.tournaments t on t.id = r.tournament_id
  where tp.id = p_team_pairing_id;

  if v_organizer is null then
    raise exception 'NOT_FOUND';
  end if;
  if v_caller is distinct from v_organizer then
    raise exception 'NOT_ORGANIZER';
  end if;

  v_state := public.team_pairing_state(p_team_pairing_id);
  v_free_a := array(select jsonb_array_elements_text(v_state->'free_a'))::uuid[];
  v_free_b := array(select jsonb_array_elements_text(v_state->'free_b'))::uuid[];

  for i in 1..least(
    coalesce(array_length(v_free_a, 1), 0),
    coalesce(array_length(v_free_b, 1), 0)
  ) loop
    perform public.commit_captain_match(p_team_pairing_id, v_free_a[i], v_free_b[i]);
  end loop;

  update public.team_pairings set pairing_status = 'locked' where id = p_team_pairing_id;

  return public.team_pairing_state(p_team_pairing_id);
end;
$$;

revoke execute on function public.autocomplete_captain_pairing(uuid) from public, anon;
grant execute on function public.autocomplete_captain_pairing(uuid) to authenticated;
