-- Migration 0040 : l'organisateur renseigne ou corrige une faction (US-9.4)
--
-- Cas réel qui a motivé l'US : un joueur inscrit la veille, qui ne déclare rien
-- et arrive le matin. Avec la seule porte du joueur (0038), son trou ne se
-- comble plus jamais — « combler oui, réécrire non » lui interdit d'y revenir
-- une fois le tournoi lancé, et personne d'autre ne peut le faire à sa place.
--
-- L'organisateur reçoit donc sa propre fenêtre d'écriture, plus large que celle
-- du joueur et pour une raison précise : il arbitre. Il voit l'armée sur la
-- table. Sa correction n'est pas une réécriture de l'histoire, c'est la mise en
-- accord de l'histoire avec ce qui s'est passé.
--
-- Sa fenêtre reste bornée : tant que le tournoi n'est pas terminé il écrit ce
-- qu'il veut ; une fois terminé il ne peut plus que **combler** un vide, comme
-- le joueur. Un classement publié ne se réécrit pas.

-- ---------------------------------------------------------------------------
-- 1. Le garde-fou apprend à reconnaître l'organisateur
-- ---------------------------------------------------------------------------
-- Il continue de refuser au joueur toute réécriture après le lancement ; il
-- laisse passer celle de l'organisateur, tant que le tournoi n'est pas terminé.

create or replace function public.guard_registration_faction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament_status text;
  v_organizer uuid;
begin
  if new.faction is not distinct from old.faction then
    return new;
  end if;

  select t.status, t.organizer_id into v_tournament_status, v_organizer
  from public.tournaments t where t.id = new.tournament_id;

  -- Renseigner une faction absente reste possible après le lancement, pour
  -- tout le monde : c'est justement une fois le tournoi joué que le manque se
  -- découvre. Combler un vide n'a jamais falsifié personne.
  if old.faction is null then
    return new;
  end if;

  -- Réécrire, en revanche, efface ce qu'ont vu les adversaires. Seul
  -- l'organisateur peut le faire, et seulement avant la clôture : il arbitre,
  -- il a l'armée sous les yeux.
  if v_tournament_status = 'open' then
    return new;
  end if;
  if v_tournament_status = 'in_progress' and (select auth.uid()) = v_organizer then
    return new;
  end if;

  raise exception 'FACTION_LOCKED';
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. La porte de l'organisateur
-- ---------------------------------------------------------------------------
-- Elle prend l'inscription et non le tournoi : côté back office, c'est une
-- ligne de tableau qu'on corrige, et la ligne porte son identifiant.

create or replace function public.set_faction_as_organizer(
  p_registration_id uuid,
  p_faction text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_organizer uuid;
  v_tournament_status text;
  v_current text;
  v_faction text := nullif(btrim(coalesce(p_faction, '')), '');
begin
  if v_caller is null then
    raise exception 'Il faut être connecté.';
  end if;

  select t.organizer_id, t.status, r.faction
    into v_organizer, v_tournament_status, v_current
  from public.registrations r
  join public.tournaments t on t.id = r.tournament_id
  where r.id = p_registration_id;

  if v_organizer is null then
    raise exception 'NOT_FOUND';
  end if;
  if v_organizer <> v_caller then
    raise exception 'NOT_ORGANIZER';
  end if;

  if v_faction is not null
     and not exists (select 1 from public.factions f where f.name = v_faction) then
    raise exception 'UNKNOWN_FACTION';
  end if;

  -- Après la clôture, l'organisateur ne peut plus que combler : le classement
  -- est publié, les joueurs l'ont lu.
  if v_tournament_status not in ('open', 'in_progress') and v_current is not null then
    raise exception 'TOURNAMENT_CLOSED';
  end if;
  if v_tournament_status = 'cancelled' then
    raise exception 'TOURNAMENT_CLOSED';
  end if;

  update public.registrations
     set faction = v_faction,
         updated_at = now()
   where id = p_registration_id;
end;
$$;

revoke execute on function public.set_faction_as_organizer(uuid, text) from public, anon;
grant execute on function public.set_faction_as_organizer(uuid, text) to authenticated;
