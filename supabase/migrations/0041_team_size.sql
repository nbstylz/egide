-- Migration 0041 : taille d'équipe, et capacité comptée en équipes (US-7.1)
--
-- `tournaments.type` accepte la valeur 'team' depuis la 0002, et le formulaire
-- de création la propose — mais rien ne s'en sert : c'est aujourd'hui une
-- étiquette sans mécanique. L'EPIC-7 commence par lui donner la seule donnée
-- qui manque pour être exploitable : combien de joueurs par équipe.
--
-- Deux joueurs minimum, huit maximum : le format français en aligne 3, l'ETC
-- 5 à 8. « Taille libre » du cahier des charges est comprise comme « un nombre
-- au choix de l'organisateur », **pas** comme « des tailles différentes dans un
-- même tournoi » — ce second sens casserait à la fois le protocole
-- d'appariement et le calcul du score de rencontre.
--
-- La contrainte est croisée avec le type, et vit en base plutôt que dans le
-- formulaire : un tournoi par équipes sans taille d'équipe n'est pas un
-- brouillon incomplet, c'est un tournoi impossible à apparier.

alter table public.tournaments
  add column team_size integer;

alter table public.tournaments
  add constraint tournaments_team_size_valid
  check (team_size is null or team_size between 2 and 8);

alter table public.tournaments
  add constraint tournaments_team_size_matches_type
  check (
    (type = 'team' and team_size is not null)
    or (type <> 'team' and team_size is null)
  );

comment on column public.tournaments.team_size is
  'Nombre de joueurs par équipe (2 à 8). Non nul si et seulement si type = ''team''.';

-- La colonne est **publique**, contrairement à la règle des inscriptions : elle
-- répond à la question qui décide si je peux venir (« puis-je aligner trois
-- joueurs ? »), et l'annuaire doit pouvoir l'afficher sans compte.
-- `tournaments` porte un grant de table : la colonne en hérite, c'est voulu.

comment on column public.tournaments.capacity is
  'Nombre maximum d''inscriptions. Compté en JOUEURS pour un tournoi individuel, en ÉQUIPES pour un tournoi par équipes.';

-- ---------------------------------------------------------------------------
-- La duplication doit suivre, sinon elle casse
-- ---------------------------------------------------------------------------
-- `duplicate_tournament` (0026) recopie `type` mais ne connaît pas
-- `team_size` : dupliquer un tournoi par équipes produirait un tournoi de type
-- 'team' sans taille, que la contrainte ci-dessus refuse. La duplication
-- échouerait avec une erreur de contrainte incompréhensible pour l'organisateur.
--
-- C'est le genre de dette qu'une colonne nouvelle crée en silence : toute
-- fonction qui recopie une ligne de `tournaments` colonne par colonne est à
-- rouvrir à chaque ajout.

create or replace function public.duplicate_tournament(
  p_tournament_id uuid,
  p_name text,
  p_event_date date
)
returns tournaments
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

  insert into public.tournaments (
    organizer_id, name, city, region, event_date,
    points_limit, rounds_count, capacity, type, team_size, status
  )
  values (
    v_caller, btrim(p_name), v_src.city, v_src.region, p_event_date,
    v_src.points_limit, v_src.rounds_count, v_src.capacity, v_src.type,
    v_src.team_size, 'draft'
  )
  returning * into v_new;

  return v_new;
end;
$$;

revoke execute on function public.duplicate_tournament(uuid, text, date) from public, anon;
grant execute on function public.duplicate_tournament(uuid, text, date) to authenticated;
