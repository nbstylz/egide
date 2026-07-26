-- Migration 0008 : rondes et appariements (US-3.2)
--
-- Une ronde regroupe les appariements d'un tour de jeu. Un appariement oppose
-- deux joueurs sur une table numérotée ; quand les présents sont en nombre
-- impair, un joueur est « exempt » (bye) : son adversaire est absent
-- (player_b_id null) et il remporte la ronde 15 à 5 (règle validée par le
-- porteur du projet le 2026-07-26).

create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  number integer not null check (number >= 1),
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  created_at timestamptz not null default now(),
  unique (tournament_id, number)
);

create table public.pairings (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds (id) on delete cascade,
  table_number integer not null check (table_number >= 1),
  player_a_id uuid not null references public.profiles (id) on delete cascade,
  -- null = ce joueur est exempt pour cette ronde.
  player_b_id uuid references public.profiles (id) on delete cascade,
  score_a integer check (score_a >= 0),
  score_b integer check (score_b >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (round_id, table_number),
  -- Un joueur ne s'affronte pas lui-même.
  check (player_b_id is null or player_a_id <> player_b_id)
);

create index rounds_tournament_idx on public.rounds (tournament_id, number);
create index pairings_round_idx on public.pairings (round_id, table_number);
create index pairings_player_a_idx on public.pairings (player_a_id);
create index pairings_player_b_idx on public.pairings (player_b_id);

alter table public.rounds enable row level security;
alter table public.pairings enable row level security;

-- Les appariements et les scores sont publics : les joueurs consultent leur
-- table et le classement depuis l'app mobile, même sans compte.
create policy "Les rondes sont visibles par tous"
  on public.rounds for select to authenticated, anon using (true);

create policy "Les appariements sont visibles par tous"
  on public.pairings for select to authenticated, anon using (true);

-- Aucune politique d'écriture : rondes et appariements ne sont créés et
-- modifiés que par les fonctions ci-dessous, qui vérifient l'organisateur.

/** Points de partie attribués au joueur exempt, et à son adversaire fictif. */
create or replace function public.bye_scores()
returns table (winner integer, loser integer)
language sql
immutable
set search_path = public
as $$ select 15, 5 $$;

/**
 * Lance le tournoi : fige les inscriptions, crée la ronde 1 et apparie
 * aléatoirement les joueurs pointés présents.
 */
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

  select organizer_id, status into v_organizer, v_status
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

  -- Seuls les joueurs pointés présents sont appariés : c'est tout l'objet
  -- du check-in (US-3.1).
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

  -- Appariements deux par deux dans l'ordre tiré au sort.
  while v_index + 1 <= v_count loop
    insert into public.pairings (round_id, table_number, player_a_id, player_b_id)
    values (v_round, v_table, v_players[v_index], v_players[v_index + 1]);
    v_table := v_table + 1;
    v_index := v_index + 2;
  end loop;

  -- Nombre impair : le dernier joueur est exempt, avec son score déjà acquis.
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
