import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

/** Une ligne de la table `profiles` dans Supabase. */
export type Profile = {
  id: string;
  pseudo: string;
  region: string | null;
  faction_favorite: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Charge le profil du joueur connecté depuis Supabase.
 * `profile` vaut null tant que le joueur n'a pas encore créé son profil.
 * `refresh` permet de recharger après une création/modification.
 */
export function useProfile(userId: string | undefined) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!supabase || !userId) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    // maybeSingle : renvoie la ligne si elle existe, sinon null (pas d'erreur).
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle<Profile>();
    setProfile(data ?? null);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { profile, loading, refresh };
}
