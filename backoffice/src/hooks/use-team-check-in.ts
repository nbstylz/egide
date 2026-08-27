import { useCallback, useEffect, useState } from 'react';

import { supabase } from '../lib/supabase';

export type TeamCheckInRow = {
  team_registration_id: string;
  team_name: string;
  status: 'registered' | 'waitlisted' | 'withdrawn' | 'checked_in';
  /** Taille d'équipe imposée par le tournoi. */
  expected: number;
  /** Joueurs réellement rattachés au roster (un retrait peut l'avoir amputé). */
  roster_size: number;
  present: number;
  /** Pseudos des joueurs sans faction déclarée, séparés par des virgules. */
  missing_factions: string | null;
};

/**
 * L'état de pointage d'un tournoi par équipes.
 *
 * Volontairement, aucun rechargement après écriture : la liste serait recréée
 * et le tableau clignoterait sous le doigt de l'organisateur, debout à
 * l'accueil. Le pointage vit dans un état local jusqu'au prochain
 * rafraîchissement explicite — même leçon que la saisie des scores.
 */
export function useTeamCheckIn(tournamentId: string | undefined) {
  const [rows, setRows] = useState<TeamCheckInRow[]>([]);
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
    const { data, error: dbError } = await supabase.rpc('team_check_in_state', {
      p_tournament_id: tournamentId,
    });
    if (dbError) setError(true);
    else setRows((data as TeamCheckInRow[]) ?? []);
    setLoading(false);
  }, [tournamentId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { rows, loading, error, refresh, setRows };
}
