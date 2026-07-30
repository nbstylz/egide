-- Migration 0015 : équipes (EPIC-4)
--
-- Une équipe a un capitaine et des membres. On la rejoint avec un code
-- d'invitation court, que le capitaine peut régénérer s'il a fuité.

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 3 and 40),
  description text,
  region text,
  captain_id uuid not null references public.profiles (id) on delete restrict,
  -- Code dicté à voix haute : lettres et chiffres sans O/0 ni I/1.
  invite_code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('captain', 'member')),
  joined_at timestamptz not null default now(),
  -- Un joueur n'appartient qu'une fois à une équipe donnée.
  unique (team_id, player_id)
);

create index team_members_team_idx on public.team_members (team_id);
create index team_members_player_idx on public.team_members (player_id);

alter table public.teams enable row level security;
alter table public.team_members enable row level security;

-- Les équipes sont publiques : l'annuaire doit être consultable.
create policy "Les équipes sont visibles par tous"
  on public.teams for select to authenticated, anon using (true);

create policy "Les membres d'équipe sont visibles par tous"
  on public.team_members for select to authenticated, anon using (true);

-- Aucune politique d'écriture directe : tout passe par les fonctions
-- ci-dessous, qui vérifient les rôles.

/**
 * Code d'invitation de 6 caractères, sans les glyphes qui se confondent
 * à l'oral ou à la lecture (O/0, I/1, L).
 */
create or replace function public.generate_invite_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_try integer := 0;
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.teams where invite_code = v_code);
    v_try := v_try + 1;
    if v_try > 50 then
      raise exception 'Impossible de générer un code d''invitation.';
    end if;
  end loop;
  return v_code;
end;
$$;

/** Crée une équipe ; son créateur en devient capitaine et membre. */
create or replace function public.create_team(
  p_name text,
  p_description text default null,
  p_region text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_team uuid;
begin
  if v_caller is null then
    raise exception 'Il faut être connecté.';
  end if;
  if not exists (select 1 from public.profiles where id = v_caller) then
    raise exception 'Il faut avoir créé son profil.';
  end if;
  if exists (select 1 from public.team_members where player_id = v_caller) then
    raise exception 'ALREADY_IN_TEAM';
  end if;
  if char_length(coalesce(trim(p_name), '')) < 3 then
    raise exception 'Le nom de l''équipe doit contenir au moins 3 caractères.';
  end if;
  if exists (select 1 from public.teams where lower(name) = lower(trim(p_name))) then
    raise exception 'NAME_TAKEN';
  end if;

  insert into public.teams (name, description, region, captain_id, invite_code)
  values (
    trim(p_name),
    nullif(trim(coalesce(p_description, '')), ''),
    nullif(trim(coalesce(p_region, '')), ''),
    v_caller,
    public.generate_invite_code()
  )
  returning id into v_team;

  insert into public.team_members (team_id, player_id, role)
  values (v_team, v_caller, 'captain');

  return v_team;
end;
$$;

/** Rejoint une équipe à partir de son code d'invitation. */
create or replace function public.join_team(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_team uuid;
begin
  if v_caller is null then
    raise exception 'Il faut être connecté.';
  end if;
  if not exists (select 1 from public.profiles where id = v_caller) then
    raise exception 'Il faut avoir créé son profil.';
  end if;
  if exists (select 1 from public.team_members where player_id = v_caller) then
    raise exception 'ALREADY_IN_TEAM';
  end if;

  select id into v_team from public.teams
  where upper(invite_code) = upper(trim(p_invite_code));

  if v_team is null then
    raise exception 'INVALID_CODE';
  end if;

  insert into public.team_members (team_id, player_id, role)
  values (v_team, v_caller, 'member');

  return v_team;
end;
$$;

/** Régénère le code d'invitation (capitaine seulement). */
create or replace function public.regenerate_invite_code(p_team_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_code text;
begin
  if not exists (
    select 1 from public.teams where id = p_team_id and captain_id = v_caller
  ) then
    raise exception 'Seul le capitaine peut régénérer le code.';
  end if;

  v_code := public.generate_invite_code();
  update public.teams set invite_code = v_code, updated_at = now() where id = p_team_id;
  return v_code;
end;
$$;

/** Retire un membre (capitaine), ou permet à un membre de partir. */
create or replace function public.leave_team(p_team_id uuid, p_player_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_target uuid := coalesce(p_player_id, v_caller);
  v_captain uuid;
begin
  if v_caller is null then
    raise exception 'Il faut être connecté.';
  end if;

  select captain_id into v_captain from public.teams where id = p_team_id;
  if v_captain is null then
    raise exception 'Équipe introuvable.';
  end if;

  -- Retirer quelqu'un d'autre est réservé au capitaine.
  if v_target <> v_caller and v_captain <> v_caller then
    raise exception 'Seul le capitaine peut retirer un membre.';
  end if;

  -- Le capitaine doit d'abord transmettre son rôle : une équipe sans
  -- capitaine ne pourrait plus être gérée.
  if v_target = v_captain then
    raise exception 'CAPTAIN_MUST_TRANSFER';
  end if;

  delete from public.team_members where team_id = p_team_id and player_id = v_target;
end;
$$;

/** Transmet le capitanat à un autre membre. */
create or replace function public.transfer_captaincy(p_team_id uuid, p_new_captain uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if not exists (
    select 1 from public.teams where id = p_team_id and captain_id = v_caller
  ) then
    raise exception 'Seul le capitaine peut transmettre son rôle.';
  end if;
  if not exists (
    select 1 from public.team_members
    where team_id = p_team_id and player_id = p_new_captain
  ) then
    raise exception 'Ce joueur ne fait pas partie de l''équipe.';
  end if;

  update public.teams set captain_id = p_new_captain, updated_at = now()
  where id = p_team_id;
  update public.team_members set role = 'member'
  where team_id = p_team_id and player_id = v_caller;
  update public.team_members set role = 'captain'
  where team_id = p_team_id and player_id = p_new_captain;
end;
$$;

/** Dissout l'équipe (capitaine seulement). */
create or replace function public.disband_team(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if not exists (
    select 1 from public.teams where id = p_team_id and captain_id = v_caller
  ) then
    raise exception 'Seul le capitaine peut dissoudre l''équipe.';
  end if;
  delete from public.teams where id = p_team_id;
end;
$$;

revoke execute on function public.generate_invite_code() from public, anon, authenticated;
revoke execute on function public.create_team(text, text, text) from public, anon;
revoke execute on function public.join_team(text) from public, anon;
revoke execute on function public.regenerate_invite_code(uuid) from public, anon;
revoke execute on function public.leave_team(uuid, uuid) from public, anon;
revoke execute on function public.transfer_captaincy(uuid, uuid) from public, anon;
revoke execute on function public.disband_team(uuid) from public, anon;
grant execute on function public.create_team(text, text, text) to authenticated;
grant execute on function public.join_team(text) to authenticated;
grant execute on function public.regenerate_invite_code(uuid) to authenticated;
grant execute on function public.leave_team(uuid, uuid) to authenticated;
grant execute on function public.transfer_captaincy(uuid, uuid) to authenticated;
grant execute on function public.disband_team(uuid) to authenticated;
