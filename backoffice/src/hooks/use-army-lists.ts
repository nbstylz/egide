import { useCallback, useEffect, useState } from 'react';

import { supabase } from '../lib/supabase';
import { ActiveRegistrationStatuses } from '../lib/tournaments';
import { useRegistrations } from './use-registrations';

export type ArmyListRow = {
  id: string;
  registration_id: string;
  content: string;
  faction: string | null;
  status: 'submitted' | 'approved' | 'rejected';
  organizer_comment: string | null;
  submitted_at: string;
  reviewed_at: string | null;
};

/** Une inscription active accompagnée de sa liste (ou de son absence). */
export type ListEntry = {
  registrationId: string;
  pseudo: string;
  list: ArmyListRow | null;
};

/**
 * Les listes d'armées d'un tournoi, appariées aux inscrits actifs. La RLS ne
 * livre les contenus qu'à l'organisateur — précisément le public de cette page.
 */
export function useArmyLists(tournamentId: string | undefined) {
  const { registered, loading: regLoading, error: regError, refresh: refreshRegistrations } =
    useRegistrations(tournamentId);
  const [lists, setLists] = useState<Map<string, ArmyListRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refreshLists = useCallback(async () => {
    if (!supabase || !tournamentId) {
      setLoading(false);
      return;
    }
    setError(false);
    const { data, error: dbError } = await supabase
      .from('army_lists')
      .select(
        'id, registration_id, content, faction, status, organizer_comment, submitted_at, reviewed_at, registration:registrations!inner(tournament_id)'
      )
      .eq('registration.tournament_id', tournamentId);
    if (dbError) {
      setError(true);
      setLoading(false);
      return;
    }
    const map = new Map<string, ArmyListRow>();
    for (const row of (data ?? []) as unknown as ArmyListRow[]) {
      map.set(row.registration_id, row);
    }
    setLists(map);
    setLoading(false);
  }, [tournamentId]);

  useEffect(() => {
    refreshLists();
  }, [refreshLists]);

  const entries: ListEntry[] = registered
    .filter((r) => ActiveRegistrationStatuses.includes(r.status))
    .map((r) => ({
      registrationId: r.id,
      pseudo: r.profile?.pseudo ?? 'Joueur',
      list: lists.get(r.id) ?? null,
    }));

  /** Valide ou refuse ; la ligne est mise à jour sur place, sans rechargement. */
  const review = useCallback(
    async (listId: string, approved: boolean, comment: string | null) => {
      if (!supabase) return { ok: false, message: 'Hors ligne.' };
      const { error: rpcError } = await supabase.rpc('review_army_list', {
        p_list_id: listId,
        p_approved: approved,
        p_comment: comment,
      });
      if (rpcError) return { ok: false, message: rpcError.message };
      setLists((current) => {
        const next = new Map(current);
        for (const [key, row] of next) {
          if (row.id === listId) {
            next.set(key, {
              ...row,
              status: approved ? 'approved' : 'rejected',
              organizer_comment: comment,
              reviewed_at: new Date().toISOString(),
            });
          }
        }
        return next;
      });
      return { ok: true, message: '' };
    },
    []
  );

  /** Annule une décision : la liste repasse « à relire » (migration 0019). */
  const reopen = useCallback(async (listId: string) => {
    if (!supabase) return { ok: false, message: 'Hors ligne.' };
    const { error: rpcError } = await supabase.rpc('reopen_army_list', { p_list_id: listId });
    if (rpcError) return { ok: false, message: rpcError.message };
    setLists((current) => {
      const next = new Map(current);
      for (const [key, row] of next) {
        if (row.id === listId) {
          next.set(key, { ...row, status: 'submitted', organizer_comment: null, reviewed_at: null });
        }
      }
      return next;
    });
    return { ok: true, message: '' };
  }, []);

  return {
    entries,
    loading: loading || regLoading,
    error: error || regError,
    refresh: () => {
      refreshRegistrations();
      refreshLists();
    },
    review,
    reopen,
  };
}
