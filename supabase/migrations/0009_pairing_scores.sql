-- Migration 0009 : saisie des scores d'une ronde (US-3.4)
--
-- L'organisateur saisit les points de partie de chaque joueur. Le résultat
-- reste modifiable tant que la ronde suivante n'a pas été générée : après,
-- les appariements suivants en dépendent.

create or replace function public.set_pairing_score(
  p_pairing_id uuid,
  p_score_a integer,
  p_score_b integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_organizer uuid;
  v_tournament uuid;
  v_tournament_status text;
  v_round_number integer;
  v_last_round integer;
  v_is_bye boolean;
begin
  if v_caller is null then
    raise exception 'Il faut être connecté.';
  end if;

  select t.organizer_id, t.id, t.status, r.number, (p.player_b_id is null)
  into v_organizer, v_tournament, v_tournament_status, v_round_number, v_is_bye
  from public.pairings p
  join public.rounds r on r.id = p.round_id
  join public.tournaments t on t.id = r.tournament_id
  where p.id = p_pairing_id;

  if v_organizer is null then
    raise exception 'Appariement introuvable.';
  end if;
  if v_organizer <> v_caller then
    raise exception 'Seul l''organisateur peut saisir les scores.';
  end if;
  if v_tournament_status <> 'in_progress' then
    raise exception 'Les scores ne sont modifiables que pendant le tournoi.';
  end if;

  -- Le score du joueur exempt est acquis d'office : on n'y touche pas.
  if v_is_bye then
    raise exception 'Le score d''un joueur exempt est attribué automatiquement.';
  end if;

  -- Une ronde déjà suivie d'une autre est figée : les appariements suivants
  -- ont été calculés à partir de ses résultats.
  select max(number) into v_last_round
  from public.rounds where tournament_id = v_tournament;

  if v_round_number < v_last_round then
    raise exception 'Cette ronde est close : la ronde suivante a déjà été générée.';
  end if;

  -- Les deux scores vont ensemble : soit le résultat est saisi, soit il est effacé.
  if (p_score_a is null) <> (p_score_b is null) then
    raise exception 'Il faut saisir les deux scores, ou aucun.';
  end if;
  if p_score_a is not null and (p_score_a < 0 or p_score_b < 0) then
    raise exception 'Un score ne peut pas être négatif.';
  end if;

  update public.pairings
  set score_a = p_score_a, score_b = p_score_b, updated_at = now()
  where id = p_pairing_id;
end;
$$;

revoke execute on function public.set_pairing_score(uuid, integer, integer) from public, anon;
grant execute on function public.set_pairing_score(uuid, integer, integer) to authenticated;
