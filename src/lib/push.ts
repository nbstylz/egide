import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/**
 * Enregistre l'appareil pour les notifications push et range le jeton en
 * base. À appeler au bon moment — après une inscription à un tournoi, pas au
 * premier lancement : la demande de permission doit avoir un contexte.
 *
 * Renvoie `granted`, `denied` (refus explicite, réactivable dans les
 * réglages du téléphone) ou `unavailable` (web, simulateur, pas de projet).
 */
export async function registerForPush(
  userId: string
): Promise<'granted' | 'denied' | 'unavailable'> {
  // Les push n'existent ni sur web ni sur simulateur.
  if (Platform.OS === 'web' || !Device.isDevice || !supabase) return 'unavailable';

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) return 'unavailable';

  // Android exige un canal avant toute notification.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Tournois',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== 'granted') {
    const asked = await Notifications.requestPermissionsAsync();
    status = asked.status;
  }
  if (status !== 'granted') return 'denied';

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await supabase.from('push_tokens').upsert(
      {
        profile_id: userId,
        token,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'token' }
    );
    return 'granted';
  } catch {
    // Jeton indisponible (Expo Go, réseau) : on réessaiera plus tard.
    return 'unavailable';
  }
}

/**
 * Demande le vidage de la file de notifications, sans attendre la réponse.
 * À appeler après toute action qui crée un événement à notifier (inscription,
 * désinscription…) : l'appareil de l'acteur déclenche la livraison immédiate.
 */
export function flushPushQueue() {
  supabase?.functions.invoke('send-push', { body: { flush: true } }).catch(() => {
    // Un échec ici n'est jamais bloquant : la file sera vidée au prochain appel.
  });
}

/** Comment une notification s'affiche quand l'app est ouverte. */
export function configureNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}
