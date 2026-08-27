import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

/** La rencontre de mon équipe à la ronde en cours, et son score vivant. */
export type MyEncounter = {
  id: string;
  encounter_number: number;
  /** Vrai quand mon équipe est l'équipe A : c'est elle qui porte `score_a`. */
  iAmTeamA: boolean;
  opponentTeamRegistrationId: string | null;
  pairing_status: 'auto' | 'pending' | 'locked';
  /** Points marqués par mon équipe sur les tables déjà saisies. */
  points_for: number;
  points_against: number;
  tables_total: number;
  tables_scored: number;
};

/**
 * Le score de rencontre affiché au joueur pendant qu'elle se joue.
 *
 * Il est calculé ici, table par table, et non lu dans `team_encounter_results`
 * : cette vue ne compte que les rencontres **entièrement** saisies, pour ne pas
 * fausser le classement. Le joueur, lui, a le droit de voir un score partiel —
 * à condition qu'on lui dise qu'il l'est.
 */
export function useMyEncounter(
  tournamentId: string | undefined,
  myTeamRegistrationId: string | null,
  tournamentStatus: string | undefined
) {
  const [encounter, setEncounter] = useState<MyEncounter | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const live = tournamentStatus === 'in_progress' || tournamentStatus === 'completed';
    if (!supabase || !tournamentId || !myTeamRegistrationId || !live) {
      setEncounter(null);
      setLoading(false);
      return;
    }

    const { data: rounds } = await supabase
      .from('rounds')
      .select('id')
      .eq('tournament_id', tournamentId)
      .order('number', { ascending: false })
      .limit(1);
    const round = (rounds as { id: string }[] | null)?.[0];
    if (!round) {
      setEncounter(null);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('team_pairings')
      .select(
        'id, encounter_number, team_a_id, team_b_id, pairing_status, pairings(score_a, score_b)'
      )
      .eq('round_id', round.id)
      .or(`team_a_id.eq.${myTeamRegistrationId},team_b_id.eq.${myTeamRegistrationId}`)
      .limit(1);

    const row = (data as unknown as
      | {
          id: string;
          encounter_number: number;
          team_a_id: string;
          team_b_id: string | null;
          pairing_status: 'auto' | 'pending' | 'locked';
          pairings: { score_a: number | null; score_b: number | null }[];
        }[]
      | null)?.[0];

    if (!row) {
      setEncounter(null);
      setLoading(false);
      return;
    }

    const iAmTeamA = row.team_a_id === myTeamRegistrationId;
    const scored = row.pairings.filter((p) => p.score_a !== null);
    const sum = (pick: (p: { score_a: number | null; score_b: number | null }) => number | null) =>
      scored.reduce((total, p) => total + (pick(p) ?? 0), 0);

    setEncounter({
      id: row.id,
      encounter_number: row.encounter_number,
      iAmTeamA,
      opponentTeamRegistrationId: iAmTeamA ? row.team_b_id : row.team_a_id,
      pairing_status: row.pairing_status,
      points_for: iAmTeamA ? sum((p) => p.score_a) : sum((p) => p.score_b),
      points_against: iAmTeamA ? sum((p) => p.score_b) : sum((p) => p.score_a),
      tables_total: row.pairings.length,
      tables_scored: scored.length,
    });
    setLoading(false);
  }, [tournamentId, myTeamRegistrationId, tournamentStatus]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { encounter, loading, refresh };
}
