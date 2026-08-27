import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

/** Une ligne de `team_standings` (migration 0045). */
export type TeamStandingLine = {
  rank: number;
  /** Identifiant de l'INSCRIPTION de l'équipe à ce tournoi, pas de l'équipe. */
  team_registration_id: string;
  team_id: string;
  team_name: string;
  region: string | null;
  encounters: number;
  wins: number;
  draws: number;
  losses: number;
  /** Matchs individuels gagnés : information de lecture, jamais un départage. */
  table_wins: number;
  points_for: number;
  points_against: number;
  point_diff: number;
  tactics: number;
  match_score: number;
  opponents_wins: number;
};

/**
 * Classement des équipes d'un tournoi.
 *
 * Comme le classement individuel, il est calculé en base : les six départages
 * y vivent, l'app ne refait aucun calcul de rang. Rien n'est stocké — tout se
 * dérive des tables jouées, donc corriger un score met le classement à jour
 * sans recalcul.
 */
export function useTeamStandings(tournamentId: string | undefined, enabled = true) {
  const [standings, setStandings] = useState<TeamStandingLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase || !tournamentId || !enabled) {
      setStandings([]);
      setLoading(false);
      return;
    }
    setFailed(false);
    const { data, error } = await supabase.rpc('team_standings', {
      p_tournament_id: tournamentId,
    });
    if (error) setFailed(true);
    else setStandings((data as TeamStandingLine[]) ?? []);
    setLoading(false);
  }, [tournamentId, enabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { standings, loading, failed, refresh };
}
