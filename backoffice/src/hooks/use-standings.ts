import { useCallback, useEffect, useState } from 'react';

import { supabase } from '../lib/supabase';

export type Standing = {
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
  /** Victoires nuls compris (un nul vaut 0,5) : c'est le 1er départage. */
  win_score: number;
  opponents_wins: number;
  /** Le joueur a abandonné en cours de tournoi ; ses résultats restent acquis. */
  dropped: boolean;
  dropped_round: number | null;
};

/** Les six critères de départage, dans l'ordre validé. */
export const TieBreakers = [
  { key: 'wins', label: 'Victoires' },
  { key: 'points', label: 'Points marqués' },
  { key: 'tactics', label: 'Tactiques marquées' },
  { key: 'diff', label: 'Différentiel' },
  { key: 'sos', label: 'Force des adversaires' },
  { key: 'random', label: 'Tirage au sort' },
] as const;

export type TieBreakerKey = (typeof TieBreakers)[number]['key'];

/** Valeur d'un joueur pour un critère donné. */
export function criterionValue(standing: Standing, key: TieBreakerKey): number | null {
  switch (key) {
    case 'wins':
      return Number(standing.win_score);
    case 'points':
      return standing.points_for;
    case 'tactics':
      return standing.tactics;
    case 'diff':
      return standing.point_diff;
    case 'sos':
      return Number(standing.opponents_wins);
    default:
      return null;
  }
}

/**
 * Premier critère qui sépare deux joueurs consécutifs. C'est la réponse à
 * « pourquoi suis-je derrière lui ? ».
 */
export function decisiveCriterion(above: Standing, below: Standing): TieBreakerKey {
  for (const { key } of TieBreakers) {
    if (key === 'random') return 'random';
    const a = criterionValue(above, key);
    const b = criterionValue(below, key);
    if (a !== b) return key;
  }
  return 'random';
}

/** Classement d'un tournoi, tel que calculé par la base. */
export function useStandings(tournamentId: string | undefined) {
  const [standings, setStandings] = useState<Standing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase || !tournamentId) {
      setStandings([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    const { data, error: dbError } = await supabase.rpc('tournament_standings', {
      p_tournament_id: tournamentId,
    });
    if (dbError) {
      setError(true);
    } else {
      setStandings((data as Standing[]) ?? []);
    }
    setLoading(false);
  }, [tournamentId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { standings, loading, error, refresh };
}
