-- Migration 0028 : rôle admin et journal d'audit (US-12.1)
--
-- Dès que l'app accueille de vrais joueurs, quelqu'un doit pouvoir intervenir
-- (tournoi fantôme, nom d'équipe offensant, compte nuisible) sans ouvrir le
-- SQL à la main. Ce pouvoir doit être vérifié par la base, jamais par
-- l'interface : le back office ne fait qu'afficher ce que la base l'autorise
-- à voir.
--
-- NOMMER LE PREMIER ADMIN (à faire une fois, à la main, depuis le dashboard
-- Supabase → SQL Editor — il n'existe aucun chemin applicatif pour cela, et
-- c'est voulu) :
--
--   update public.profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'ton.email@exemple.fr');
--
-- Ensuite seulement, un admin peut en nommer d'autres via `set_admin_role()`.

-- ---------------------------------------------------------------------------
-- 1. Le rôle
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column role text not null default 'user'
  check (role in ('user', 'admin'));

-- La 0001 avait accordé UPDATE sur la table entière : toute colonne ajoutée
-- depuis est donc modifiable par son propriétaire. Sans ce garde-fou,
-- n'importe qui se nommerait admin d'un simple update sur son propre profil.
-- Même remède qu'en 0016 pour le code d'invitation : GRANT colonne par
-- colonne. On reconduit à l'identique les colonnes déjà écrivables (l'app
-- envoie `id` dans son upsert de création de profil : le retirer casserait
-- la création de compte) — seul `role` est laissé de côté.
revoke update on public.profiles from authenticated, anon;

grant update (id, pseudo, region, faction_favorite, created_at, updated_at,
              notify_region, notify_registrations)
  on public.profiles to authenticated, anon;

/**
 * Seule source de vérité du pouvoir d'administration : toute fonction admin
 * commence par l'appeler. `security definer` pour rester vraie quelles que
 * soient les politiques de lecture de `profiles` à l'avenir.
 */
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Le journal d'audit
-- ---------------------------------------------------------------------------

-- Un pouvoir non tracé n'est pas un pouvoir de confiance : chaque action
-- d'administration laisse une ligne, avec son motif. La table n'est jamais
-- écrite par le front — seules les fonctions admin y déposent, en tant que
-- propriétaire, via `log_admin_action()`.
create table public.admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles (id),
  action text not null,
  target_type text not null,
  target_id uuid,
  reason text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index admin_actions_created_at_idx on public.admin_actions (created_at desc);
create index admin_actions_target_idx on public.admin_actions (target_type, target_id);

alter table public.admin_actions enable row level security;

create policy "Le journal d'audit n'est lisible que par les admins"
  on public.admin_actions for select
  to authenticated
  using (public.is_admin());

-- Aucune écriture directe, pour personne : le journal ne se falsifie pas
-- depuis un client.
revoke insert, update, delete on public.admin_actions from authenticated, anon;

/**
 * Dépose une ligne au journal. Réservée aux fonctions admin : aucun rôle
 * client ne peut l'exécuter (elles l'appellent en tant que propriétaire).
 */
create or replace function public.log_admin_action(
  p_action text,
  p_target_type text,
  p_target_id uuid,
  p_reason text,
  p_detail jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.admin_actions (admin_id, action, target_type, target_id, reason, detail)
  values (auth.uid(), p_action, p_target_type, p_target_id, p_reason, p_detail);
$$;

revoke execute on function public.log_admin_action(text, text, uuid, text, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Nommer et révoquer un admin
-- ---------------------------------------------------------------------------

/**
 * Change le rôle d'un profil. Refuse de laisser la plateforme sans aucun
 * admin : c'est la seule façon de se retrouver enfermé dehors, sans chemin
 * de retour autre que le SQL à la main.
 */
create or replace function public.set_admin_role(
  p_profile_id uuid,
  p_role text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current text;
  v_admin_count int;
begin
  if not public.is_admin() then
    raise exception 'Réservé aux administrateurs.';
  end if;

  if p_role not in ('user', 'admin') then
    raise exception 'Rôle inconnu : %', p_role;
  end if;

  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Un motif est obligatoire.';
  end if;

  select role into v_current from public.profiles where id = p_profile_id for update;
  if v_current is null then
    raise exception 'Profil introuvable.';
  end if;

  -- Rien à faire : on ne pollue pas le journal avec des non-événements.
  if v_current = p_role then
    return;
  end if;

  if v_current = 'admin' and p_role = 'user' then
    select count(*) into v_admin_count from public.profiles where role = 'admin';
    if v_admin_count <= 1 then
      raise exception 'Impossible de retirer le dernier administrateur.';
    end if;
  end if;

  update public.profiles set role = p_role, updated_at = now() where id = p_profile_id;

  perform public.log_admin_action(
    case when p_role = 'admin' then 'grant_admin' else 'revoke_admin' end,
    'profile',
    p_profile_id,
    p_reason,
    jsonb_build_object('from', v_current, 'to', p_role)
  );
end;
$$;

revoke execute on function public.set_admin_role(uuid, text, text) from public, anon;
grant execute on function public.set_admin_role(uuid, text, text) to authenticated;
