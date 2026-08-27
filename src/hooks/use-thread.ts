import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

export type ThreadMessage = {
  id: string;
  author_id: string;
  author_pseudo: string;
  body: string;
  created_at: string;
  deleted: boolean;
  /** Calculé en base : le client ne refait pas les règles de modération. */
  can_delete: boolean;
};

/**
 * Le fil d'un tournoi ou d'une équipe.
 *
 * Aucun temps réel, comme partout dans ce projet : on tire pour rafraîchir. Un
 * fil de tournoi n'est pas une messagerie instantanée — il sert à demander une
 * place de covoiturage et à savoir si l'événement est maintenu sous la neige.
 *
 * `can_delete` vient de la base plutôt que d'un calcul local : dupliquer les
 * règles de modération côté client, ce serait deux copies d'une même règle qui
 * finiraient par diverger.
 */
export function useThread(tournamentId?: string | null, teamId?: string | null) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase || (!tournamentId && !teamId)) {
      setMessages([]);
      setLoading(false);
      return;
    }
    setFailed(false);
    const { data, error } = await supabase.rpc('thread_messages', {
      p_tournament_id: tournamentId ?? null,
      p_team_id: teamId ?? null,
      p_limit: 100,
    });
    if (error) setFailed(true);
    else setMessages((data as ThreadMessage[]) ?? []);
    setLoading(false);
  }, [tournamentId, teamId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const post = useCallback(
    async (body: string) => {
      if (!supabase) return 'Impossible d’envoyer le message.';
      const { error } = await supabase.rpc('post_message', {
        p_tournament_id: tournamentId ?? null,
        p_team_id: teamId ?? null,
        p_body: body,
      });
      if (error) {
        switch (error.message) {
          case 'NOT_A_PARTICIPANT':
            return 'Seuls les inscrits et l’organisation écrivent sur ce fil.';
          case 'NOT_A_MEMBER':
            return 'Seuls les membres de l’équipe écrivent sur ce fil.';
          case 'TOURNAMENT_CANCELLED':
            return 'Ce tournoi est annulé : son fil est fermé.';
          case 'MESSAGE_TOO_LONG':
            return 'Ton message dépasse 2000 caractères.';
          default:
            return 'Impossible d’envoyer le message. Vérifie ta connexion.';
        }
      }
      await refresh();
      return null;
    },
    [tournamentId, teamId, refresh]
  );

  const remove = useCallback(
    async (messageId: string) => {
      if (!supabase) return;
      await supabase.rpc('delete_message', { p_message_id: messageId });
      await refresh();
    },
    [refresh]
  );

  const report = useCallback(async (messageId: string) => {
    if (!supabase) return;
    await supabase.rpc('report_message', { p_message_id: messageId, p_reason: null });
  }, []);

  return { messages, loading, failed, refresh, post, remove, report };
}
