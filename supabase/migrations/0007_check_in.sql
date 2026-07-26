-- Migration 0007 : pointage des présents le jour du tournoi (US-3.1)
--
-- Le jour J, l'organisateur pointe les joueurs qui se présentent. Un joueur
-- pointé passe de « inscrit » à « présent » ; seuls les présents seront
-- appariés à la première ronde.

/** Vérifie que l'appelant peut pointer ce tournoi, et le renvoie. */
create or replace function public.assert_can_check_in(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_organizer uuid;
  v_status text;
begin
  if v_caller is null then
    raise exception 'Il faut être connecté.';
  end if;

  select organizer_id, status into v_organizer, v_status
  from public.tournaments where id = p_tournament_id;

  if v_organizer is null then
    raise exception 'Tournoi introuvable.';
  end if;
  if v_organizer <> v_caller then
    raise exception 'Seul l''organisateur peut pointer les présents.';
  end if;
  -- Une fois le tournoi lancé, les appariements sont faits : le pointage est figé.
  if v_status <> 'open' then
    raise exception 'Le pointage n''est plus modifiable pour ce tournoi.';
  end if;
end;
$$;

create or replace function public.set_check_in(p_registration_id uuid, p_present boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament uuid;
  v_status text;
begin
  select tournament_id, status into v_tournament, v_status
  from public.registrations where id = p_registration_id;

  if v_tournament is null then
    raise exception 'Inscription introuvable.';
  end if;

  perform public.assert_can_check_in(v_tournament);

  -- On ne pointe que des joueurs qui occupent une place : ni la liste
  -- d'attente, ni les désistements.
  if v_status not in ('registered', 'checked_in') then
    raise exception 'Ce joueur n''occupe pas de place dans le tournoi.';
  end if;

  update public.registrations
  set status = case when p_present then 'checked_in' else 'registered' end,
      updated_at = now()
  where id = p_registration_id;
end;
$$;

/**
 * Pointage groupé : « tout marquer présent » et « réinitialiser le pointage ».
 * Une seule requête plutôt qu'une par joueur.
 */
create or replace function public.set_check_in_all(p_tournament_id uuid, p_present boolean)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  perform public.assert_can_check_in(p_tournament_id);

  update public.registrations
  set status = case when p_present then 'checked_in' else 'registered' end,
      updated_at = now()
  where tournament_id = p_tournament_id
    and status in ('registered', 'checked_in')
    and status <> case when p_present then 'checked_in' else 'registered' end;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.assert_can_check_in(uuid) from public, anon, authenticated;
revoke execute on function public.set_check_in(uuid, boolean) from public, anon;
revoke execute on function public.set_check_in_all(uuid, boolean) from public, anon;
grant execute on function public.set_check_in(uuid, boolean) to authenticated;
grant execute on function public.set_check_in_all(uuid, boolean) to authenticated;
