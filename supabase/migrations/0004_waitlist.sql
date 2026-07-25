-- Migration 0004 : liste d'attente et inscription atomique (US-2.4)
--
-- Jusqu'ici l'app insérait directement dans `registrations`, ce qui laissait
-- deux joueurs prendre la même dernière place s'ils cliquaient en même temps.
-- On passe par des fonctions qui verrouillent le tournoi le temps de compter
-- les places : les inscriptions simultanées sont traitées l'une après l'autre.

-- Promeut les premiers de la liste d'attente tant qu'il reste des places.
-- Appelée après chaque désistement.
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
  -- Verrou : empêche deux promotions concurrentes de dépasser la capacité.
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

    -- Le plus ancien inscrit en attente passe en premier.
    select id into v_next
    from public.registrations
    where tournament_id = p_tournament_id and status = 'waitlisted'
    order by created_at
    limit 1;

    exit when v_next is null;

    update public.registrations
    set status = 'registered', updated_at = now()
    where id = v_next;
  end loop;
end;
$$;

-- Inscrit le joueur connecté : « inscrit » s'il reste de la place,
-- « liste d'attente » sinon. Renvoie l'inscription obtenue.
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

  -- Un profil (pseudo) est obligatoire pour s'inscrire.
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

  -- On exclut le joueur lui-même : une ré-inscription ne doit pas
  -- le compter deux fois et le renvoyer en liste d'attente.
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
    set status = v_status, updated_at = now()
  returning * into v_result;

  return v_result;
end;
$$;

-- Désinscrit le joueur connecté, puis promeut le premier en liste d'attente.
create or replace function public.withdraw_from_tournament(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player uuid := auth.uid();
begin
  if v_player is null then
    raise exception 'Il faut être connecté pour se désinscrire.';
  end if;

  update public.registrations
  set status = 'withdrawn', updated_at = now()
  where tournament_id = p_tournament_id and player_id = v_player;

  perform public.promote_waitlist(p_tournament_id);
end;
$$;

-- Ces fonctions sont « security definer » : elles s'exécutent avec les droits
-- du propriétaire pour pouvoir verrouiller le tournoi et promouvoir un autre
-- joueur. Elles vérifient elles-mêmes l'identité via auth.uid(), et ne sont
-- ouvertes qu'aux comptes connectés.
revoke execute on function public.promote_waitlist(uuid) from public, anon, authenticated;
revoke execute on function public.register_for_tournament(uuid) from public, anon;
revoke execute on function public.withdraw_from_tournament(uuid) from public, anon;
grant execute on function public.register_for_tournament(uuid) to authenticated;
grant execute on function public.withdraw_from_tournament(uuid) to authenticated;
