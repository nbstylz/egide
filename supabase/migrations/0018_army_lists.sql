-- Migration 0018 : listes d'armées, soumission simple (US-5.1, US-5.3)
--
-- Phase 1 du cahier des charges : le joueur colle sa liste en texte,
-- l'organisateur la valide ou la refuse à la main. Le contenu reste du texte
-- brut — la vérification poussée (phase 2) se grefferait par-dessus sans
-- changer ce modèle. Une liste par inscription, jamais plus.

create table public.army_lists (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations (id) on delete cascade,
  content text not null check (char_length(content) between 1 and 20000),
  faction text,
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'rejected')),
  -- Commentaire de l'organisateur : obligatoire au refus, libre sinon.
  organizer_comment text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (registration_id)
);

create index army_lists_registration_idx on public.army_lists (registration_id);

alter table public.army_lists enable row level security;

-- Une liste peut révéler une stratégie : seuls le joueur et l'organisateur
-- la lisent. Les autres joueurs n'y ont pas accès avant le tournoi.
create policy "Le joueur et l'organisateur lisent la liste"
  on public.army_lists for select to authenticated
  using (
    exists (
      select 1
      from public.registrations r
      join public.tournaments t on t.id = r.tournament_id
      where r.id = registration_id
        and (r.player_id = auth.uid() or t.organizer_id = auth.uid())
    )
  );

-- Aucune écriture directe : tout passe par les fonctions ci-dessous.

/**
 * Soumet (ou corrige) sa liste. Refusée, elle redevient « soumise » ;
 * validée, elle est figée — l'organisateur a engagé sa parole dessus.
 */
create or replace function public.submit_army_list(
  p_tournament_id uuid,
  p_content text,
  p_faction text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_registration uuid;
  v_reg_status text;
  v_tournament_status text;
  v_current text;
begin
  if v_caller is null then
    raise exception 'Il faut être connecté.';
  end if;
  if char_length(coalesce(trim(p_content), '')) = 0 then
    raise exception 'La liste est vide.';
  end if;

  select r.id, r.status, t.status into v_registration, v_reg_status, v_tournament_status
  from public.registrations r
  join public.tournaments t on t.id = r.tournament_id
  where r.tournament_id = p_tournament_id and r.player_id = v_caller;

  if v_registration is null then
    raise exception 'NOT_REGISTERED';
  end if;
  if v_reg_status not in ('registered', 'checked_in') then
    raise exception 'NOT_REGISTERED';
  end if;
  -- La soumission se ferme au lancement du tournoi : les listes servent
  -- avant le jour J, plus rien ne doit bouger ensuite.
  if v_tournament_status <> 'open' then
    raise exception 'SUBMISSIONS_CLOSED';
  end if;

  select status into v_current from public.army_lists where registration_id = v_registration;
  if v_current = 'approved' then
    raise exception 'LIST_APPROVED';
  end if;

  insert into public.army_lists (registration_id, content, faction)
  values (v_registration, trim(p_content), nullif(trim(coalesce(p_faction, '')), ''))
  on conflict (registration_id) do update
  set content = excluded.content,
      faction = excluded.faction,
      status = 'submitted',
      organizer_comment = null,
      reviewed_at = null,
      submitted_at = now(),
      updated_at = now();
end;
$$;

/** Valide ou refuse une liste (organisateur ; commentaire obligatoire au refus). */
create or replace function public.review_army_list(
  p_list_id uuid,
  p_approved boolean,
  p_comment text default null
)
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
  if not p_approved and char_length(coalesce(trim(p_comment), '')) = 0 then
    raise exception 'COMMENT_REQUIRED';
  end if;

  update public.army_lists
  set status = case when p_approved then 'approved' else 'rejected' end,
      organizer_comment = nullif(trim(coalesce(p_comment, '')), ''),
      reviewed_at = now(),
      updated_at = now()
  where id = p_list_id;
end;
$$;

revoke execute on function public.submit_army_list(uuid, text, text) from public, anon;
revoke execute on function public.review_army_list(uuid, boolean, text) from public, anon;
grant execute on function public.submit_army_list(uuid, text, text) to authenticated;
grant execute on function public.review_army_list(uuid, boolean, text) to authenticated;
