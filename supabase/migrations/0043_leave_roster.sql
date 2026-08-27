-- Migration 0043 : quitter un roster où l'on a été inscrit (US-7.3)
--
-- Un joueur d'un roster est inscrit **sans l'avoir demandé** : son capitaine
-- l'a engagé. Il doit donc pouvoir sortir — et il n'y a que lui pour le faire,
-- le capitaine ne pouvant désinscrire personne d'autre que son équipe entière.
--
-- `withdraw_from_tournament` (0004) le retirait déjà du tournoi, mais laissait
-- `team_registration_id` et `roster_position` en place : l'équipe paraissait
-- complète alors qu'elle ne l'était plus. Un roster faux ne se voit pas, et se
-- découvre le jour J devant la table vide.
--
-- Le détachement est donc explicite. L'équipe reste engagée, incomplète : c'est
-- au capitaine de la recompléter (`update_team_roster`), pas à la base de
-- décider qu'une équipe amputée doit disparaître.
--
-- Ce que la fonction ne fait pas, volontairement : promouvoir une équipe de la
-- liste d'attente. La place appartient toujours à l'équipe, qui n'a perdu qu'un
-- joueur. `promote_waitlist` reste appelée pour les tournois individuels.

create or replace function public.withdraw_from_tournament(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player uuid := auth.uid();
  v_team_registration uuid;
  v_status text;
begin
  if v_player is null then
    raise exception 'Il faut être connecté pour se désinscrire.';
  end if;

  select status into v_status from public.tournaments where id = p_tournament_id;
  -- Après le lancement, on n'efface pas une inscription : les parties existent.
  -- L'abandon (`drop_player`, 0013) est le bon outil, et il appartient à
  -- l'organisateur.
  if v_status is distinct from 'open' then
    raise exception 'REGISTRATIONS_CLOSED';
  end if;

  select team_registration_id into v_team_registration
  from public.registrations
  where tournament_id = p_tournament_id and player_id = v_player;

  update public.registrations
  set status = 'withdrawn',
      team_registration_id = null,
      roster_position = null,
      updated_at = now()
  where tournament_id = p_tournament_id and player_id = v_player;

  -- Une place d'équipe ne se libère pas parce qu'un joueur s'en va : l'équipe
  -- garde la sienne, incomplète, jusqu'à ce que son capitaine la recomplète ou
  -- la retire.
  if v_team_registration is null then
    perform public.promote_waitlist(p_tournament_id);
  end if;
end;
$$;

revoke execute on function public.withdraw_from_tournament(uuid) from public, anon;
grant execute on function public.withdraw_from_tournament(uuid) to authenticated;

/**
 * Combien de joueurs manquent à chaque équipe engagée d'un tournoi.
 *
 * Sert à l'écran du capitaine et, le jour J, au pointage : une équipe
 * incomplète doit se voir **avant** la première ronde, pas devant la table.
 */
create or replace function public.team_roster_gaps(p_tournament_id uuid)
returns table (
  team_registration_id uuid,
  team_name text,
  expected integer,
  present integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select tr.id,
         t.name,
         tou.team_size,
         count(r.*) filter (where r.status <> 'withdrawn')::int
  from public.team_registrations tr
  join public.teams t on t.id = tr.team_id
  join public.tournaments tou on tou.id = tr.tournament_id
  left join public.registrations r on r.team_registration_id = tr.id
  where tr.tournament_id = p_tournament_id
    and tr.status <> 'withdrawn'
  group by tr.id, t.name, tou.team_size
  order by t.name;
$$;

revoke execute on function public.team_roster_gaps(uuid) from public;
grant execute on function public.team_roster_gaps(uuid) to authenticated, anon;
