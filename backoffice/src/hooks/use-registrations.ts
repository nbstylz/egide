import { useCallback, useEffect, useState } from 'react';

import { supabase } from '../lib/supabase';
import { ActiveRegistrationStatuses, type RegistrationStatus } from '../lib/tournaments';

export type Registration = {
  id: string;
  player_id: string;
  status: RegistrationStatus;
  created_at: string;
  profile: { pseudo: string; faction_favorite: string | null; region: string | null } | null;
};

/** Ordre d'arrivée : il fait foi pour la liste d'attente. */
function byArrival(a: Registration, b: Registration) {
  return a.created_at.localeCompare(b.created_at);
}

/** Ordre alphabétique tolérant aux accents. */
function byPseudo(a: Registration, b: Registration) {
  return (a.profile?.pseudo ?? '').localeCompare(b.profile?.pseudo ?? '', 'fr', {
    sensitivity: 'base',
  });
}

/**
 * Inscriptions d'un tournoi, réparties en inscrits, liste d'attente
 * et désistements.
 */
export function useRegistrations(tournamentId: string | undefined) {
  const [rows, setRows] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase || !tournamentId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    const { data, error: dbError } = await supabase
      .from('registrations')
      .select('id, player_id, status, created_at, profile:profiles(pseudo, faction_favorite, region)')
      .eq('tournament_id', tournamentId);
    if (dbError) {
      setError(true);
    } else {
      setRows((data as unknown as Registration[]) ?? []);
    }
    setLoading(false);
  }, [tournamentId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const registered = rows
    .filter((r) => ActiveRegistrationStatuses.includes(r.status))
    .sort(byPseudo);
  const waitlisted = rows.filter((r) => r.status === 'waitlisted').sort(byArrival);
  const withdrawn = rows.filter((r) => r.status === 'withdrawn').sort(byArrival);

  return { registered, waitlisted, withdrawn, loading, error, refresh };
}
