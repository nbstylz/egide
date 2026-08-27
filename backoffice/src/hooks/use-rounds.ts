import { useCallback, useEffect, useMemo, useState } from 'react';

import { supabase } from '../lib/supabase';

export type Round = {
  id: string;
  number: number;
  status: 'in_progress' | 'completed';
  created_at: string;
  /** Scénario annoncé, en texte libre. Souvent absent : facultatif. */
  scenario: string | null;
};

export type Pairing = {
  id: string;
  table_number: number;
  player_a_id: string;
  player_b_id: string | null;
  score_a: number | null;
  score_b: number | null;
  /** Tactiques marquées : 3e critère de départage du classement. */
  tactics_a: number | null;
  tactics_b: number | null;
  player_a: { pseudo: string } | null;
  player_b: { pseudo: string } | null;
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
      .select('id, number, status, created_at, scenario')
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
        'id, table_number, player_a_id, player_b_id, score_a, score_b, tactics_a, tactics_b, player_a:profiles!pairings_player_a_id_fkey(pseudo), player_b:profiles!pairings_player_b_id_fkey(pseudo)'
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

  /**
   * Enregistre le scénario d'une ronde. On met la liste à jour sur place
   * plutôt que de recharger : `refresh()` rouvrirait la ronde par défaut et
   * ferait clignoter le tableau des tables.
   */
  const setScenario = useCallback(async (roundId: string, scenario: string) => {
    if (!supabase) return { ok: false, message: 'Hors ligne.' };
    const clean = scenario.trim();
    const { error: rpcError } = await supabase.rpc('set_round_scenario', {
      p_round_id: roundId,
      p_scenario: clean,
    });
    if (rpcError) return { ok: false, message: rpcError.message };
    setRounds((current) =>
      current.map((r) => (r.id === roundId ? { ...r, scenario: clean || null } : r))
    );
    return { ok: true, message: '' };
  }, []);

  /**
   * Scénario d'une ronde désignée par son numéro : les modales de lancement
   * et de clôture le saisissent avant que la ronde existe, donc avant d'avoir
   * son identifiant. Un échec ici ne remet jamais la ronde en cause — elle est
   * déjà créée, et le champ reste corrigeable sur la page.
   */
  const setScenarioForRound = useCallback(
    async (roundNumber: number, scenario: string) => {
      if (!supabase || !tournamentId || scenario.trim() === '') return { ok: true, message: '' };
      const { data } = await supabase
        .from('rounds')
        .select('id')
        .eq('tournament_id', tournamentId)
        .eq('number', roundNumber)
        .maybeSingle<{ id: string }>();
      if (!data) return { ok: false, message: 'Ronde introuvable.' };
      return setScenario(data.id, scenario);
    },
    [tournamentId, setScenario]
  );

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
    setScenario,
    setScenarioForRound,
  };
}
