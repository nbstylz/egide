import { useCallback, useEffect, useState } from 'react';

import { supabase } from '../lib/supabase';

/** Une ligne de `team_standings` (migration 0045). */
export type TeamStanding = {
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
  /** Rencontres gagnées, nuls compris (un nul vaut 0,5) : le 1er départage. */
  match_score: number;
  opponents_wins: number;
};

/**
 * Les six critères de départage des équipes : la transposition mot pour mot de
 * ceux du classement individuel. Une seule grammaire de classement à apprendre,
 * et le texte d'explication se réutilise presque tel quel.
 */
export const TeamTieBreakers = [
  { key: 'wins', label: 'Rencontres gagnées' },
  { key: 'points', label: 'Points marqués' },
  { key: 'tactics', label: 'Tactiques' },
  { key: 'diff', label: 'Différentiel' },
  { key: 'sos', label: 'Force des adversaires' },
  { key: 'random', label: 'Tirage au sort' },
];

export function useTeamStandings(tournamentId: string | undefined, enabled = true) {
  const [standings, setStandings] = useState<TeamStanding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase || !tournamentId || !enabled) {
      setStandings([]);
      setLoading(false);
      return;
    }
    setError(false);
    const { data, error: dbError } = await supabase.rpc('team_standings', {
      p_tournament_id: tournamentId,
    });
    if (dbError) setError(true);
    else setStandings((data as TeamStanding[]) ?? []);
    setLoading(false);
  }, [tournamentId, enabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { standings, loading, error, refresh };
}
