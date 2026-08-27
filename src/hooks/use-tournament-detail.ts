import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import {
  ActiveRegistrationStatuses,
  type RegistrationStatus,
  type Tournament,
} from '@/lib/tournaments';

/** Une inscription accompagnée du profil du joueur. */
export type RegistrationRow = {
  id: string;
  player_id: string;
  status: RegistrationStatus;
  created_at: string;
  /** Date de promotion depuis la liste d'attente (null si inscription directe). */
  promoted_at: string | null;
  /** Ronde à laquelle le joueur a abandonné (null sinon). */
  dropped_round: number | null;
  /** Faction déclarée pour ce tournoi (US-9.3), ou null. */
  faction: string | null;
  /** Inscription d'équipe dont ce joueur fait partie (US-7.2), ou null. */
  team_registration_id: string | null;
  /** Rang dans le roster (1..N), null en tournoi individuel. */
  roster_position: number | null;
  profile: { pseudo: string; faction_favorite: string | null } | null;
};

/** Une équipe engagée dans un tournoi par équipes. */
export type TeamRegistrationRow = {
  id: string;
  team_id: string;
  captain_id: string;
  status: RegistrationStatus;
  created_at: string;
  promoted_at: string | null;
  team: { name: string; region: string | null } | null;
};

/** Une équipe engagée, accompagnée de son roster ordonné. */
export type EngagedTeam = TeamRegistrationRow & {
  roster: RegistrationRow[];
};

export type TournamentDetail = Tournament & {
  organizer: { pseudo: string } | null;
  registrations: RegistrationRow[];
  team_registrations: TeamRegistrationRow[];
};

/**
 * Ordre d'arrivée : c'est lui qui fait la file d'attente. Vaut pour un joueur
 * comme pour une équipe — seule la date d'inscription est lue.
 */
function byArrival(a: { created_at: string }, b: { created_at: string }) {
  return a.created_at.localeCompare(b.created_at);
}

/** Ordre alphabétique tolérant aux accents : « Élias » se range avec « Elias ». */
function byPseudo(a: RegistrationRow, b: RegistrationRow) {
  const left = a.profile?.pseudo ?? '';
  const right = b.profile?.pseudo ?? '';
  return left.localeCompare(right, 'fr', { sensitivity: 'base' });
}

/**
 * Tronque une liste à `limit` lignes, en garantissant que la ligne du joueur
 * connecté reste visible (sinon un inscrit parmi 100 ne se verrait nulle part).
 */
export function visibleSlice(rows: RegistrationRow[], limit: number, myId?: string) {
  if (rows.length <= limit) return rows;
  const head = rows.slice(0, limit);
  if (!myId || head.some((r) => r.player_id === myId)) return head;
  const mine = rows.find((r) => r.player_id === myId);
  return mine ? [...rows.slice(0, limit - 1), mine] : head;
}

/**
 * Charge la fiche complète d'un tournoi : infos, organisateur, inscrits et
 * liste d'attente, plus les valeurs dérivées utiles à l'écran.
 */
export function useTournamentDetail(tournamentId: string | undefined, userId: string | undefined) {
  const [tournament, setTournament] = useState<TournamentDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!supabase || !tournamentId) {
      setTournament(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('tournaments')
      .select(
        '*, organizer:profiles(pseudo), registrations(id, player_id, status, created_at, promoted_at, dropped_round, faction, team_registration_id, roster_position, profile:profiles(pseudo, faction_favorite)), team_registrations(id, team_id, captain_id, status, created_at, promoted_at, team:teams(name, region))'
      )
      .eq('id', tournamentId)
      .maybeSingle<TournamentDetail>();
    setTournament(data ?? null);
    setLoading(false);
  }, [tournamentId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const all = tournament?.registrations ?? [];
  // Les inscrits sont listés par pseudo (on cherche un nom), la file d'attente
  // par ordre d'arrivée (l'ordre est l'information).
  const registered = all
    .filter((r) => ActiveRegistrationStatuses.includes(r.status))
    .sort(byPseudo);
  const waitlisted = all.filter((r) => r.status === 'waitlisted').sort(byArrival);

  // Les équipes engagées, chacune avec son roster ordonné. Le roster vient des
  // mêmes lignes `registrations` que tout le reste : il n'y a pas deux vérités.
  const allTeams = tournament?.team_registrations ?? [];
  const rosterOf = (teamRegistrationId: string) =>
    all
      .filter((r) => r.team_registration_id === teamRegistrationId)
      .sort((a, b) => (a.roster_position ?? 0) - (b.roster_position ?? 0));

  const engagedTeams: EngagedTeam[] = allTeams
    .filter((t) => ActiveRegistrationStatuses.includes(t.status))
    .sort(byArrival)
    .map((t) => ({ ...t, roster: rosterOf(t.id) }));
  const waitlistedTeams: EngagedTeam[] = allTeams
    .filter((t) => t.status === 'waitlisted')
    .sort(byArrival)
    .map((t) => ({ ...t, roster: rosterOf(t.id) }));

  const myRegistration = userId ? (all.find((r) => r.player_id === userId) ?? null) : null;
  // Mon équipe engagée : celle dont je fais partie, capitaine ou non.
  const myTeamRegistration =
    myRegistration?.team_registration_id
      ? ([...engagedTeams, ...waitlistedTeams].find(
          (t) => t.id === myRegistration.team_registration_id
        ) ?? null)
      : null;
  const isOrganizer = Boolean(userId && tournament && tournament.organizer_id === userId);
  // La capacité d'un tournoi par équipes se compte en équipes (0041) : compter
  // les joueurs y afficherait « 36 / 12 ».
  const isTeamTournament = tournament?.type === 'team';
  const takenSlots = isTeamTournament ? engagedTeams.length : registered.length;
  const isFull = Boolean(tournament && takenSlots >= tournament.capacity);

  // Position dans la file d'attente, à partir de 1 (null si non concerné).
  // En tournoi par équipes, c'est la place de l'équipe qui compte : une équipe
  // attend en entier, ses trois joueurs n'ont pas trois positions.
  const myWaitlistPosition = isTeamTournament
    ? myTeamRegistration?.status === 'waitlisted'
      ? waitlistedTeams.findIndex((t) => t.id === myTeamRegistration.id) + 1
      : null
    : myRegistration?.status === 'waitlisted'
      ? waitlisted.findIndex((r) => r.id === myRegistration.id) + 1
      : null;

  return {
    tournament,
    loading,
    refresh,
    registered,
    waitlisted,
    registeredCount: registered.length,
    engagedTeams,
    waitlistedTeams,
    myTeamRegistration,
    isTeamTournament,
    /** Places occupées, dans l'unité du tournoi : joueurs, ou équipes. */
    takenSlots,
    myRegistration,
    myWaitlistPosition,
    isOrganizer,
    isFull,
  };
}
