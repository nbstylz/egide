-- Migration 0033 : administration des équipes (US-12.5)
--
-- Garder l'annuaire des équipes sain : renommer un nom inapproprié,
-- dissoudre une équipe abandonnée.
--
-- Le backlog proposait d'« étendre `disband_team` aux admins ». On ne le fait
-- pas : `disband_team` ne demande aucun motif, l'ouvrir aux admins créerait
-- un chemin de dissolution non tracé — précisément ce que le critère 3 de
-- cette US interdit. `disband_team` reste donc au capitaine, et
-- l'administration passe par sa propre porte, qui exige un motif.
--
-- ATTENTION EPIC-7 : quand les tournois par équipes existeront, dissoudre
-- une équipe ne devra plus effacer son historique de résultats. À re-trancher
-- à ce moment-là ; aujourd'hui une équipe ne porte aucun résultat.

/** L'annuaire complet des équipes, capitaine et effectif compris. */
create or replace function public.admin_teams(p_limit int default 200)
returns table (
  id uuid,
  name text,
  region text,
  description text,
  captain_id uuid,
  captain_pseudo text,
  member_count bigint,
  created_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    t.id, t.name, t.region, t.description, t.captain_id, p.pseudo,
    (select count(*) from public.team_members m where m.team_id = t.id),
    t.created_at
  from public.teams t
  left join public.profiles p on p.id = t.captain_id
  where public.is_admin()
  order by t.created_at desc
  limit greatest(p_limit, 1);
$$;

revoke execute on function public.admin_teams(int) from public, anon;
grant execute on function public.admin_teams(int) to authenticated;

/**
 * Renomme une équipe. Le capitaine découvrira le nouveau nom dans l'app :
 * c'est voulu, une notification pour un nom jugé inapproprié inviterait à la
 * discussion là où le journal suffit.
 */
create or replace function public.admin_rename_team(
  p_team_id uuid,
  p_name text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text;
  v_new text := btrim(coalesce(p_name, ''));
begin
  if not public.is_admin() then
    raise exception 'Réservé aux administrateurs.';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Un motif d''au moins 10 caractères est obligatoire.';
  end if;
  if char_length(v_new) < 3 or char_length(v_new) > 40 then
    raise exception 'Le nom doit faire entre 3 et 40 caractères.';
  end if;

  select name into v_old from public.teams where id = p_team_id for update;
  if v_old is null then
    raise exception 'Équipe introuvable.';
  end if;
  if v_old = v_new then
    raise exception 'Ce nom est déjà celui de l''équipe.';
  end if;

  begin
    update public.teams set name = v_new, updated_at = now() where id = p_team_id;
  exception when unique_violation then
    -- Le message brut de Postgres parlerait d'un index : illisible pour qui
    -- vient de taper un nom.
    raise exception 'Une autre équipe porte déjà le nom « % ».', v_new;
  end;

  perform public.log_admin_action(
    'rename_team', 'team', p_team_id, btrim(p_reason),
    jsonb_build_object('from', v_old, 'to', v_new)
  );
end;
$$;

revoke execute on function public.admin_rename_team(uuid, text, text) from public, anon;
grant execute on function public.admin_rename_team(uuid, text, text) to authenticated;

/**
 * Dissout une équipe. On consigne AVANT de supprimer : après le `delete`, le
 * nom et l'effectif n'existent plus, et un journal qui ne dit pas ce qui a
 * disparu ne sert à rien.
 */
create or replace function public.admin_disband_team(
  p_team_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_members bigint;
  v_captain text;
begin
  if not public.is_admin() then
    raise exception 'Réservé aux administrateurs.';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Un motif d''au moins 10 caractères est obligatoire.';
  end if;

  -- `for update of t` et non `for update` : le verrou ne peut pas porter sur
  -- le côté nullable d'une jointure externe, et c'est bien l'équipe qu'on
  -- verrouille, pas le profil du capitaine.
  select t.name, p.pseudo into v_name, v_captain
  from public.teams t left join public.profiles p on p.id = t.captain_id
  where t.id = p_team_id for update of t;
  if v_name is null then
    raise exception 'Équipe introuvable.';
  end if;

  select count(*) into v_members from public.team_members where team_id = p_team_id;

  perform public.log_admin_action(
    'disband_team', 'team', p_team_id, btrim(p_reason),
    jsonb_build_object('name', v_name, 'captain', v_captain, 'members', v_members)
  );

  -- `team_members` part en cascade (migration 0015).
  delete from public.teams where id = p_team_id;
end;
$$;

revoke execute on function public.admin_disband_team(uuid, text) from public, anon;
grant execute on function public.admin_disband_team(uuid, text) to authenticated;

/** Les mesures déjà prises sur une équipe. */
create or replace function public.admin_team_history(p_team_id uuid)
returns table (
  action text,
  reason text,
  created_at timestamptz,
  admin_pseudo text,
  detail jsonb
)
language sql
security definer
stable
set search_path = public
as $$
  select a.action, a.reason, a.created_at, p.pseudo, a.detail
  from public.admin_actions a
  left join public.profiles p on p.id = a.admin_id
  where public.is_admin()
    and a.target_type = 'team'
    and a.target_id = p_team_id
  order by a.created_at desc
  limit 20;
$$;

revoke execute on function public.admin_team_history(uuid) from public, anon;
grant execute on function public.admin_team_history(uuid) to authenticated;
