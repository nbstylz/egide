-- Migration 0017 : scénario de la ronde (US-3.14)
--
-- En tournoi AOS, chaque ronde se joue sur un scénario annoncé. Il est saisi
-- en texte libre : la liste officielle change à chaque General's Handbook,
-- une liste figée dans le code vieillirait mal.
--
-- Le scénario n'est PAS un paramètre de `start_tournament` ni de
-- `generate_next_round`. Ces deux fonctions sont le chemin critique du jour J,
-- et une saisie facultative ne doit jamais pouvoir faire échouer la création
-- d'une ronde. On l'écrit donc à part — la même fonction sert à le corriger
-- plus tard, ce que le critère 3 de l'US demande de toute façon.

alter table public.rounds add column scenario text;

/** Renseigne ou corrige le scénario d'une ronde (organisateur seulement). */
create or replace function public.set_round_scenario(
  p_round_id uuid,
  p_scenario text
)
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
  select t.organizer_id, t.status into v_organizer, v_status
  from public.rounds r
  join public.tournaments t on t.id = r.tournament_id
  where r.id = p_round_id;

  if v_organizer is null then
    raise exception 'Ronde introuvable.';
  end if;
  if v_organizer <> v_caller then
    raise exception 'Seul l''organisateur peut renseigner le scénario.';
  end if;
  -- Un tournoi terminé ne se réécrit plus, même sur un champ d'affichage.
  if v_status = 'completed' then
    raise exception 'Le tournoi est terminé.';
  end if;

  update public.rounds
  set scenario = nullif(trim(coalesce(p_scenario, '')), '')
  where id = p_round_id;
end;
$$;

revoke execute on function public.set_round_scenario(uuid, text) from public, anon;
grant execute on function public.set_round_scenario(uuid, text) to authenticated;
