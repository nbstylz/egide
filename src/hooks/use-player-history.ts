import { useCallback, useEffect, useState } from 'react';

import { matchFaction } from '@/lib/factions';
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
  /**
   * Rang individuel. **Null dans un tournoi par équipes** : les appariements y
   * sont négociés par les capitaines, pas produits par le système suisse, et
   * ce rang ne se compare donc à aucun autre (US-7.9).
   */
  rank: number | null;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points_for: number;
  points_against: number;
  dropped: boolean;
  /** Faction déclarée pour ce tournoi, ou null. */
  faction: string | null;
  tournament_type: 'individual' | 'team';
  /** Nom de l'équipe engagée, en tournoi par équipes. */
  team_name: string | null;
  team_rank: number | null;
  team_field_size: number | null;
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
    // Un rang d'équipe ne se mélange pas à un rang individuel : ils ne
    // mesurent pas la même chose et ne se comparent pas. Les tournois par
    // équipes alimentent donc le bilan (victoires, nuls, défaites) mais pas le
    // meilleur résultat. C'est le défaut retenu, à confirmer par le porteur.
    if (line.rank === null) continue;
    if (summary.bestRank === null || line.rank < summary.bestRank) {
      summary.bestRank = line.rank;
    }
    if (line.rank <= 3) summary.podiums += 1;
    if (line.rank === 1) summary.victories += 1;
  }
  return summary;
}

export type FactionTally = {
  /** Nom officiel, ou null pour le lot « faction non renseignée ». */
  faction: string | null;
  tournaments: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
};

/**
 * Regroupe l'historique par faction jouée.
 *
 * `matchFaction` ramène les saisies libres héritées vers l'entrée officielle,
 * et rend `null` quand rien ne correspond : ces tournois rejoignent alors le
 * lot « non renseignée » plutôt que de fabriquer une faction fantôme. Deux
 * lignes pour une même armée seraient prises pour un bug — et auraient
 * raison de l'être.
 *
 * Le lot « non renseignée » revient toujours en dernier : c'est lui qui fait
 * boucler les totaux avec les tuiles de synthèse, donc qui rend le bloc
 * crédible.
 */
export function summarizeByFaction(history: HistoryLine[]): FactionTally[] {
  const byFaction = new Map<string | null, FactionTally>();
  for (const line of history) {
    const key = matchFaction(line.faction);
    const tally = byFaction.get(key) ?? {
      faction: key,
      tournaments: 0,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
    };
    tally.tournaments += 1;
    tally.played += line.played;
    tally.wins += line.wins;
    tally.draws += line.draws;
    tally.losses += line.losses;
    byFaction.set(key, tally);
  }

  const known = [...byFaction.values()].filter((tally) => tally.faction !== null);
  const unknown = byFaction.get(null);

  // Tri par parties jouées, jamais par victoires : trier par victoires
  // fabriquerait un classement, donc un superlatif, donc le mensonge qu'on
  // cherche à éviter sur de petits échantillons.
  known.sort(
    (a, b) => b.played - a.played || (a.faction ?? '').localeCompare(b.faction ?? '', 'fr')
  );
  return unknown ? [...known, unknown] : known;
}
