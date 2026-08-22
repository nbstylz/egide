-- Migration 0026 : dupliquer un tournoi (quick win organisateur)
--
-- Recrée un tournoi à partir d'un existant : copie les PARAMÈTRES (lieu,
-- format, capacité…), jamais les inscrits ni les résultats. La copie naît en
-- « brouillon », prête à être ajustée puis ouverte. Cas d'usage : une série
-- mensuelle qu'on relance en un clic au lieu de tout ressaisir.
--
-- `security definer` : la fonction vérifie elle-même que l'appelant est bien
-- l'organisateur du tournoi source, puis insère la copie à son nom.

create or replace function public.duplicate_tournament(
  p_tournament_id uuid,
  p_name text,
  p_event_date date
)
returns public.tournaments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_src public.tournaments;
  v_new public.tournaments;
begin
  if v_caller is null then
    raise exception 'Il faut être connecté.';
  end if;

  select * into v_src from public.tournaments where id = p_tournament_id;
  if v_src.id is null then
    raise exception 'Tournoi introuvable.';
  end if;
  if v_src.organizer_id <> v_caller then
    raise exception 'Seul l''organisateur peut dupliquer son tournoi.';
  end if;
  if char_length(coalesce(btrim(p_name), '')) < 3 or char_length(p_name) > 80 then
    raise exception 'Le nom doit faire entre 3 et 80 caractères.';
  end if;
  if p_event_date is null then
    raise exception 'Une date est requise.';
  end if;

  -- On copie les seuls paramètres : ni inscriptions, ni rondes, ni scores.
  -- La copie démarre en brouillon, à ouvrir une fois la date confirmée.
  insert into public.tournaments (
    organizer_id, name, city, region, event_date,
    points_limit, rounds_count, capacity, type, status
  )
  values (
    v_caller, btrim(p_name), v_src.city, v_src.region, p_event_date,
    v_src.points_limit, v_src.rounds_count, v_src.capacity, v_src.type, 'draft'
  )
  returning * into v_new;

  return v_new;
end;
$$;

revoke execute on function public.duplicate_tournament(uuid, text, date) from public, anon;
grant execute on function public.duplicate_tournament(uuid, text, date) to authenticated;

do $$
begin
  assert exists (select 1 from pg_proc where proname = 'duplicate_tournament'),
    'duplicate_tournament doit exister';
  assert not has_function_privilege('anon', 'public.duplicate_tournament(uuid, text, date)', 'execute'),
    'duplicate_tournament ne doit pas être exécutable par anon';
  raise notice 'Migration 0026 : duplicate_tournament OK.';
end;
$$;
