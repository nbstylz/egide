-- Migration 0048 : fils de discussion (EPIC-8)
--
-- Deux portées, une seule table : le fil d'un **tournoi** (ses inscrits et son
-- organisateur) et le fil d'une **équipe** (ses membres). Une table par portée
-- aurait dupliqué la modération, le signalement et la suppression douce —
-- c'est-à-dire trois règles à tenir en double, dont deux touchent à la sécurité.
--
-- PAS DE TEMPS RÉEL, décision assumée du projet : on tire pour rafraîchir. Un
-- fil de tournoi n'est pas une messagerie instantanée ; il sert à demander une
-- place de covoiturage et à savoir si le tournoi est maintenu sous la neige.
--
-- SUPPRESSION DOUCE, jamais d'effacement. Trois raisons : le fil garde sa
-- forme (une réponse qui suit un message disparu devient incompréhensible), la
-- modération reste auditable, et un capitaine ne peut pas réécrire l'histoire
-- de son équipe. Le corps du message, lui, cesse d'être lisible.

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  -- Exactement une des deux portées, jamais les deux, jamais aucune.
  tournament_id uuid references public.tournaments (id) on delete cascade,
  team_id uuid references public.teams (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  constraint messages_one_scope
    check ((tournament_id is not null) <> (team_id is not null))
);

create index messages_tournament_idx on public.messages (tournament_id, created_at);
create index messages_team_idx on public.messages (team_id, created_at);

alter table public.messages enable row level security;

-- Le fil d'un tournoi se lit par ceux qui y sont : inscrits (même désistés — ils
-- ont pu poser une question avant de partir) et organisateur. Pas de lecture
-- anonyme : un fil de discussion n'est pas une page publique.
create policy "Le fil d'un tournoi se lit par ses participants"
  on public.messages for select
  to authenticated
  using (
    tournament_id is not null
    and (
      exists (
        select 1 from public.registrations r
        where r.tournament_id = messages.tournament_id
          and r.player_id = (select auth.uid())
      )
      or exists (
        select 1 from public.tournaments t
        where t.id = messages.tournament_id and t.organizer_id = (select auth.uid())
      )
    )
  );

create policy "Le fil d'une équipe se lit par ses membres"
  on public.messages for select
  to authenticated
  using (
    team_id is not null
    and exists (
      select 1 from public.team_members m
      where m.team_id = messages.team_id and m.player_id = (select auth.uid())
    )
  );

-- Aucune politique d'écriture : tout passe par les fonctions ci-dessous, qui
-- vérifient l'appartenance. Une politique `insert` aurait laissé le client
-- choisir son `author_id`.
grant select on public.messages to authenticated;

create table public.message_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason text check (reason is null or char_length(btrim(reason)) <= 500),
  created_at timestamptz not null default now(),
  -- Un signalement par personne et par message : signaler deux fois ne pèse pas
  -- deux fois plus lourd.
  unique (message_id, reporter_id)
);

alter table public.message_reports enable row level security;

-- Personne ne lit les signalements depuis un client : ils sont là pour la
-- modération, qui se fait en base. Aucune politique de lecture, donc.

-- ---------------------------------------------------------------------------
-- Écrire
-- ---------------------------------------------------------------------------

