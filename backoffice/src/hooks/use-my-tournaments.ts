import { useCallback, useEffect, useState } from 'react';

import { supabase } from '../lib/supabase';
import {
  ActiveRegistrationStatuses,
  type RegistrationStatus,
  type Tournament,
} from '../lib/tournaments';

export type TournamentWithCount = Tournament & { registered_count: number };

type Row = Tournament & { registrations: { status: RegistrationStatus }[] };

/** Tournois de l'organisateur connecté + nombre d'inscrits actifs. */
export function useMyTournaments(userId: string | undefined) {
  const [tournaments, setTournaments] = useState<TournamentWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase || !userId) {
      setTournaments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    const { data, error: dbError } = await supabase
      .from('tournaments')
      .select('*, registrations(status)')
      .eq('organizer_id', userId);
    if (dbError) {
      setError(true);
    } else {
      setTournaments(
        ((data as Row[]) ?? []).map(({ registrations, ...tournament }) => ({
          ...tournament,
          registered_count: registrations.filter((r) =>
            ActiveRegistrationStatuses.includes(r.status)
          ).length,
        }))
      );
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { tournaments, loading, error, refresh };
}

/** Un tournoi par id (réservé à son organisateur via RLS) + inscrits actifs. */
export function useTournament(tournamentId: string | undefined) {
  const [tournament, setTournament] = useState<TournamentWithCount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase || !tournamentId) {
      setTournament(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    const { data, error: dbError } = await supabase
      .from('tournaments')
      .select('*, registrations(status)')
      .eq('id', tournamentId)
      .maybeSingle<Row>();
    if (dbError) {
      setError(true);
      setTournament(null);
    } else if (!data) {
      setTournament(null);
    } else {
      const { registrations, ...rest } = data;
      setTournament({
        ...rest,
        registered_count: registrations.filter((r) =>
          ActiveRegistrationStatuses.includes(r.status)
        ).length,
      });
    }
    setLoading(false);
  }, [tournamentId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { tournament, loading, error, refresh };
}
