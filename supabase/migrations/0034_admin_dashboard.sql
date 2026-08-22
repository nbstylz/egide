-- Migration 0034 : chiffres clés de la plateforme (US-12.6)
--
-- Savoir si EGIDE prend dans la communauté. Une seule ligne, calculée en
-- base : les compteurs par statut se lisent d'un `filter`, alors que côté
-- client il faudrait rapatrier tous les tournois pour les compter.
--
-- Pas de graphique en v1 : des nombres et des libellés suffisent à répondre
-- à « est-ce que ça décolle ? ».

create or replace function public.admin_dashboard()
returns table (
  accounts_total bigint,
  accounts_30d bigint,
  tournaments_total bigint,
  tournaments_draft bigint,
  tournaments_open bigint,
  tournaments_in_progress bigint,
  tournaments_completed bigint,
  tournaments_cancelled bigint,
  tournaments_published_30d bigint,
  registrations_total bigint,
  registrations_active bigint,
  teams_total bigint,
  admin_actions_total bigint
)
language sql
security definer
stable
set search_path = public
as $$
  select
    (select count(*) from public.profiles),
    (select count(*) from public.profiles where created_at >= now() - interval '30 days'),
    (select count(*) from public.tournaments),
    (select count(*) from public.tournaments where status = 'draft'),
    (select count(*) from public.tournaments where status = 'open'),
    (select count(*) from public.tournaments where status = 'in_progress'),
    (select count(*) from public.tournaments where status = 'completed'),
    (select count(*) from public.tournaments where status = 'cancelled'),
    -- « Publié » et non « créé » : un brouillon n'existe pour personne.
    (select count(*) from public.tournaments
     where status <> 'draft' and created_at >= now() - interval '30 days'),
    (select count(*) from public.registrations),
    -- Les inscriptions qui occupent réellement une place (même définition
    -- que `ActiveRegistrationStatuses` côté client).
    (select count(*) from public.registrations where status in ('registered', 'checked_in')),
    (select count(*) from public.teams),
    (select count(*) from public.admin_actions)
  where public.is_admin();
$$;

revoke execute on function public.admin_dashboard() from public, anon;
grant execute on function public.admin_dashboard() to authenticated;

/** Les dernières actions d'administration, tous types de cible confondus. */
create or replace function public.admin_recent_actions(p_limit int default 5)
returns table (
  action text,
  target_type text,
  target_id uuid,
  reason text,
  created_at timestamptz,
  admin_pseudo text
)
language sql
security definer
stable
set search_path = public
as $$
  select a.action, a.target_type, a.target_id, a.reason, a.created_at, p.pseudo
  from public.admin_actions a
  left join public.profiles p on p.id = a.admin_id
  where public.is_admin()
  order by a.created_at desc
  limit greatest(p_limit, 1);
$$;

revoke execute on function public.admin_recent_actions(int) from public, anon;
grant execute on function public.admin_recent_actions(int) to authenticated;
