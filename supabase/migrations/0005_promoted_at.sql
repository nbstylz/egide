-- Migration 0005 : mémoriser les promotions depuis la liste d'attente (US-2.4)
--
-- Sans notifications push (prévues plus tard), un joueur promu ne peut
-- l'apprendre qu'en rouvrant la fiche. On date donc la promotion pour
-- pouvoir lui afficher un bandeau « une place s'est libérée ».

alter table public.registrations add column if not exists promoted_at timestamptz;

-- `promote_waitlist` date désormais la promotion.
create or replace function public.promote_waitlist(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capacity int;
  v_taken int;
  v_next uuid;
begin
  select capacity into v_capacity
  from public.tournaments
  where id = p_tournament_id
  for update;

  if v_capacity is null then
    return;
  end if;

  loop
    select count(*) into v_taken
    from public.registrations
    where tournament_id = p_tournament_id
      and status in ('registered', 'checked_in');

    exit when v_taken >= v_capacity;

    select id into v_next
    from public.registrations
    where tournament_id = p_tournament_id and status = 'waitlisted'
    order by created_at
    limit 1;

    exit when v_next is null;

    update public.registrations
    set status = 'registered', promoted_at = now(), updated_at = now()
    where id = v_next;
  end loop;
end;
$$;

-- Une inscription volontaire n'est pas une promotion : on remet le drapeau à zéro.
create or replace function public.register_for_tournament(p_tournament_id uuid)
returns public.registrations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player uuid := auth.uid();
  v_capacity int;
  v_taken int;
  v_status text;
  v_result public.registrations;
begin
  if v_player is null then
    raise exception 'Il faut être connecté pour s''inscrire.';
  end if;

  if not exists (select 1 from public.profiles where id = v_player) then
    raise exception 'Il faut avoir créé son profil pour s''inscrire.';
  end if;

  select capacity into v_capacity
  from public.tournaments
  where id = p_tournament_id and status = 'open'
  for update;

  if v_capacity is null then
    raise exception 'Ce tournoi n''accepte pas (ou plus) d''inscriptions.';
  end if;

  select count(*) into v_taken
  from public.registrations
  where tournament_id = p_tournament_id
    and status in ('registered', 'checked_in')
    and player_id <> v_player;

  if v_taken >= v_capacity then
    v_status := 'waitlisted';
  else
    v_status := 'registered';
  end if;

  insert into public.registrations (tournament_id, player_id, status)
  values (p_tournament_id, v_player, v_status)
  on conflict (tournament_id, player_id) do update
    set status = v_status, promoted_at = null, updated_at = now()
  returning * into v_result;

  return v_result;
end;
$$;
