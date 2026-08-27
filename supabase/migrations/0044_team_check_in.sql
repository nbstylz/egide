-- Migration 0044 : pointer une équipe le jour J (US-7.4)
--
-- Le pointage individuel de la 0007 reste la brique de base : on ne le réécrit
-- pas, on l'appelle en lot. Une équipe est pointée quand tous ses joueurs le
-- sont, et l'organisateur fait le geste une fois pour l'équipe entière — c'est
-- ainsi qu'une équipe se présente à l'accueil, ensemble.
--
-- UNE RÈGLE QUI SURPRENDRA : une équipe ne peut être pointée que si **tous ses
-- joueurs ont déclaré leur faction**. Ce n'est pas de la rigueur administrative.
-- Dans un tournoi par équipes, le capitaine adverse apparie **en regardant les
-- factions** : sans elles, l'appariement se fait à l'aveugle et le format perd
-- son sens. Le refus nomme les joueurs concernés, et l'organisateur peut
-- combler lui-même en trente secondes depuis la page Inscrits
-- (`set_faction_as_organizer`, 0040).
--
-- HYPOTHÈSE À CONFIRMER PAR LE PORTEUR : c'est la recommandation de l'agent
-- `product-owner`, pas une règle qu'il a validée. Si elle gêne le jour J, la
-- lever tient en une migration — le blocage vit ici, pas dans l'écran.

create or replace function public.set_team_check_in(
  p_team_registration_id uuid,
  p_present boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament uuid;
  v_status text;
  v_missing text;
begin
  select tournament_id, status into v_tournament, v_status
  from public.team_registrations where id = p_team_registration_id;

  if v_tournament is null then
    raise exception 'NOT_FOUND';
  end if;

  perform public.assert_can_check_in(v_tournament);

  -- On ne pointe que des équipes qui occupent une place : ni la liste
  -- d'attente, ni les retraits.
  if v_status not in ('registered', 'checked_in') then
    raise exception 'NOT_REGISTERED';
  end if;

  if p_present then
    select string_agg(p.pseudo, ', ' order by p.pseudo) into v_missing
    from public.registrations r
    join public.profiles p on p.id = r.player_id
    where r.team_registration_id = p_team_registration_id
      and r.status in ('registered', 'checked_in')
      and r.faction is null;

    if v_missing is not null then
      raise exception 'FACTION_MISSING:%', v_missing;
    end if;
  end if;

  update public.team_registrations
     set status = case when p_present then 'checked_in' else 'registered' end,
         updated_at = now()
   where id = p_team_registration_id;

  -- Les joueurs suivent l'équipe. Un joueur retiré du roster n'est plus
  -- rattaché : il n'est pas concerné.
  update public.registrations
     set status = case when p_present then 'checked_in' else 'registered' end,
         updated_at = now()
   where team_registration_id = p_team_registration_id
     and status in ('registered', 'checked_in');
end;
$$;

revoke execute on function public.set_team_check_in(uuid, boolean) from public, anon;
grant execute on function public.set_team_check_in(uuid, boolean) to authenticated;

/**
 * L'état de pointage d'un tournoi par équipes, en une requête.
 *
 * Sert au compteur « X équipes sur Y présentes — Z joueurs sur W » et à
 * signaler, avant le lancement, les rosters incomplets et les factions
 * manquantes. Les découvrir au moment de générer la ronde 1 serait dix minutes
 * perdues devant une salle qui attend.
 */
create or replace function public.team_check_in_state(p_tournament_id uuid)
returns table (
  team_registration_id uuid,
  team_name text,
  status text,
  expected integer,
  roster_size integer,
  present integer,
  missing_factions text
)
language sql
stable
security invoker
set search_path = public
as $$
  select tr.id,
         t.name,
         tr.status,
         tou.team_size,
         count(r.*) filter (where r.status in ('registered', 'checked_in'))::int,
         count(r.*) filter (where r.status = 'checked_in')::int,
         string_agg(p.pseudo, ', ' order by p.pseudo)
           filter (where r.status in ('registered', 'checked_in') and r.faction is null)
  from public.team_registrations tr
  join public.teams t on t.id = tr.team_id
  join public.tournaments tou on tou.id = tr.tournament_id
  left join public.registrations r on r.team_registration_id = tr.id
  left join public.profiles p on p.id = r.player_id
  where tr.tournament_id = p_tournament_id
    and tr.status <> 'withdrawn'
  group by tr.id, t.name, tr.status, tou.team_size
  order by t.name;
$$;

revoke execute on function public.team_check_in_state(uuid) from public;
grant execute on function public.team_check_in_state(uuid) to authenticated, anon;
