import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

/** L'état d'une rencontre, tel que la base le dérive du journal des gestes. */
export type PairingState = {
  team_pairing_id: string;
  pairing_status: 'auto' | 'pending' | 'locked';
  team_a_id: string;
  team_b_id: string | null;
  team_size: number;
  pass_number: number;
  attacker_team_id: string;
  defender_team_id: string | null;
  /** `post` | `offer` | `pick` | `last` | `done`. */
  step: string;
  posted_player_id: string | null;
  offered_player_ids: string[];
  free_a: string[];
  free_b: string[];
};

export type EncounterRow = {
  id: string;
  encounter_number: number;
  team_a_id: string;
  team_b_id: string | null;
  first_picker: string | null;
  pairing_status: 'auto' | 'pending' | 'locked';
  round_id: string;
};

/**
 * La rencontre de mon équipe à la ronde en cours, et l'état de sa négociation.
 *
 * Aucun temps réel : le protocole est strictement séquentiel et sans secret —
 * à tout instant chacun voit les deux rosters, les matchs figés et à qui est le
 * tour. On ne peut donc jamais attendre un geste invisible, et un
 * rafraîchissement manuel suffit. C'est ce qui permet de ne pas rouvrir la
 * décision « pas de temps réel » du projet.
 */
export function useCaptainPairing(
  tournamentId: string | undefined,
  myTeamRegistrationId: string | null
) {
  const [encounter, setEncounter] = useState<EncounterRow | null>(null);
  const [state, setState] = useState<PairingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase || !tournamentId || !myTeamRegistrationId) {
      setEncounter(null);
      setState(null);
      setLoading(false);
      return;
    }
    setFailed(false);

    // La ronde en cours : la plus récente du tournoi.
    const { data: rounds } = await supabase
      .from('rounds')
      .select('id, number')
      .eq('tournament_id', tournamentId)
      .order('number', { ascending: false })
      .limit(1);
    const round = (rounds as { id: string; number: number }[] | null)?.[0];
    if (!round) {
      setEncounter(null);
      setState(null);
      setLoading(false);
      return;
    }

    const { data: encounters, error } = await supabase
      .from('team_pairings')
      .select('id, encounter_number, team_a_id, team_b_id, first_picker, pairing_status, round_id')
      .eq('round_id', round.id)
      .or(`team_a_id.eq.${myTeamRegistrationId},team_b_id.eq.${myTeamRegistrationId}`);

    if (error) {
      setFailed(true);
      setLoading(false);
      return;
    }

    const mine = ((encounters as EncounterRow[]) ?? [])[0] ?? null;
    setEncounter(mine);

    if (mine) {
      const { data: raw, error: stateError } = await supabase.rpc('team_pairing_state', {
        p_team_pairing_id: mine.id,
      });
      if (stateError) setFailed(true);
      else setState(raw as PairingState);
    } else {
      setState(null);
    }
    setRefreshedAt(new Date());
    setLoading(false);
  }, [tournamentId, myTeamRegistrationId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { encounter, state, loading, failed, refresh, refreshedAt, setState };
}
