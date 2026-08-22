import { useCallback, useEffect, useState } from 'react';

import { supabase } from '../lib/supabase';
import type { TournamentStatus, TournamentType } from '../lib/tournaments';

/**
 * Le pouvoir d'administration se demande à la base, jamais au client :
 * `is_admin()` (migration 0028) est la seule source de vérité. Masquer
 * l'entrée de menu n'est qu'un confort — même en forçant l'URL, la base ne
 * renvoie rien de plus à qui n'est pas admin.
 *
 * Reste `undefined` tant que la réponse n'est pas arrivée. Les écrans doivent
 * attendre cette résolution avant de rediriger : conclure « pas admin » sur
 * un chargement en cours éjecterait l'admin à chaque rafraîchissement de page.
 */
export function useIsAdmin(userId: string | undefined) {
  const [isAdmin, setIsAdmin] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    if (!supabase || !userId) {
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    setIsAdmin(undefined);
    supabase.rpc('is_admin').then(({ data, error }) => {
      if (!cancelled) setIsAdmin(error ? false : Boolean(data));
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return isAdmin;
}

/**
 * Annule un tournoi au nom de l'administration. Renvoie le message d'erreur
 * de la base tel quel : ses refus sont rédigés en français et destinés à
 * être lus (motif trop court, tournoi terminé, déjà annulé).
 */
export async function adminCancelTournament(tournamentId: string, reason: string) {
  if (!supabase) return { ok: false, message: 'Supabase non configuré.' };
  const { error } = await supabase.rpc('admin_cancel_tournament', {
    p_tournament_id: tournamentId,
    p_reason: reason,
  });
  return error ? { ok: false, message: error.message } : { ok: true, message: '' };
}

export type AdminCancellation = {
  reason: string;
  created_at: string;
  admin_pseudo: string | null;
};

/**
 * Motif de l'annulation administrative d'un tournoi. Un statut « Annulé » nu
 * ne dit pas pourquoi : c'est le premier usage visible du journal d'audit.
 */
export function useAdminCancellation(tournamentId: string | undefined, enabled: boolean) {
  const [cancellation, setCancellation] = useState<AdminCancellation | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase || !tournamentId || !enabled) {
      setCancellation(null);
      return;
    }
    const { data } = await supabase.rpc('admin_cancellation', {
      p_tournament_id: tournamentId,
    });
    const rows = (data as AdminCancellation[]) ?? [];
    setCancellation(rows[0] ?? null);
  }, [tournamentId, enabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { cancellation, refresh };
}

export type AdminTournament = {
  id: string;
  name: string;
  city: string;
  region: string | null;
  event_date: string;
  status: TournamentStatus;
  type: TournamentType;
  capacity: number;
  points_limit: number;
  rounds_count: number;
  created_at: string;
  organizer_id: string;
  organizer_pseudo: string | null;
  registered_count: number;
};

/** Au-delà, la liste est tronquée — et le dit (voir `truncated`). */
export const AdminTournamentsLimit = 300;

/**
 * Tous les tournois de la plateforme, brouillons des autres organisateurs
 * compris. Le comptage des inscrits et la jointure vers l'organisateur sont
 * faits en base (`admin_tournaments`, migration 0030) : les embarquer dans la
 * requête tirerait des milliers de lignes d'inscription pour n'afficher que
 * des nombres.
 */
export function useAllTournaments() {
  const [tournaments, setTournaments] = useState<AdminTournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setTournaments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    const { data, error: dbError } = await supabase.rpc('admin_tournaments', {
      p_limit: AdminTournamentsLimit,
    });
    if (dbError) {
      setError(true);
    } else {
      setTournaments((data as AdminTournament[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    tournaments,
    loading,
    error,
    refresh,
    /** Vrai quand la base a rendu autant de lignes que la limite le permet. */
    truncated: tournaments.length >= AdminTournamentsLimit,
  };
}
