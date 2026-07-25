-- Migration 0006 : retrait d'un inscrit par l'organisateur (US-2.6)
--
-- L'organisateur gère les désistements signalés hors de l'app. Comme pour
-- une désinscription volontaire, la place libérée profite immédiatement au
-- premier de la liste d'attente.

create or replace function public.remove_registration(p_registration_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_tournament uuid;
  v_organizer uuid;
begin
  if v_caller is null then
    raise exception 'Il faut être connecté.';
  end if;

  select r.tournament_id, t.organizer_id
  into v_tournament, v_organizer
  from public.registrations r
  join public.tournaments t on t.id = r.tournament_id
  where r.id = p_registration_id;

  if v_tournament is null then
    raise exception 'Inscription introuvable.';
  end if;

  -- Seul l'organisateur du tournoi concerné peut retirer un joueur.
  if v_organizer <> v_caller then
    raise exception 'Seul l''organisateur peut retirer un inscrit.';
  end if;

  update public.registrations
  set status = 'withdrawn', promoted_at = null, updated_at = now()
  where id = p_registration_id;

  perform public.promote_waitlist(v_tournament);
end;
$$;

revoke execute on function public.remove_registration(uuid) from public, anon;
grant execute on function public.remove_registration(uuid) to authenticated;
