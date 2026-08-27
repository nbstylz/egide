import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';

/**
 * Déclaration de la faction alignée à un tournoi (US-9.3).
 *
 * L'enregistrement est immédiat, sans bouton « Enregistrer » : un tap dans le
 * sélecteur et c'est fait. En contrepartie il faut savoir revenir en arrière —
 * d'où la valeur précédente conservée et le renvoi à `declared` en cas d'échec.
 *
 * Volontairement, aucun `refresh()` de la fiche après écriture : le hook de la
 * fiche remet `loading` à vrai, et l'écran remplace alors tout son corps par un
 * indicateur de chargement. Le joueur verrait la page entière clignoter à
 * chaque choix de faction. Même leçon que la saisie des scores au back office.
 */
export function useFactionDeclaration(
  tournamentId: string | undefined,
  registrationId: string | undefined,
  declared: string | null
) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Cible de la dernière tentative : « Réessayer » la rejoue telle quelle. */
  const attempted = useRef<string | null>(null);
  const clearSaved = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Changer d'inscription, c'est changer de tournoi : une valeur locale qui
  // survivrait afficherait la faction d'un autre événement.
  useEffect(() => {
    setChosen(null);
    setSaved(false);
    setError(null);
  }, [registrationId]);

  useEffect(() => () => {
    if (clearSaved.current) clearTimeout(clearSaved.current);
  }, []);

  const save = useCallback(
    async (faction: string) => {
      if (!supabase || !tournamentId) return;
      // La cible est passée explicitement, jamais relue de l'état : les
      // fermetures vieillissent (piège n° 3 du dépôt).
      attempted.current = faction;
      setSaving(true);
      setError(null);
      setSaved(false);
      const { error: dbError } = await supabase.rpc('set_registration_faction', {
        p_tournament_id: tournamentId,
        p_faction: faction,
      });
      setSaving(false);
      if (dbError) {
        setError('Impossible d’enregistrer ta faction. Vérifie ta connexion et réessaie.');
        return;
      }
      setChosen(faction);
      setSaved(true);
      if (clearSaved.current) clearTimeout(clearSaved.current);
      clearSaved.current = setTimeout(() => setSaved(false), 3000);
    },
    [tournamentId]
  );

  const retry = useCallback(() => {
    if (attempted.current) save(attempted.current);
  }, [save]);

  return {
    /** Ce que le joueur doit voir : son dernier choix accepté, sinon la base. */
    faction: chosen ?? declared,
    saving,
    saved,
    error,
    save,
    retry,
  };
}
