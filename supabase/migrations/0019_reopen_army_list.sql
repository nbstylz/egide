-- Migration 0019 : annuler une décision sur une liste (US-5.3)
--
-- L'organisateur peut valider par erreur ; l'action « Annuler » du toast et
-- le lien « Repasser en relecture » ont besoin de remettre la liste au
-- statut « soumise ». `review_army_list` ne le permet pas (refuser exige un
-- commentaire destiné au joueur, ce qui serait un détournement).

create or replace function public.reopen_army_list(p_list_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_organizer uuid;
begin
  select t.organizer_id into v_organizer
  from public.army_lists a
  join public.registrations r on r.id = a.registration_id
  join public.tournaments t on t.id = r.tournament_id
  where a.id = p_list_id;

  if v_organizer is null then
    raise exception 'Liste introuvable.';
  end if;
  if v_organizer <> v_caller then
    raise exception 'Seul l''organisateur peut relire les listes.';
  end if;

  update public.army_lists
  set status = 'submitted',
      organizer_comment = null,
      reviewed_at = null,
      updated_at = now()
  where id = p_list_id;
end;
$$;

revoke execute on function public.reopen_army_list(uuid) from public, anon;
grant execute on function public.reopen_army_list(uuid) to authenticated;
