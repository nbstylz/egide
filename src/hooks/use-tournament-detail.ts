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
  profile: { pseudo: string; faction_favorite: string | null } | null;
};

export type TournamentDetail = Tournament & {
  organizer: { pseudo: string } | null;
  registrations: RegistrationRow[];
};

/** Ordre d'arrivée : c'est lui qui fait la file d'attente. */
function byArrival(a: RegistrationRow, b: RegistrationRow) {
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
        '*, organizer:profiles(pseudo), registrations(id, player_id, status, created_at, promoted_at, dropped_round, faction, profile:profiles(pseudo, faction_favorite))'
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

  const myRegistration = userId ? (all.find((r) => r.player_id === userId) ?? null) : null;
  const isOrganizer = Boolean(userId && tournament && tournament.organizer_id === userId);
  const isFull = Boolean(tournament && registered.length >= tournament.capacity);

  // Position dans la file d'attente, à partir de 1 (null si non concerné).
  const myWaitlistPosition =
    myRegistration?.status === 'waitlisted'
      ? waitlisted.findIndex((r) => r.id === myRegistration.id) + 1
      : null;

  return {
    tournament,
    loading,
    refresh,
    registered,
    waitlisted,
    registeredCount: registered.length,
    myRegistration,
    myWaitlistPosition,
    isOrganizer,
    isFull,
  };
}
