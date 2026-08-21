import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useSyncExternalStore } from 'react';

const StorageKey = 'egide.entree-vue';

/**
 * État partagé, hors React : le drapeau invité est lu par l'écran d'accueil
 * ET par la garde du layout racine. Deux `useState` séparés ne se verraient
 * pas — le choix « continuer sans compte » resterait sans effet sur la garde.
 */
let isGuest = false;
let loading = true;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Une seule lecture du stockage au démarrage de l'app. */
const restored = AsyncStorage.getItem(StorageKey)
  .then((value) => {
    isGuest = value === '1';
  })
  .catch(() => {
    isGuest = false;
  })
  .finally(() => {
    loading = false;
    emit();
  });

/**
 * Mémorise qu'un visiteur a choisi « Continuer sans compte ». Sans ce
 * drapeau, l'écran d'accueil reviendrait à chaque lancement : on ne
 * harcèle pas quelqu'un qui a déjà dit non.
 */
export function useGuest() {
  const state = useSyncExternalStore(
    subscribe,
    () => (loading ? 'loading' : isGuest ? 'guest' : 'none'),
    () => 'loading'
  );

  const continueAsGuest = useCallback(async () => {
    isGuest = true;
    emit();
    await AsyncStorage.setItem(StorageKey, '1').catch(() => {});
  }, []);

  /** Après une déconnexion volontaire, l'écran d'accueil doit revenir. */
  const forgetGuest = useCallback(async () => {
    isGuest = false;
    emit();
    await AsyncStorage.removeItem(StorageKey).catch(() => {});
  }, []);

  return {
    isGuest: state === 'guest',
    loading: state === 'loading',
    continueAsGuest,
    forgetGuest,
  };
}

/** Exposé pour les tests : promesse résolue quand le stockage est lu. */
export const guestRestored = restored;
