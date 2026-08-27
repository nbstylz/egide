import { useEffect, useMemo, useState } from 'react';

import { supabase } from '../lib/supabase';

export type FactionRef = { name: string; alliance: string; position: number };

/**
 * Ordre d'affichage des Grandes Alliances, et leurs libellés français.
 * L'ordre ne peut pas venir de la base : `alliance` y est un texte, et le tri
 * alphabétique donnerait Chaos, Death, Destruction, Order — ce qui ne veut rien
 * dire pour un joueur.
 */
const Alliances: { key: string; label: string }[] = [
  { key: 'Order', label: 'Ordre' },
  { key: 'Chaos', label: 'Chaos' },
  { key: 'Death', label: 'Mort' },
  { key: 'Destruction', label: 'Destruction' },
];

/**
 * Le référentiel des factions, lu en base (migration 0038).
 *
 * Le back office n'a pas de copie de `src/lib/factions.ts` — c'est justement
 * pour lui que la liste est descendue dans Postgres. Une seule source, deux
 * applications : une faction ajoutée par migration apparaît des deux côtés
 * sans qu'on y pense.
 */
export function useFactions() {
  const [factions, setFactions] = useState<FactionRef[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!supabase) {
        setLoading(false);
        return;
      }
      const { data } = await supabase.from('factions').select('name, alliance, position');
      if (!alive) return;
      setFactions((data as FactionRef[]) ?? []);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const groups = useMemo(
    () =>
      Alliances.map((alliance) => ({
        label: alliance.label,
        factions: factions
          .filter((faction) => faction.alliance === alliance.key)
          .sort((a, b) => a.position - b.position),
      })).filter((group) => group.factions.length > 0),
    [factions]
  );

  return { factions, groups, loading };
}
