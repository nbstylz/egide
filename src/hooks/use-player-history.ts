import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { TournamentStatus } from '@/lib/tournaments';

/** Un tournoi disputé, tel que renvoyé par `player_history` (migration 0035). */
export type HistoryLine = {
  tournament_id: string;
  name: string;
  city: string;
  region: string | null;
  event_date: string;
  status: TournamentStatus;
  rounds_count: number;
  points_limit: number;
  /** Nombre de joueurs classés : un 3e sur 40 ne vaut pas un 3e sur 4. */
  field_size: number;
  rank: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points_for: number;
  points_against: number;
  dropped: boolean;
};

/**
 * Historique des tournois disputés par un joueur, du plus récent au plus
 * ancien. Le rang vient de `tournament_standings` rejoué en base : l'app ne
 * recalcule aucun classement, sous peine de diverger des six départages.
 *
 * Un joueur inscrit mais dont aucune partie n'a encore de score n'apparaît
 * pas — on liste ce qui a été joué, pas ce qui est prévu.
 */
export function usePlayerHistory(playerId: string | undefined) {
  const [history, setHistory] = useState<HistoryLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase || !playerId) {
      setHistory([]);
      setLoading(false);
      return;
    }
    setFailed(false);
    const { data, error } = await supabase.rpc('player_history', {
      p_player_id: playerId,
    });
    if (error) {
      setFailed(true);
    } else {
      setHistory((data as HistoryLine[]) ?? []);
    }
    setLoading(false);
  }, [playerId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { history, loading, failed, refresh };
}

/** Synthèse affichable en tête de section, calculée une seule fois. */
export type HistorySummary = {
  tournaments: number;
  wins: number;
  draws: number;
  losses: number;
  /** Meilleur rang obtenu, toutes tailles de plateau confondues. */
  bestRank: number | null;
  podiums: number;
  victories: number;
};

export function summarize(history: HistoryLine[]): HistorySummary {
  // Les tournois abandonnés comptent dans les parties jouées : elles ont bien
  // eu lieu. Seul le podium leur est refusé (voir `podiums` ci-dessous).
  const summary: HistorySummary = {
    tournaments: history.length,
    wins: 0,
    draws: 0,
    losses: 0,
    bestRank: null,
    podiums: 0,
    victories: 0,
  };
  for (const line of history) {
    summary.wins += line.wins;
    summary.draws += line.draws;
    summary.losses += line.losses;
    if (line.dropped) continue;
    if (summary.bestRank === null || line.rank < summary.bestRank) {
      summary.bestRank = line.rank;
    }
    if (line.rank <= 3) summary.podiums += 1;
    if (line.rank === 1) summary.victories += 1;
  }
  return summary;
}
