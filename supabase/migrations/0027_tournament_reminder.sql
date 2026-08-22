-- Migration 0027 : rappel push « ton tournoi c'est demain » (J-1)
--
-- Quick win qui réutilise la chaîne de notifications existante : une fonction
-- planifiée (pg_cron) dépose un événement `tournament_reminder` dans
-- `push_outbox` la veille de chaque tournoi ; l'Edge Function `send-push` le
-- compose ensuite en un message par joueur inscrit.
--
-- Contrairement aux autres événements (déclenchés par une action), celui-ci
-- est temporel : d'où le planificateur quotidien plutôt qu'un trigger.

-- 1. Nouveau type d'événement dans la file.
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
    'tournament_reminder'
  ));

-- 2. Marqueur d'idempotence : un tournoi n'est rappelé qu'une fois, même si le
--    planificateur tourne plusieurs fois (l'outbox, lui, est vidé puis purgé).
alter table public.tournaments
  add column reminder_enqueued_at timestamptz;

-- 3. Dépose un rappel pour chaque tournoi qui a lieu DEMAIN et n'a pas encore
--    été rappelé. Un seul événement par tournoi : `send-push` fera l'éventail
--    vers les inscrits (comme pour `round_published`).
create or replace function public.enqueue_tournament_reminders()
returns integer
language sql
security definer
set search_path = public
as $$
  with due as (
    select id from public.tournaments
    where status in ('open', 'in_progress')
      and event_date = current_date + 1
      and reminder_enqueued_at is null
  ),
  marked as (
    update public.tournaments t
    set reminder_enqueued_at = now()
    from due
    where t.id = due.id
    returning t.id
  ),
  queued as (
    insert into public.push_outbox (kind, payload)
    select 'tournament_reminder', jsonb_build_object('tournament_id', id)
    from marked
    returning 1
  )
  select count(*)::int from queued;
$$;

-- Appelée par le planificateur, jamais par l'app.
revoke execute on function public.enqueue_tournament_reminders() from public, anon, authenticated;

-- 4. Planification quotidienne (09:00). pg_cron s'active dans le dashboard ;
--    on ne fait pas échouer la migration s'il n'est pas encore là.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $cron$
      select cron.schedule(
        'rappel-tournoi-j-1',
        '0 9 * * *',
        $job$select public.enqueue_tournament_reminders()$job$
      )
    $cron$;
  else
    raise notice 'pg_cron absent : activez-le puis planifiez « rappel-tournoi-j-1 ».';
  end if;
end;
$$;

-- 5. Assertions.
do $$
begin
  assert (
    select pg_get_constraintdef(oid) from pg_constraint
    where conname = 'push_outbox_kind_check'
  ) like '%tournament_reminder%', 'le kind tournament_reminder doit être autorisé';

  assert exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tournaments'
      and column_name = 'reminder_enqueued_at'
  ), 'tournaments.reminder_enqueued_at doit exister';

  assert exists (select 1 from pg_proc where proname = 'enqueue_tournament_reminders'),
    'la fonction enqueue_tournament_reminders doit exister';

  raise notice 'Migration 0027 : assertions OK.';
end;
$$;
