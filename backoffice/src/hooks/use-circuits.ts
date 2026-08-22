import { useCallback, useEffect, useState } from 'react';

import { supabase } from '../lib/supabase';

/** Une ligne de la table `circuits` (migration 0024). */
export type Circuit = {
  id: string;
  owner_id: string;
  name: string;
  season: string;
  region: string | null; // NULL = national (toutes régions)
  start_date: string;
  end_date: string;
  best_n: number;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
};

/** Une ligne renvoyée par la fonction `circuit_standings`. */
export type CircuitStanding = {
  rank: number;
  player_id: string;
  pseudo: string;
  region: string | null;
  circuit_points: number;
  tournaments_counted: number;
  tournaments_played: number;
  best_result: number;
};

/** Liste des circuits (lecture publique), du plus récent au plus ancien. */
export function useCircuits() {
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setCircuits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    const { data, error: dbError } = await supabase
      .from('circuits')
      .select('*')
      .order('start_date', { ascending: false });
    if (dbError) setError(true);
    else setCircuits((data as Circuit[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { circuits, loading, error, refresh };
}

/** Classement de saison d'un circuit, calculé côté base par `circuit_standings`. */
export function useCircuitStandings(circuitId: string | undefined) {
  const [standings, setStandings] = useState<CircuitStanding[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase || !circuitId) {
      setStandings([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    const { data, error: dbError } = await supabase.rpc('circuit_standings', {
      p_circuit_id: circuitId,
    });
    if (dbError) setError(true);
    else setStandings((data as CircuitStanding[]) ?? []);
    setLoading(false);
  }, [circuitId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { standings, loading, error, refresh };
}

export type NewCircuit = {
  name: string;
  season: string;
  region: string | null;
  start_date: string;
  end_date: string;
  best_n: number;
};

/** Crée un circuit détenu par l'utilisateur connecté. */
export async function createCircuit(userId: string, input: NewCircuit) {
  if (!supabase) return { data: null, error: 'Supabase non configuré.' };
  const { data, error } = await supabase
    .from('circuits')
    .insert({ ...input, owner_id: userId })
    .select()
    .single();
  return { data: (data as Circuit) ?? null, error: error?.message ?? null };
}

/**
 * Régions réellement présentes dans les tournois. Le rattachement d'un circuit
 * étant automatique par égalité de région, on ne propose que des valeurs
 * existantes : impossible de saisir une région qui ne correspondrait à rien.
 */
export function useTournamentRegions() {
  const [regions, setRegions] = useState<string[]>([]);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from('tournaments')
      .select('region')
      .not('region', 'is', null)
      .then(({ data }) => {
        const set = new Set<string>();
        ((data as { region: string | null }[]) ?? []).forEach((row) => {
          if (row.region) set.add(row.region);
        });
        setRegions([...set].sort((a, b) => a.localeCompare(b, 'fr')));
      });
  }, []);

  return regions;
}