create or replace function public.post_message(
  p_tournament_id uuid,
  p_team_id uuid,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
  v_status text;
begin
  if v_caller is null then
    raise exception 'Il faut être connecté.';
  end if;
  if (p_tournament_id is null) = (p_team_id is null) then
    raise exception 'ONE_SCOPE_REQUIRED';
  end if;
  if char_length(v_body) = 0 then
    raise exception 'EMPTY_MESSAGE';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'MESSAGE_TOO_LONG';
  end if;

  if p_tournament_id is not null then
    select status into v_status from public.tournaments where id = p_tournament_id;
    if v_status is null then
      raise exception 'NOT_FOUND';
    end if;
    -- Un tournoi annulé n'a plus de fil : il n'y a plus rien à organiser.
    if v_status = 'cancelled' then
      raise exception 'TOURNAMENT_CANCELLED';
    end if;
    if not exists (
      select 1 from public.registrations r
      where r.tournament_id = p_tournament_id
        and r.player_id = v_caller
        and r.status <> 'withdrawn'
    ) and not exists (
      select 1 from public.tournaments t
      where t.id = p_tournament_id and t.organizer_id = v_caller
    ) then
      raise exception 'NOT_A_PARTICIPANT';
    end if;
  else
    if not exists (
      select 1 from public.team_members m
      where m.team_id = p_team_id and m.player_id = v_caller
    ) then
      raise exception 'NOT_A_MEMBER';
    end if;
  end if;

  insert into public.messages (tournament_id, team_id, author_id, body)
  values (p_tournament_id, p_team_id, v_caller, v_body)
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.post_message(uuid, uuid, text) from public, anon;
grant execute on function public.post_message(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Modérer
-- ---------------------------------------------------------------------------
-- Qui peut supprimer : l'auteur (on se relit et on se ravise), l'organisateur
-- sur le fil de son tournoi, le capitaine sur le fil de son équipe. Personne
-- d'autre — et surtout pas l'auteur d'un message voisin.

create or replace function public.delete_message(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_author uuid;
  v_tournament uuid;
  v_team uuid;
  v_allowed boolean := false;
begin
  if v_caller is null then
    raise exception 'Il faut être connecté.';
  end if;

  select author_id, tournament_id, team_id
    into v_author, v_tournament, v_team
  from public.messages where id = p_message_id and deleted_at is null;

  if v_author is null then
    raise exception 'NOT_FOUND';
  end if;

  if v_author = v_caller then
    v_allowed := true;
  elsif v_tournament is not null then
    v_allowed := exists (
      select 1 from public.tournaments t
      where t.id = v_tournament and t.organizer_id = v_caller
    );
  else
    v_allowed := exists (
      select 1 from public.teams te where te.id = v_team and te.captain_id = v_caller
    );
  end if;

  if not v_allowed then
    raise exception 'NOT_ALLOWED';
  end if;

  update public.messages
  set deleted_at = now(), deleted_by = v_caller, body = ''
  where id = p_message_id;
end;
$$;

revoke execute on function public.delete_message(uuid) from public, anon;
grant execute on function public.delete_message(uuid) to authenticated;

/**
 * Signaler un message. Le signalement ne supprime rien et ne prévient personne
 * automatiquement : il pose une trace que la modération peut relire. Promettre
 * une action immédiate qu'aucun mécanisme ne rend serait mentir.
 */
create or replace function public.report_message(
  p_message_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'Il faut être connecté.';
  end if;
  if not exists (select 1 from public.messages where id = p_message_id) then
    raise exception 'NOT_FOUND';
  end if;

  insert into public.message_reports (message_id, reporter_id, reason)
  values (p_message_id, v_caller, nullif(btrim(coalesce(p_reason, '')), ''))
  on conflict (message_id, reporter_id) do update
    set reason = excluded.reason, created_at = now();
end;
$$;

revoke execute on function public.report_message(uuid, text) from public, anon;
grant execute on function public.report_message(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Lire
-- ---------------------------------------------------------------------------
-- Une fonction plutôt qu'une lecture directe : elle joint les pseudos et dit,
-- pour chaque message, si l'appelant peut le supprimer. Sans ce drapeau, le
-- client devrait refaire les règles de modération de son côté — deux copies
-- d'une même règle qui finiraient par diverger.

create or replace function public.thread_messages(
  p_tournament_id uuid,
  p_team_id uuid,
  p_limit integer default 100
)
returns table (
  id uuid,
  author_id uuid,
  author_pseudo text,
  body text,
  created_at timestamptz,
  deleted boolean,
  can_delete boolean
)
language sql
security invoker
stable
set search_path = public
as $$
  select m.id,
         m.author_id,
         p.pseudo,
         m.body,
         m.created_at,
         m.deleted_at is not null,
         m.deleted_at is null
           and (
             m.author_id = (select auth.uid())
             or exists (
               select 1 from public.tournaments t
               where t.id = m.tournament_id and t.organizer_id = (select auth.uid())
             )
             or exists (
               select 1 from public.teams te
               where te.id = m.team_id and te.captain_id = (select auth.uid())
             )
           )
  from public.messages m
  join public.profiles p on p.id = m.author_id
  where (p_tournament_id is not null and m.tournament_id = p_tournament_id)
     or (p_team_id is not null and m.team_id = p_team_id)
  order by m.created_at desc
  limit least(coalesce(p_limit, 100), 200);
$$;

revoke execute on function public.thread_messages(uuid, uuid, integer) from public, anon;
grant execute on function public.thread_messages(uuid, uuid, integer) to authenticated;
