import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  useColorScheme,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';
import type { Profile } from '@/hooks/use-profile';
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
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [pseudo, setPseudo] = useState(initialProfile?.pseudo ?? '');
  const [region, setRegion] = useState(initialProfile?.region ?? '');
  const [faction, setFaction] = useState(initialProfile?.faction_favorite ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!supabase) return;
    const trimmedPseudo = pseudo.trim();
    if (trimmedPseudo.length < 3 || trimmedPseudo.length > 24) {
      setError('Le pseudo doit contenir entre 3 et 24 caractères.');
      return;
    }

    setBusy(true);
    setError(null);
    // upsert : insère le profil s'il n'existe pas, le met à jour sinon.
    const { error: dbError } = await supabase.from('profiles').upsert({
      id: userId,
      pseudo: trimmedPseudo,
      region: region.trim() || null,
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
      <TextInput
        style={inputStyle}
        placeholder="Région (optionnel, ex. Île-de-France)"
        placeholderTextColor={colors.textSecondary}
        value={region}
        onChangeText={setRegion}
        editable={!busy}
      />
      <TextInput
        style={inputStyle}
        placeholder="Faction favorite (optionnel, ex. Stormcast Eternals)"
        placeholderTextColor={colors.textSecondary}
        value={faction}
        onChangeText={setFaction}
        editable={!busy}
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
            <ThemedText style={styles.buttonPrimaryText}>
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
    color: '#ffffff',
    fontWeight: '600',
  },
});
