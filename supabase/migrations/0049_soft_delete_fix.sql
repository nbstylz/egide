-- Migration 0049 : la suppression douce ne vide plus le message (EPIC-8)
--
-- La 0048 voulait effacer le corps du message à la suppression. Impossible : la
-- contrainte `char_length(btrim(body)) between 1 and 2000` refuse la chaîne
-- vide. L'assertion l'a montré avant tout usage réel.
--
-- La correction est meilleure que l'intention de départ. Le corps est
-- **conservé en base et masqué à la lecture** : la modération garde de quoi
-- instruire un signalement — un message supprimé par son auteur juste après
-- avoir été signalé serait sinon perdu — et le client, lui, ne le reçoit
-- jamais. Le masquage vit dans `thread_messages`, seule porte de lecture.
--
-- Corollaire à connaître : le texte supprimé existe toujours dans la table.
-- C'est un choix de modération, pas un oubli. Une purge des messages supprimés
-- de plus de N mois serait la suite logique, quand la question se posera.

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

  -- Le corps reste : c'est `thread_messages` qui ne le rend plus.
  update public.messages
  set deleted_at = now(), deleted_by = v_caller
  where id = p_message_id;
end;
$$;

revoke execute on function public.delete_message(uuid) from public, anon;
grant execute on function public.delete_message(uuid) to authenticated;

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
         -- Un message supprimé garde sa place dans le fil : une réponse qui
         -- suivrait un trou deviendrait incompréhensible. Mais son texte ne
         -- sort jamais de la base.
         case when m.deleted_at is null then m.body else '' end,
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
