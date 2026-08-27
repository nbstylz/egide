import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

/** Une ligne de `tournament_standings`, telle que renvoyée par la base. */
export type StandingLine = {
  rank: number;
  player_id: string;
  pseudo: string;
  /** Faction déclarée pour ce tournoi (US-9.3), jamais la favorite du profil. */
  faction: string | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points_for: number;
  points_against: number;
  point_diff: number;
  tactics: number;
  win_score: number;
  opponents_wins: number;
  dropped: boolean;
};

/**
 * Classement d'un tournoi, calculé côté base : les six départages y vivent,
 * l'app ne refait aucun calcul de rang. Lecture publique.
 */
export function useStandings(tournamentId: string | undefined) {
  const [standings, setStandings] = useState<StandingLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase || !tournamentId) {
      setLoading(false);
      return;
    }
    setFailed(false);
    const { data, error } = await supabase.rpc('tournament_standings', {
      p_tournament_id: tournamentId,
    });
    if (error) {
      setFailed(true);
    } else {
      setStandings((data as StandingLine[]) ?? []);
    }
    setLoading(false);
  }, [tournamentId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { standings, loading, failed, refresh };
}
