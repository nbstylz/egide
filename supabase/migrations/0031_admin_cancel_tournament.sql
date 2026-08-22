-- Migration 0031 : annulation d'un tournoi par l'administration (US-12.3)
--
-- Un faux événement, ou un organisateur injoignable dont le tournoi approche :
-- il faut pouvoir protéger les inscrits. Comme pour l'annulation par
-- l'organisateur (US-1.4), on n'efface jamais — le tournoi passe au statut
-- `cancelled` et garde son histoire.
--
-- Deux différences avec l'annulation par l'organisateur :
--   • un motif est obligatoire, et il est consigné dans `admin_actions` ;
--   • les inscrits ET l'organisateur sont prévenus, lui d'abord parce que
--     c'est son événement qu'on retire.

-- 1. Nouveau type d'événement dans la file de notifications.
alter table public.push_outbox
  drop constraint push_outbox_kind_check;

alter table public.push_outbox
  add constraint push_outbox_kind_check
  check (kind in (
    'round_published',
    'promoted',
    'list_reviewed',
    'new_registration',
    'tournament_published',
    'tournament_reminder',
    'tournament_cancelled'
  ));

/**
 * Annule un tournoi au nom de l'administration.
 *
 * Refuse un tournoi terminé : son classement fait foi, l'annuler après coup
 * réécrirait l'histoire de joueurs qui ont réellement joué. Refuse aussi un
 * tournoi déjà annulé, pour ne pas notifier deux fois les mêmes inscrits.
 */
create or replace function public.admin_cancel_tournament(
  p_tournament_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.is_admin() then
    raise exception 'Réservé aux administrateurs.';
  end if;

  -- Le motif est lu par l'organisateur et consigné : « x » ne dit rien.
  if char_length(v_reason) < 10 then
    raise exception 'Un motif d''au moins 10 caractères est obligatoire.';
  end if;

  select status into v_status from public.tournaments
  where id = p_tournament_id for update;

  if v_status is null then
    raise exception 'Tournoi introuvable.';
  end if;
  if v_status = 'completed' then
    raise exception 'Un tournoi terminé ne peut plus être annulé.';
  end if;
  if v_status = 'cancelled' then
    raise exception 'Ce tournoi est déjà annulé.';
  end if;

  update public.tournaments
  set status = 'cancelled', updated_at = now()
  where id = p_tournament_id;

  -- Le motif voyage dans la file : `tournaments` ne le stocke pas, et
  -- `send-push` doit pouvoir l'annoncer sans relire le journal d'audit.
  insert into public.push_outbox (kind, payload)
  values (
    'tournament_cancelled',
    jsonb_build_object('tournament_id', p_tournament_id, 'reason', v_reason)
  );

  perform public.log_admin_action(
    'cancel_tournament',
    'tournament',
    p_tournament_id,
    v_reason,
    jsonb_build_object('from', v_status)
  );
end;
$$;

revoke execute on function public.admin_cancel_tournament(uuid, text) from public, anon;
grant execute on function public.admin_cancel_tournament(uuid, text) to authenticated;

/**
 * Le motif de la dernière annulation administrative d'un tournoi, avec sa
 * date. Sert à expliquer « pourquoi ce tournoi est annulé » sur la fiche,
 * plutôt que de laisser un statut nu. Réservé aux admins, comme le journal.
 */
create or replace function public.admin_cancellation(p_tournament_id uuid)
returns table (reason text, created_at timestamptz, admin_pseudo text)
language sql
security definer
stable
set search_path = public
as $$
  select a.reason, a.created_at, p.pseudo
  from public.admin_actions a
  left join public.profiles p on p.id = a.admin_id
  where public.is_admin()
    and a.action = 'cancel_tournament'
    and a.target_id = p_tournament_id
  order by a.created_at desc
  limit 1;
$$;

revoke execute on function public.admin_cancellation(uuid) from public, anon;
grant execute on function public.admin_cancellation(uuid) to authenticated;
