import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import {
  ActiveRegistrationStatuses,
  type RegistrationStatus,
  type Tournament,
} from '@/lib/tournaments';

type RegistrationRow = { id: string; player_id: string; status: RegistrationStatus };

export type TournamentDetail = Tournament & {
  organizer: { pseudo: string } | null;
  registrations: RegistrationRow[];
};

/**
 * Charge la fiche complète d'un tournoi : infos, pseudo de l'organisateur
 * et inscriptions (pour le compteur de places et l'état du joueur connecté).
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
      .select('*, organizer:profiles(pseudo), registrations(id, player_id, status)')
      .eq('id', tournamentId)
      .maybeSingle<TournamentDetail>();
    setTournament(data ?? null);
    setLoading(false);
  }, [tournamentId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Valeurs dérivées pratiques pour l'écran.
  const registeredCount =
    tournament?.registrations.filter((r) => ActiveRegistrationStatuses.includes(r.status)).length ??
    0;
  const myRegistration = userId
    ? (tournament?.registrations.find((r) => r.player_id === userId) ?? null)
    : null;
  const isOrganizer = Boolean(userId && tournament && tournament.organizer_id === userId);
  const isFull = Boolean(tournament && registeredCount >= tournament.capacity);

  return { tournament, loading, refresh, registeredCount, myRegistration, isOrganizer, isFull };
}
