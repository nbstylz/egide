import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  useColorScheme,
} from 'react-native';

import { FactionPicker } from '@/components/faction-picker';
import { RegionPicker } from '@/components/region-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, OnTint, Spacing } from '@/constants/theme';
import type { Profile } from '@/hooks/use-profile';
import { matchFaction } from '@/lib/factions';
import { matchRegion } from '@/lib/regions';
import { supabase } from '@/lib/supabase';

/** Traduit les erreurs Postgres les plus courantes en français. */
function translateProfileError(message: string): string {
  if (message.includes('profiles_pseudo_key')) {
    return 'Ce pseudo est déjà pris, choisis-en un autre.';
  }
  if (message.includes('pseudo_check')) {
    return 'Le pseudo doit contenir entre 3 et 24 caractères.';
  }
  return message;
}

type Props = {
  /** Identifiant du compte connecté (auth.users.id). */
  userId: string;
  /** Profil existant à modifier, ou null pour une première création. */
  initialProfile: Profile | null;
  /** Appelé quand l'enregistrement a réussi. */
  onSaved: () => void;
  /** Appelé quand l'utilisateur annule la modification (absent en création). */
  onCancel?: () => void;
  /** Libellé du bouton principal, si le contexte demande autre chose. */
  submitLabel?: string;
};

/** Formulaire de création / modification du profil joueur. */
export function ProfileForm({
  userId,
  initialProfile,
  onSaved,
  onCancel,
  submitLabel,
}: Props) {
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const colors = Colors[mode];

  const [pseudo, setPseudo] = useState(initialProfile?.pseudo ?? '');
  // Un profil ancien a pu saisir sa région librement : on la ramène à la
  // liste officielle plutôt que d'afficher un champ vide.
  const [region, setRegion] = useState(matchRegion(initialProfile?.region) ?? '');
  const [regionError, setRegionError] = useState<string | null>(null);
  // Une ancienne saisie libre est ramenée vers l'entrée officielle ; si elle
  // ne correspond à rien, le champ repart vide plutôt que d'afficher une
  // valeur que le sélecteur ne saurait pas resélectionner.
  const [faction, setFaction] = useState(matchFaction(initialProfile?.faction_favorite) ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!supabase) return;
    const trimmedPseudo = pseudo.trim();
    if (trimmedPseudo.length < 3 || trimmedPseudo.length > 24) {
      setError('Le pseudo doit contenir entre 3 et 24 caractères.');
      return;
    }
    if (region.trim() === '') {
      setRegionError('Choisis ta région : elle sert à te proposer les tournois près de chez toi.');
      return;
    }

    setBusy(true);
    setError(null);
    setRegionError(null);
    // upsert : insère le profil s'il n'existe pas, le met à jour sinon.
    const { error: dbError } = await supabase.from('profiles').upsert({
      id: userId,
      pseudo: trimmedPseudo,
      region: region.trim(),
      faction_favorite: faction.trim() || null,
      updated_at: new Date().toISOString(),
    });
    setBusy(false);

    if (dbError) {
      setError(translateProfileError(dbError.message));
    } else {
      onSaved();
    }
  }

  const inputStyle = [
    styles.input,
    {
      backgroundColor: colors.backgroundElement,
      color: colors.text,
      borderColor: colors.backgroundSelected,
    },
  ];

  return (
    <ThemedView style={styles.form}>
      <TextInput
        style={inputStyle}
        placeholder="Pseudo (3 à 24 caractères)"
        placeholderTextColor={colors.textSecondary}
        value={pseudo}
        onChangeText={setPseudo}
        autoCapitalize="none"
        maxLength={24}
        editable={!busy}
      />
      <RegionPicker
        value={region}
        onChange={(value) => {
          setRegion(value);
          setError(null);
        }}
        error={regionError}
        disabled={busy}
      />
      {/* Même liste fermée que sur la soumission de liste d'armée : deux
          saisies libres pour la même notion, c'était deux vocabulaires. */}
      <FactionPicker
        label="Faction favorite (optionnel)"
        value={faction}
        onChange={setFaction}
        disabled={busy}
      />

      {error && (
        <ThemedText type="small" style={[styles.feedback, { color: '#D14343' }]}>
          {error}
        </ThemedText>
      )}

      {busy ? (
        <ActivityIndicator color={colors.tint} />
      ) : (
        <>
          <Pressable
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.tint, opacity: pressed ? 0.8 : 1 },
            ]}
            onPress={handleSave}>
            <ThemedText style={[styles.buttonPrimaryText, { color: OnTint[mode] }]}>
              {submitLabel ?? (initialProfile ? 'Enregistrer' : 'Créer mon profil')}
            </ThemedText>
          </Pressable>
          {onCancel && (
            <Pressable
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: colors.backgroundElement, opacity: pressed ? 0.8 : 1 },
              ]}
              onPress={onCancel}>
              <ThemedText>Annuler</ThemedText>
            </Pressable>
          )}
        </>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  form: {
    alignSelf: 'stretch',
    gap: Spacing.three,
  },
  input: {
    borderRadius: Spacing.two,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  feedback: {
    textAlign: 'center',
  },
  button: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  buttonPrimaryText: {
    fontWeight: '600',
  },
});
