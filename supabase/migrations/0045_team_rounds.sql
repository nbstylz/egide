-- Migration 0045 : rondes suisses entre équipes (US-7.5 et le calcul de l'US-7.6)
--
-- Une **rencontre** oppose deux équipes ; elle contient N matchs joueur contre
-- joueur, qui sont des `pairings` ordinaires. C'est tout l'intérêt du modèle
-- posé en 0042 : la saisie des scores, la vue `player_results`, le classement
-- individuel, l'écran des tables et le bloc « Le jour J » fonctionnent sans une
-- ligne réécrite.
--
-- CONVENTION QUI PORTE TOUT LE RESTE : dans un match de rencontre, `player_a`
-- appartient toujours à l'équipe A, `player_b` à l'équipe B. Le score d'équipe
-- se lit alors en sommant `score_a` d'un côté et `score_b` de l'autre — sans
-- jointure supplémentaire, et sans risque d'inverser deux équipes.
--
-- DUPLICATION VOLONTAIRE : `already_met_team` et `swiss_pair_teams` sont des
-- copies de leurs sœurs de la 0011, opérant sur `team_pairings`. Généraliser
-- les originales aurait touché le chemin critique du jour J, déjà éprouvé sur
-- les tournois individuels. Trente lignes dupliquées valent mieux qu'une
-- régression sur un tournoi qui tourne.
--
-- HYPOTHÈSES À CONFIRMER PAR LE PORTEUR (agent `product-owner`, non validées) :
--   * l'issue d'une rencontre est le **plus grand total de points de partie**
--     cumulés, pas la majorité de tables gagnées — sur effectif pair, le 2-2
--     obligerait de toute façon à retomber sur les points ;
--   * les départages d'équipe **transposent les six départages individuels**,
--     pour n'avoir qu'une seule grammaire de classement à apprendre ;
--   * le bye d'équipe vaut 15-5 + 3 tactiques **pour chaque joueur**, et une
--     rencontre gagnée.
-- Chacune est isolée dans une fonction : les rectifier tient en une migration.

-- ---------------------------------------------------------------------------
-- 1. La rencontre
-- ---------------------------------------------------------------------------

create table public.team_pairings (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  encounter_number integer not null check (encounter_number >= 1),
  team_a_id uuid not null references public.team_registrations (id) on delete cascade,
  -- null = cette équipe a le bye pour cette ronde.
  team_b_id uuid references public.team_registrations (id) on delete cascade,
  -- Qui pose en premier à l'appariement capitaines (US-7.7). Tiré une fois par
  -- la base, jamais rejoué à l'affichage — même philosophie que l'aléatoire
  -- stable du sixième départage.
  first_picker uuid references public.team_registrations (id),
  pairing_status text not null default 'auto'
    check (pairing_status in ('auto', 'pending', 'locked')),
  created_at timestamptz not null default now(),
  unique (round_id, encounter_number),
  check (team_b_id is null or team_a_id <> team_b_id)
);

create index team_pairings_round_idx on public.team_pairings (round_id, encounter_number);
create index team_pairings_team_a_idx on public.team_pairings (team_a_id);
create index team_pairings_team_b_idx on public.team_pairings (team_b_id);

alter table public.team_pairings enable row level security;

-- Mêmes politiques que `pairings` : les rencontres et les scores sont publics,
-- un joueur consulte sa table sans compte.
create policy "Les rencontres sont visibles par tous"
  on public.team_pairings for select to authenticated, anon using (true);

grant select on public.team_pairings to authenticated, anon;

alter table public.pairings
  add column team_pairing_id uuid references public.team_pairings (id) on delete cascade;

create index pairings_team_pairing_idx on public.pairings (team_pairing_id);

comment on column public.pairings.team_pairing_id is
  'Rencontre d''équipes dont ce match fait partie, ou null en tournoi individuel. player_a appartient toujours à l''équipe A.';

-- ---------------------------------------------------------------------------
-- 2. L'appariement suisse entre équipes
-- ---------------------------------------------------------------------------

create or replace function public.already_met_team(
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
    from public.team_pairings tp
    join public.rounds r on r.id = tp.round_id
    where r.tournament_id = p_tournament_id
      and (
        (tp.team_a_id = p_one and tp.team_b_id = p_two)
        or (tp.team_a_id = p_two and tp.team_b_id = p_one)
      )
  );
$$;

revoke execute on function public.already_met_team(uuid, uuid, uuid) from public;
grant execute on function public.already_met_team(uuid, uuid, uuid) to authenticated, anon;

/**
 * Appariement récursif avec retour arrière : on n'oppose jamais deux fois les
 * mêmes équipes. Renvoie null si aucun appariement n'est possible — c'est
 * l'appelant qui décide alors d'autoriser les revanches.
 */
create or replace function public.swiss_pair_teams(p_tournament_id uuid, p_teams uuid[])
returns uuid[]
language plpgsql
stable
set search_path = public
as $$
declare
  v_count integer := coalesce(array_length(p_teams, 1), 0);
  v_first uuid;
  v_candidate uuid;
  v_remaining uuid[];
  v_sub uuid[];
  i integer;
begin
  if v_count = 0 then
    return array[]::uuid[];
  end if;

  v_first := p_teams[1];

  for i in 2..v_count loop
    v_candidate := p_teams[i];
    if public.already_met_team(p_tournament_id, v_first, v_candidate) then
      continue;
    end if;

    v_remaining := array_remove(p_teams[2:v_count], v_candidate);
    v_sub := public.swiss_pair_teams(p_tournament_id, v_remaining);
    if v_sub is not null then
      return array[v_first, v_candidate] || v_sub;
    end if;
  end loop;

  return null;
end;
$$;

revoke execute on function public.swiss_pair_teams(uuid, uuid[]) from public, anon;

-- ---------------------------------------------------------------------------
-- 3. Poser les tables d'une rencontre
-- ---------------------------------------------------------------------------
-- Les matchs naissent avec la rencontre, appariés **dans l'ordre des rosters**
-- (position 1 contre position 1). C'est ce qui rend le tournoi jouable AVANT
-- l'écran d'appariement capitaines — exactement ce que font les petits opens et
-- les tournois amicaux. L'US-7.7 viendra raffiner ces mêmes lignes.
--
-- La rencontre k occupe les tables (k-1)×N+1 à k×N : les joueurs d'une même
-- rencontre sont ainsi côte à côte dans la salle, ce que les organisateurs font
-- déjà à la main.

create or replace function public.seed_team_tables(
  p_team_pairing_id uuid,
  p_team_size integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round uuid;
  v_encounter integer;
  v_team_a uuid;
  v_team_b uuid;
  v_bye record;
  v_created integer := 0;
  v_a uuid;
  v_b uuid;
  i integer;
begin
  select round_id, encounter_number, team_a_id, team_b_id
    into v_round, v_encounter, v_team_a, v_team_b
  from public.team_pairings where id = p_team_pairing_id;

  for i in 1..p_team_size loop
    select r.player_id into v_a
    from public.registrations r
    where r.team_registration_id = v_team_a
      and r.roster_position = i
      and r.status in ('registered', 'checked_in');

    if v_team_b is null then
      -- Bye d'équipe : chaque joueur reçoit le barème du bye individuel.
      if v_a is not null then
        select * into v_bye from public.bye_scores();
        insert into public.pairings (
          round_id, table_number, player_a_id, player_b_id,
          score_a, score_b, tactics_a, tactics_b, team_pairing_id
        )
        values (
          v_round, (v_encounter - 1) * p_team_size + i, v_a, null,
          v_bye.winner, v_bye.loser, 3, 0, p_team_pairing_id
        );
        v_created := v_created + 1;
      end if;
      continue;
    end if;

    select r.player_id into v_b
    from public.registrations r
    where r.team_registration_id = v_team_b
      and r.roster_position = i
      and r.status in ('registered', 'checked_in');

    if v_a is not null and v_b is not null then
      insert into public.pairings (
        round_id, table_number, player_a_id, player_b_id, team_pairing_id
      )
      values (v_round, (v_encounter - 1) * p_team_size + i, v_a, v_b, p_team_pairing_id);
      v_created := v_created + 1;
    elsif v_a is not null then
      -- Roster adverse incomplet : forfait, même barème que le bye. La table
      -- existe et se voit, plutôt que de disparaître sans explication.
      select * into v_bye from public.bye_scores();
      insert into public.pairings (
        round_id, table_number, player_a_id, player_b_id,
        score_a, score_b, tactics_a, tactics_b, team_pairing_id
      )
      values (
        v_round, (v_encounter - 1) * p_team_size + i, v_a, null,
        v_bye.winner, v_bye.loser, 3, 0, p_team_pairing_id
      );
      v_created := v_created + 1;
    elsif v_b is not null then
      select * into v_bye from public.bye_scores();
      insert into public.pairings (
        round_id, table_number, player_a_id, player_b_id,
        score_a, score_b, tactics_a, tactics_b, team_pairing_id
      )
      values (
        v_round, (v_encounter - 1) * p_team_size + i, v_b, null,
        v_bye.winner, v_bye.loser, 3, 0, p_team_pairing_id
      );
      v_created := v_created + 1;
    end if;
  end loop;

  return v_created;
end;
$$;

revoke execute on function public.seed_team_tables(uuid, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Lancer un tournoi par équipes
-- ---------------------------------------------------------------------------

create or replace function public.start_team_tournament(p_tournament_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round uuid;
  v_teams uuid[];
  v_count integer;
  v_team_size integer;
  v_encounter integer := 1;
  v_index integer := 1;
  v_pairing uuid;
begin
  select team_size into v_team_size from public.tournaments where id = p_tournament_id;

  select array_agg(id order by random()), count(*)
  into v_teams, v_count
  from public.team_registrations
  where tournament_id = p_tournament_id and status = 'checked_in';

  if coalesce(v_count, 0) < 2 then
    raise exception 'Il faut au moins deux équipes présentes pour lancer le tournoi.';
  end if;

  update public.tournaments
  set status = 'in_progress', updated_at = now()
  where id = p_tournament_id;

  insert into public.rounds (tournament_id, number)
  values (p_tournament_id, 1)
  returning id into v_round;

  while v_index + 1 <= v_count loop
    insert into public.team_pairings (
      round_id, encounter_number, team_a_id, team_b_id, first_picker
    )
    values (
      v_round, v_encounter, v_teams[v_index], v_teams[v_index + 1],
      -- Le sort désigne qui posera en premier. Tiré ici, une fois.
      case when random() < 0.5 then v_teams[v_index] else v_teams[v_index + 1] end
    )
    returning id into v_pairing;
    perform public.seed_team_tables(v_pairing, v_team_size);
    v_encounter := v_encounter + 1;
    v_index := v_index + 2;
  end loop;

  if v_index = v_count then
    insert into public.team_pairings (round_id, encounter_number, team_a_id, team_b_id)
    values (v_round, v_encounter, v_teams[v_index], null)
    returning id into v_pairing;
    perform public.seed_team_tables(v_pairing, v_team_size);
  end if;

  return v_round;
end;
$$;

revoke execute on function public.start_team_tournament(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Le résultat d'une rencontre, et le classement des équipes
-- ---------------------------------------------------------------------------
-- Rien n'est stocké : tout se dérive de `pairings`. Corriger le score d'une
-- table met donc à jour la rencontre et le classement sans recalcul, et sans
-- possibilité de divergence entre les deux.
--
-- Une rencontre n'entre au classement que **toutes ses tables saisies** :
-- annoncer un vainqueur sur deux tables sur trois serait raconter une histoire
-- fausse.

create or replace view public.team_encounter_results
with (security_invoker = true) as
  select r.tournament_id,
         r.number as round_number,
         tp.id as encounter_id,
         tp.team_a_id as team_id,
         tp.team_b_id as opponent_id,
         sum(p.score_a)::int as points_for,
         sum(coalesce(p.score_b, 0))::int as points_against,
         sum(coalesce(p.tactics_a, 0))::int as tactics,
         count(*) filter (where p.score_a > coalesce(p.score_b, 0))::int as table_wins,
         count(*)::int as tables_played
  from public.team_pairings tp
  join public.rounds r on r.id = tp.round_id
  join public.pairings p on p.team_pairing_id = tp.id
  where p.score_a is not null
  group by r.tournament_id, r.number, tp.id, tp.team_a_id, tp.team_b_id
  having count(*) = (select count(*) from public.pairings p2 where p2.team_pairing_id = tp.id)
  union all
  select r.tournament_id,
         r.number,
         tp.id,
         tp.team_b_id,
         tp.team_a_id,
         sum(coalesce(p.score_b, 0))::int,
         sum(p.score_a)::int,
         sum(coalesce(p.tactics_b, 0))::int,
         count(*) filter (where coalesce(p.score_b, 0) > p.score_a)::int,
         count(*)::int
  from public.team_pairings tp
  join public.rounds r on r.id = tp.round_id
  join public.pairings p on p.team_pairing_id = tp.id
  where p.score_a is not null and tp.team_b_id is not null
  group by r.tournament_id, r.number, tp.id, tp.team_a_id, tp.team_b_id
  having count(*) = (select count(*) from public.pairings p2 where p2.team_pairing_id = tp.id);

grant select on public.team_encounter_results to authenticated, anon;

create or replace function public.team_standings(p_tournament_id uuid)
returns table (
  rank integer,
  team_registration_id uuid,
  team_id uuid,
  team_name text,
  region text,
  encounters integer,
  wins integer,
  draws integer,
  losses integer,
  /** Matchs individuels gagnés : information de lecture, jamais un départage. */
  table_wins integer,
  points_for integer,
  points_against integer,
  point_diff integer,
  tactics integer,
  match_score numeric,
  opponents_wins numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with results as (
    select * from public.team_encounter_results where tournament_id = p_tournament_id
  ),
  totals as (
    select e.team_id,
           count(*)::int as encounters,
           (count(*) filter (where e.points_for > e.points_against)
            + count(*) filter (where e.points_for = e.points_against) * 0.5) as match_score,
           count(*) filter (where e.points_for > e.points_against)::int as wins,
           count(*) filter (where e.points_for = e.points_against)::int as draws,
           count(*) filter (where e.points_for < e.points_against)::int as losses,
           coalesce(sum(e.table_wins), 0)::int as table_wins,
           coalesce(sum(e.points_for), 0)::int as points_for,
           coalesce(sum(e.points_against), 0)::int as points_against,
           coalesce(sum(e.tactics), 0)::int as tactics
    from results e
    group by e.team_id
  ),
  sos as (
    select e.team_id, coalesce(sum(t.match_score), 0) as opponents_wins
    from results e
    left join totals t on t.team_id = e.opponent_id
    where e.opponent_id is not null
    group by e.team_id
  )
  select row_number() over (
           order by t.match_score desc,
                    t.points_for desc,
                    t.tactics desc,
                    (t.points_for - t.points_against) desc,
                    coalesce(s.opponents_wins, 0) desc,
                    md5(t.team_id::text || p_tournament_id::text)
         )::int as rank,
         t.team_id as team_registration_id,
         tr.team_id,
         te.name,
         te.region,
         t.encounters,
         t.wins,
         t.draws,
         t.losses,
         t.table_wins,
         t.points_for,
         t.points_against,
         (t.points_for - t.points_against)::int as point_diff,
         t.tactics,
         t.match_score,
         coalesce(s.opponents_wins, 0) as opponents_wins
  from totals t
  join public.team_registrations tr on tr.id = t.team_id
  join public.teams te on te.id = tr.team_id
  left join sos s on s.team_id = t.team_id
  order by rank;
$$;

-- `security definer` pour la même raison que `circuit_standings` (0025) : la
-- fonction lit `teams`, et une page publique de tournoi doit pouvoir afficher
-- un classement d'équipes sans compte.
revoke execute on function public.team_standings(uuid) from public;
grant execute on function public.team_standings(uuid) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 6. La ronde suivante
-- ---------------------------------------------------------------------------

create or replace function public.generate_next_team_round(
  p_tournament_id uuid,
  p_allow_rematch boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rounds_count integer;
  v_team_size integer;
  v_current_id uuid;
  v_current_number integer;
  v_teams uuid[];
  v_bye uuid;
  v_bye_name text;
  v_pairs uuid[];
  v_new_round uuid;
  v_encounter integer := 1;
  v_pairing uuid;
  v_rematch integer[] := array[]::integer[];
  i integer;
begin
  select rounds_count, team_size into v_rounds_count, v_team_size
  from public.tournaments where id = p_tournament_id;

  select id, number into v_current_id, v_current_number
  from public.rounds where tournament_id = p_tournament_id
  order by number desc limit 1;

  update public.rounds set status = 'completed' where id = v_current_id;

  if v_current_number >= v_rounds_count then
    return jsonb_build_object(
      'next_round_number', null,
      'tables_count', 0,
      'bye_pseudo', null,
      'rematch_tables', '[]'::jsonb
    );
  end if;

  -- Les équipes, par groupes de score : c'est la définition du système suisse.
  select array_agg(s.team_registration_id order by s.rank)
  into v_teams
  from public.team_standings(p_tournament_id) s
  join public.team_registrations tr on tr.id = s.team_registration_id
  where tr.status = 'checked_in';

  if coalesce(array_length(v_teams, 1), 0) < 2 then
    raise exception 'Il faut au moins deux équipes pour générer une ronde.';
  end if;

  if array_length(v_teams, 1) % 2 = 1 then
    -- Bye tournant : la dernière équipe du classement qui ne l'a pas encore eu.
    select t_id into v_bye from (
      select unnest(v_teams) as t_id, generate_subscripts(v_teams, 1) as pos
    ) ordered
    where not exists (
      select 1 from public.team_pairings tp
      join public.rounds r on r.id = tp.round_id
      where r.tournament_id = p_tournament_id
        and tp.team_b_id is null
        and tp.team_a_id = ordered.t_id
    )
    order by pos desc
    limit 1;

    if v_bye is null then
      v_bye := v_teams[array_length(v_teams, 1)];
    end if;
    v_teams := array_remove(v_teams, v_bye);
    select te.name into v_bye_name
    from public.team_registrations tr
    join public.teams te on te.id = tr.team_id
    where tr.id = v_bye;
  end if;

  v_pairs := public.swiss_pair_teams(p_tournament_id, v_teams);

  if v_pairs is null then
    if not p_allow_rematch then
      raise exception 'NO_PAIRING_POSSIBLE';
    end if;
    v_pairs := v_teams;
  end if;

  insert into public.rounds (tournament_id, number)
  values (p_tournament_id, v_current_number + 1)
  returning id into v_new_round;

  i := 1;
  while i < array_length(v_pairs, 1) loop
    if public.already_met_team(p_tournament_id, v_pairs[i], v_pairs[i + 1]) then
      v_rematch := v_rematch || v_encounter;
    end if;
    insert into public.team_pairings (
      round_id, encounter_number, team_a_id, team_b_id, first_picker
    )
    values (
      v_new_round, v_encounter, v_pairs[i], v_pairs[i + 1],
      case when random() < 0.5 then v_pairs[i] else v_pairs[i + 1] end
    )
    returning id into v_pairing;
    perform public.seed_team_tables(v_pairing, v_team_size);
    v_encounter := v_encounter + 1;
    i := i + 2;
  end loop;

  if v_bye is not null then
    insert into public.team_pairings (round_id, encounter_number, team_a_id, team_b_id)
    values (v_new_round, v_encounter, v_bye, null)
    returning id into v_pairing;
    perform public.seed_team_tables(v_pairing, v_team_size);
    v_encounter := v_encounter + 1;
  end if;

  return jsonb_build_object(
    'next_round_number', v_current_number + 1,
    'tables_count', v_encounter - 1,
    'bye_pseudo', v_bye_name,
    'rematch_tables', to_jsonb(v_rematch)
  );
end;
$$;

revoke execute on function public.generate_next_team_round(uuid, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. L'aiguillage vit en base, pas dans le client
-- ---------------------------------------------------------------------------
-- Une règle métier écrite dans le back office est une règle qui n'existe que
-- dans une des deux applications. Le back office continue d'appeler
-- `start_tournament` et `generate_next_round` sans savoir qu'il existe des
-- tournois par équipes.

create or replace function public.start_tournament(p_tournament_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_organizer uuid;
  v_status text;
  v_type text;
  v_round uuid;
  v_players uuid[];
  v_count integer;
  v_table integer := 1;
  v_index integer := 1;
  v_bye record;
begin
  if v_caller is null then
    raise exception 'Il faut être connecté.';
  end if;

  select organizer_id, status, type into v_organizer, v_status, v_type
  from public.tournaments where id = p_tournament_id
  for update;

  if v_organizer is null then
    raise exception 'Tournoi introuvable.';
  end if;
  if v_organizer <> v_caller then
    raise exception 'Seul l''organisateur peut lancer le tournoi.';
  end if;
  if v_status <> 'open' then
    raise exception 'Ce tournoi ne peut plus être lancé.';
  end if;

  if v_type = 'team' then
    return public.start_team_tournament(p_tournament_id);
  end if;

  select array_agg(player_id order by random()), count(*)
  into v_players, v_count
  from public.registrations
  where tournament_id = p_tournament_id and status = 'checked_in';

  if coalesce(v_count, 0) < 2 then
    raise exception 'Il faut au moins deux joueurs présents pour lancer le tournoi.';
  end if;

  update public.tournaments
  set status = 'in_progress', updated_at = now()
  where id = p_tournament_id;

  insert into public.rounds (tournament_id, number)
  values (p_tournament_id, 1)
  returning id into v_round;

  while v_index + 1 <= v_count loop
    insert into public.pairings (round_id, table_number, player_a_id, player_b_id)
    values (v_round, v_table, v_players[v_index], v_players[v_index + 1]);
    v_table := v_table + 1;
    v_index := v_index + 2;
  end loop;

  if v_index = v_count then
    select * into v_bye from public.bye_scores();
    insert into public.pairings (round_id, table_number, player_a_id, player_b_id, score_a, score_b)
    values (v_round, v_table, v_players[v_index], null, v_bye.winner, v_bye.loser);
  end if;

  return v_round;
end;
$$;

revoke execute on function public.start_tournament(uuid) from public, anon;
grant execute on function public.start_tournament(uuid) to authenticated;

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
  v_type text;
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
    raise exception 'Il faut être connecté.';
  end if;

  select organizer_id, status, rounds_count, type
  into v_organizer, v_status, v_rounds_count, v_type
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

  if v_current_status = 'completed' then
    raise exception 'ROUND_ALREADY_CLOSED';
  end if;

  -- Le contrôle des scores manquants vaut pour les deux formats : une rencontre
  -- se clôt table par table, comme une ronde individuelle.
  select count(*) into v_missing
  from public.pairings
  where round_id = v_current_id and score_a is null;

  if v_missing > 0 then
    raise exception 'MISSING_SCORES:%', v_missing;
  end if;

  if v_type = 'team' then
    return public.generate_next_team_round(p_tournament_id, p_allow_rematch);
  end if;

  update public.rounds set status = 'completed' where id = v_current_id;

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
      v_bye := v_players[array_length(v_players, 1)];
    end if;
    v_players := array_remove(v_players, v_bye);
    select pseudo into v_bye_pseudo from public.profiles where id = v_bye;
  end if;

  v_pairs := public.swiss_pair(p_tournament_id, v_players);

  if v_pairs is null then
    if not p_allow_rematch then
      raise exception 'NO_PAIRING_POSSIBLE';
    end if;
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
