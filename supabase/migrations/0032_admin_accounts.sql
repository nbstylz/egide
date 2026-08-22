-- Migration 0032 : annuaire des comptes et désactivation (US-12.4)
--
-- Couper l'accès d'un compte nuisible sans rien supprimer : ses tournois,
-- ses résultats et ses équipes restent intacts, seule la connexion est
-- refusée. L'état « désactivé » n'est pas une colonne de plus à tenir à
-- jour : c'est `auth.users.banned_until`, que seul GoTrue écrit. Une copie
-- dans `profiles` finirait par diverger de la vérité.
--
-- Le bannissement lui-même passe par l'API admin de Supabase Auth, donc par
-- l'Edge Function `admin-account` (clé service). Les règles, elles, restent
-- ici : la fonction Edge ne fait qu'exécuter ce que la base a autorisé.

/**
 * L'annuaire des comptes. L'e-mail vit dans `auth.users`, qu'aucun client ne
 * peut lire — d'où le `security definer` et la garde `is_admin()`.
 */
create or replace function public.admin_accounts(p_limit int default 200)
returns table (
  id uuid,
  pseudo text,
  region text,
  role text,
  email text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  banned_until timestamptz,
  tournaments_organized bigint,
  registrations_count bigint
)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.id, p.pseudo, p.region, p.role, u.email::text,
    p.created_at, u.last_sign_in_at, u.banned_until,
    (select count(*) from public.tournaments t where t.organizer_id = p.id),
    (select count(*) from public.registrations r where r.player_id = p.id)
  from public.profiles p
  join auth.users u on u.id = p.id
  where public.is_admin()
  order by p.created_at desc
  limit greatest(p_limit, 1);
$$;

revoke execute on function public.admin_accounts(int) from public, anon;
grant execute on function public.admin_accounts(int) to authenticated;

/**
 * Autorise (ou refuse) une désactivation, avant que l'Edge Function ne touche
 * à Supabase Auth. Toutes les règles du garde-fou sont ici, pas en
 * TypeScript : c'est la base qui dit qui peut quoi.
 */
create or replace function public.admin_assert_can_disable(
  p_profile_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if not public.is_admin() then
    raise exception 'Réservé aux administrateurs.';
  end if;

  if char_length(btrim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Un motif d''au moins 10 caractères est obligatoire.';
  end if;

  -- Se désactiver soi-même, c'est se verrouiller dehors sans chemin de retour.
  if p_profile_id = auth.uid() then
    raise exception 'Vous ne pouvez pas désactiver votre propre compte.';
  end if;

  select role into v_role from public.profiles where id = p_profile_id;
  if v_role is null then
    raise exception 'Compte introuvable.';
  end if;

  -- Deux admins qui se neutralisent l'un l'autre : on retire d'abord le rôle
  -- (`set_admin_role`), et c'est un geste distinct, tracé lui aussi.
  if v_role = 'admin' then
    raise exception 'Un administrateur ne peut pas être désactivé. Retirez-lui d''abord son rôle.';
  end if;
end;
$$;

revoke execute on function public.admin_assert_can_disable(uuid, text) from public, anon;
grant execute on function public.admin_assert_can_disable(uuid, text) to authenticated;

/**
 * Consigne la désactivation (ou la réactivation) une fois qu'elle a
 * réellement eu lieu. Revalide tout : appelée depuis l'extérieur de la base,
 * elle ne se fie pas à ce que l'appelant prétend avoir déjà vérifié.
 */
create or replace function public.admin_log_account_ban(
  p_profile_id uuid,
  p_disabled boolean,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_assert_can_disable(p_profile_id, p_reason);

  perform public.log_admin_action(
    case when p_disabled then 'disable_account' else 'enable_account' end,
    'profile',
    p_profile_id,
    btrim(p_reason),
    jsonb_build_object('disabled', p_disabled)
  );
end;
$$;

revoke execute on function public.admin_log_account_ban(uuid, boolean, text) from public, anon;
grant execute on function public.admin_log_account_ban(uuid, boolean, text) to authenticated;

/**
 * Historique des mesures prises sur un compte, du plus récent au plus ancien.
 * Sans lui, un compte réactivé ne garderait aucune trace visible de ce qui
 * lui est arrivé.
 */
create or replace function public.admin_account_history(p_profile_id uuid)
returns table (
  action text,
  reason text,
  created_at timestamptz,
  admin_pseudo text
)
language sql
security definer
stable
set search_path = public
as $$
  select a.action, a.reason, a.created_at, p.pseudo
  from public.admin_actions a
  left join public.profiles p on p.id = a.admin_id
  where public.is_admin()
    and a.target_type = 'profile'
    and a.target_id = p_profile_id
  order by a.created_at desc
  limit 20;
$$;

revoke execute on function public.admin_account_history(uuid) from public, anon;
grant execute on function public.admin_account_history(uuid) to authenticated;
