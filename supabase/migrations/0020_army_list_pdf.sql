-- Migration 0020 : PDF joint à la liste d'armée (US-5.2)
--
-- Le PDF complète le texte (export d'une app de création de listes), il ne
-- le remplace pas : il se greffe sur la ligne `army_lists` existante. Bucket
-- privé, 5 Mo maximum, PDF uniquement. Le chemin est conventionnel —
-- `<registration_id>.pdf` — ce qui rend les politiques Storage vérifiables.

alter table public.army_lists add column pdf_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('army-lists', 'army-lists', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

/**
 * Vrai si l'appelant peut déposer un PDF pour ce chemin : c'est son
 * inscription, le tournoi est encore ouvert, et sa liste n'est pas validée.
 */
create or replace function public.can_upload_army_pdf(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.registrations r
    join public.tournaments t on t.id = r.tournament_id
    left join public.army_lists a on a.registration_id = r.id
    where p_name = r.id::text || '.pdf'
      and r.player_id = auth.uid()
      and r.status in ('registered', 'checked_in')
      and t.status = 'open'
      and coalesce(a.status, 'submitted') <> 'approved'
  );
$$;

/** Vrai si l'appelant peut lire ce PDF : le joueur ou l'organisateur. */
create or replace function public.can_read_army_pdf(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.registrations r
    join public.tournaments t on t.id = r.tournament_id
    where p_name = r.id::text || '.pdf'
      and (r.player_id = auth.uid() or t.organizer_id = auth.uid())
  );
$$;

create policy "Dépôt du PDF de sa liste"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'army-lists' and public.can_upload_army_pdf(name));

create policy "Remplacement du PDF de sa liste"
  on storage.objects for update to authenticated
  using (bucket_id = 'army-lists' and public.can_upload_army_pdf(name));

create policy "Retrait du PDF de sa liste"
  on storage.objects for delete to authenticated
  using (bucket_id = 'army-lists' and public.can_upload_army_pdf(name));

create policy "Lecture du PDF par le joueur ou l'organisateur"
  on storage.objects for select to authenticated
  using (bucket_id = 'army-lists' and public.can_read_army_pdf(name));

/** Enregistre (ou retire) le PDF sur la ligne de liste, après l'upload. */
create or replace function public.set_army_pdf(
  p_tournament_id uuid,
  p_attached boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_registration uuid;
  v_status text;
begin
  select a.registration_id, a.status into v_registration, v_status
  from public.army_lists a
  join public.registrations r on r.id = a.registration_id
  where r.tournament_id = p_tournament_id and r.player_id = v_caller;

  if v_registration is null then
    raise exception 'Soumets d''abord ta liste en texte.';
  end if;
  if v_status = 'approved' then
    raise exception 'LIST_APPROVED';
  end if;

  update public.army_lists
  set pdf_path = case when p_attached then v_registration::text || '.pdf' end,
      updated_at = now()
  where registration_id = v_registration;
end;
$$;

revoke execute on function public.set_army_pdf(uuid, boolean) from public, anon;
grant execute on function public.set_army_pdf(uuid, boolean) to authenticated;
