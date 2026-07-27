import { useCallback, useEffect, useMemo, useState } from 'react';

import { supabase } from '../lib/supabase';

export type Round = {
  id: string;
  number: number;
  status: 'in_progress' | 'completed';
  created_at: string;
};

export type Pairing = {
  id: string;
  table_number: number;
  score_a: number | null;
  score_b: number | null;
  /** Tactiques marquées : 3e critère de départage du classement. */
  tactics_a: number | null;
  tactics_b: number | null;
  player_a: { pseudo: string; faction_favorite: string | null } | null;
  player_b: { pseudo: string; faction_favorite: string | null } | null;
};

/** Rondes d'un tournoi, et appariements de la ronde sélectionnée. */
export function useRounds(tournamentId: string | undefined) {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [pairings, setPairings] = useState<Pairing[]>([]);
  const [selectedNumber, setSelectedNumber] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase || !tournamentId) {
      setRounds([]);
      setPairings([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);

    const { data: roundRows, error: roundError } = await supabase
      .from('rounds')
      .select('id, number, status, created_at')
      .eq('tournament_id', tournamentId)
      .order('number');

    if (roundError) {
      setError(true);
      setLoading(false);
      return;
    }

    const list = (roundRows as Round[]) ?? [];
    setRounds(list);

    // Par défaut on ouvre la dernière ronde générée : c'est celle en cours.
    const target =
      selectedNumber && list.some((r) => r.number === selectedNumber)
        ? selectedNumber
        : (list[list.length - 1]?.number ?? null);
    setSelectedNumber(target);

    const current = list.find((r) => r.number === target);
    if (!current) {
      setPairings([]);
      setLoading(false);
      return;
    }

    const { data: pairingRows, error: pairingError } = await supabase
      .from('pairings')
      .select(
        'id, table_number, score_a, score_b, tactics_a, tactics_b, player_a:profiles!pairings_player_a_id_fkey(pseudo, faction_favorite), player_b:profiles!pairings_player_b_id_fkey(pseudo, faction_favorite)'
      )
      .eq('round_id', current.id)
      .order('table_number');

    if (pairingError) {
      setError(true);
    } else {
      setPairings((pairingRows as unknown as Pairing[]) ?? []);
    }
    setLoading(false);
  }, [tournamentId, selectedNumber]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Le bye ferme la marche : sa « table » n'en est pas une.
  const orderedPairings = useMemo(() => {
    const real = pairings.filter((p) => p.player_b !== null);
    const byes = pairings.filter((p) => p.player_b === null);
    return [...real, ...byes];
  }, [pairings]);

  const currentRound = rounds.find((r) => r.number === selectedNumber) ?? null;
  const scored = pairings.filter((p) => p.score_a !== null && p.score_b !== null).length;

  return {
    rounds,
    pairings: orderedPairings,
    currentRound,
    selectedNumber,
    setSelectedNumber,
    scored,
    loading,
    error,
    refresh,
  };
}
