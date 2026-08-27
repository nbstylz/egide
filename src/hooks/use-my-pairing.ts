import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

export type RoundInfo = {
  id: string;
  number: number;
  status: 'in_progress' | 'completed';
  scenario: string | null;
};

export type PairingInfo = {
  id: string;
  table_number: number;
  player_a_id: string;
  player_b_id: string | null;
  score_a: number | null;
  score_b: number | null;
  player_a: { pseudo: string } | null;
  player_b: { pseudo: string } | null;
};

/** Une ronde jouée, vue de mon côté de la table. */
export type MyResult = {
  round_number: number;
  opponent_pseudo: string | null;
  points_for: number;
  points_against: number;
  outcome: 'win' | 'draw' | 'loss';
  bye: boolean;
};

export type StandingRow = {
  rank: number;
  player_id: string;
  pseudo: string;
  wins: number;
  draws: number;
  losses: number;
  points_for: number;
  dropped: boolean;
};

/**
 * Le tournoi vécu côté joueur : ronde en cours, mon appariement, mes rondes
 * passées, et le classement final quand le tournoi est terminé. Lecture
 * seule — la RLS de `rounds` et `pairings` est publique.
 */
export function useMyPairing(
  tournamentId: string | undefined,
  userId: string | undefined,
  tournamentStatus: string | undefined
) {
  const [rounds, setRounds] = useState<RoundInfo[]>([]);
  const [pairings, setPairings] = useState<PairingInfo[]>([]);
  const [myResults, setMyResults] = useState<MyResult[]>([]);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  const active = tournamentStatus === 'in_progress' || tournamentStatus === 'completed';

  const refresh = useCallback(async () => {
    if (!supabase || !tournamentId || !active) {
      setLoading(false);
      return;
    }
    setFailed(false);

    const { data: roundRows, error: roundError } = await supabase
      .from('rounds')
      .select('id, number, status, scenario')
      .eq('tournament_id', tournamentId)
      .order('number');

    if (roundError) {
      setFailed(true);
      setLoading(false);
      return;
    }

    const list = (roundRows as RoundInfo[]) ?? [];
    setRounds(list);
    const current = list[list.length - 1] ?? null;

    const tasks: PromiseLike<boolean>[] = [];

    if (current) {
      tasks.push(
        supabase
          .from('pairings')
          .select(
            'id, table_number, player_a_id, player_b_id, score_a, score_b, player_a:profiles!pairings_player_a_id_fkey(pseudo), player_b:profiles!pairings_player_b_id_fkey(pseudo)'
          )
          .eq('round_id', current.id)
          .order('table_number')
          .then(({ data, error }) => {
            if (error) return false;
            setPairings((data as unknown as PairingInfo[]) ?? []);
            return true;
          })
      );
    }

    if (userId) {
      tasks.push(
        supabase
          .from('player_results')
          .select('round_number, opponent_id, points_for, points_against')
          .eq('tournament_id', tournamentId)
          .eq('player_id', userId)
          .order('round_number')
          .then(async ({ data, error }) => {
            if (error) return false;
            const rows = (data ?? []) as {
              round_number: number;
              opponent_id: string | null;
              points_for: number;
              points_against: number;
            }[];
            // La vue ne porte que des identifiants : on résout les pseudos.
            const opponentIds = [...new Set(rows.map((r) => r.opponent_id).filter(Boolean))];
            const names = new Map<string, string>();
            if (opponentIds.length > 0 && supabase) {
              const { data: profiles } = await supabase
                .from('profiles')
                .select('id, pseudo')
                .in('id', opponentIds as string[]);
              for (const p of (profiles ?? []) as { id: string; pseudo: string }[]) {
                names.set(p.id, p.pseudo);
              }
            }
            setMyResults(
              rows.map((r) => ({
                round_number: r.round_number,
                opponent_pseudo: r.opponent_id ? (names.get(r.opponent_id) ?? null) : null,
                points_for: r.points_for,
                points_against: r.points_against,
                outcome:
                  r.points_for === r.points_against
                    ? 'draw'
                    : r.points_for > r.points_against
                      ? 'win'
                      : 'loss',
                bye: r.opponent_id === null,
              }))
            );
            return true;
          })
      );
    }

    // Le classement ne sert ici qu'à la synthèse de fin de tournoi.
    if (tournamentStatus === 'completed') {
      tasks.push(
        supabase
          .rpc('tournament_standings', { p_tournament_id: tournamentId })
          .then(({ data, error }) => {
            if (error) return false;
            setStandings((data as StandingRow[]) ?? []);
            return true;
          })
      );
    }

    const results = await Promise.all(tasks);
    if (results.some((ok) => !ok)) {
      setFailed(true);
    } else {
      setRefreshedAt(new Date());
    }
    setLoading(false);
  }, [tournamentId, userId, active, tournamentStatus]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const currentRound = rounds[rounds.length - 1] ?? null;
  const myPairing = userId
    ? (pairings.find((p) => p.player_a_id === userId || p.player_b_id === userId) ?? null)
    : null;

  return {
    rounds,
    currentRound,
    pairings,
    myPairing,
    myResults,
    standings,
    loading,
    failed,
    refreshedAt,
    refresh,
  };
}
