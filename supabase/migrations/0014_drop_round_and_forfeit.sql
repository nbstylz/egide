-- Migration 0014 : ronde d'abandon et forfait (complément d'US-3.8)
--
-- Deux besoins apparus à la conception de l'écran :
--   • afficher « Abandon · R2 » au classement, donc mémoriser la ronde ;
--   • quand un joueur part en laissant sa table sans score, l'organisateur
--     doit pouvoir enregistrer un forfait, sinon la ronde ne peut jamais
--     être clôturée.

alter table public.registrations
  add column if not exists dropped_round integer;

comment on column public.registrations.dropped_round is
  'Numéro de la ronde à laquelle le joueur a abandonné (null s''il est encore en lice).';

create or replace function public.drop_player(
  p_registration_id uuid,
  p_dropped boolean default true,
  p_forfeit boolean default false
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
  v_status text;
  v_player uuid;
  v_round_number integer;
  v_pairing record;
  v_bye record;
begin
  if v_caller is null then
    raise exception 'Il faut être connecté.';
  end if;

  select t.organizer_id, t.id, t.status, r.status, r.player_id
  into v_organizer, v_tournament, v_tournament_status, v_status, v_player
  from public.registrations r
  join public.tournaments t on t.id = r.tournament_id
  where r.id = p_registration_id;

  if v_organizer is null then
    raise exception 'Inscription introuvable.';
  end if;
  if v_organizer <> v_caller then
    raise exception 'Seul l''organisateur peut faire abandonner un joueur.';
  end if;
  if v_tournament_status <> 'in_progress' then
    raise exception 'L''abandon ne concerne qu''un tournoi en cours.';
  end if;

  select number into v_round_number
  from public.rounds where tournament_id = v_tournament
  order by number desc limit 1;

  if p_dropped then
    if v_status <> 'checked_in' then
      raise exception 'Ce joueur ne participe pas au tournoi.';
    end if;

    update public.registrations
    set status = 'dropped', dropped_round = v_round_number, updated_at = now()
    where id = p_registration_id;

    -- Table de la ronde en cours restée sans score : forfait si demandé.
    if p_forfeit then
      select p.id, p.player_a_id, p.player_b_id
      into v_pairing
      from public.pairings p
      join public.rounds r on r.id = p.round_id
      where r.tournament_id = v_tournament
        and r.number = v_round_number
        and p.score_a is null
        and p.player_b_id is not null
        and (p.player_a_id = v_player or p.player_b_id = v_player);

      if v_pairing.id is not null then
        select * into v_bye from public.bye_scores();
        if v_pairing.player_a_id = v_player then
          update public.pairings
          set score_a = v_bye.loser, score_b = v_bye.winner,
              tactics_a = 0, tactics_b = 3, updated_at = now()
          where id = v_pairing.id;
        else
          update public.pairings
          set score_a = v_bye.winner, score_b = v_bye.loser,
              tactics_a = 3, tactics_b = 0, updated_at = now()
          where id = v_pairing.id;
        end if;
      end if;
    end if;
  else
    if v_status <> 'dropped' then
      raise exception 'Ce joueur n''a pas abandonné.';
    end if;
    update public.registrations
    set status = 'checked_in', dropped_round = null, updated_at = now()
    where id = p_registration_id;
  end if;
end;
$$;

revoke execute on function public.drop_player(uuid, boolean, boolean) from public, anon;
grant execute on function public.drop_player(uuid, boolean, boolean) to authenticated;

-- Le classement expose aussi la ronde d'abandon (voir 0013 pour le reste).
-- La définition complète de tournament_standings est reprise ici avec la
-- colonne `dropped_round` en plus.
