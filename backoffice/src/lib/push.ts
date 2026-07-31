import { supabase } from './supabase';

/**
 * Demande le vidage de la file de notifications, sans attendre la réponse.
 * À appeler après toute action qui crée un événement à notifier : génération
 * de ronde, relecture de liste, retrait d'inscription (promotion possible).
 */
export function flushPushQueue() {
  supabase?.functions.invoke('send-push', { body: { flush: true } }).catch(() => {
    // Jamais bloquant : la file sera vidée au prochain appel.
  });
}
