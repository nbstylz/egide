import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import { useProfile } from '@/hooks/use-profile';
import { useSession } from '@/hooks/use-session';
import { supabase } from '@/lib/supabase';
import { teamErrorMessage } from '@/lib/teams';

const ErrorColor = { light: '#D14343', dark: '#FF6369' };

export default function CreerEquipeScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const errorColor = ErrorColor[scheme === 'dark' ? 'dark' : 'light'];
  const { session, loading: sessionLoading } = useSession();
  const { profile } = useProfile(session?.user.id);

  const [name, setName] = useState('');
  const [region, setRegion] = useState('');
  const [description, setDescription] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Une équipe se recrute d'abord près de chez soi : on part de la région du profil.
  useEffect(() => {
    if (profile?.region) {
      setRegion((current) => (current === '' ? profile.region! : current));
    }
  }, [profile]);

  async function handleSubmit() {
    if (!supabase || !session) return;
    if (name.trim().length < 3) {
      setNameError('Le nom doit contenir au moins 3 caractères.');
      return;
    }
    setNameError(null);
    setServerError(null);
    setBusy(true);
    const { error } = await supabase.rpc('create_team', {
      p_name: name.trim(),
      p_description: description.trim() || null,
      p_region: region.trim() || null,
    });
    setBusy(false);

    if (error) {
      const message = teamErrorMessage(error);
      // Le nom déjà pris se corrige dans le champ, pas dans un bandeau.
      if (message.includes('nom d’équipe')) setNameError(message);
      else setServerError(message);
      return;
    }
    router.back();
  }

  let content;
  if (sessionLoading) {
    content = <ActivityIndicator color={colors.tint} style={styles.centered} />;
  } else if (!session) {
    content = (
      <View style={styles.centered}>
        <ThemedText style={styles.centeredText}>Connecte-toi pour créer une équipe.</ThemedText>
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: colors.tint, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={() => router.replace('/profil')}>
          <ThemedText style={styles.primaryButtonText}>Se connecter</ThemedText>
        </Pressable>
      </View>
    );
  } else {
    content = (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.formContainer}
        keyboardShouldPersistTaps="handled">
        <View style={styles.field}>
          <ThemedText type="small">Nom de l’équipe</ThemedText>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.backgroundElement,
                color: colors.text,
                borderColor: nameError ? errorColor : colors.backgroundSelected,
              },
            ]}
            placeholder="Ex. Les Marteaux de Sigmar"
            placeholderTextColor={colors.textSecondary}
            value={name}
            onChangeText={(value) => {
              setName(value);
              setNameError(null);
            }}
            maxLength={40}
            editable={!busy}
            autoFocus
          />
          {nameError ? (
            <ThemedText type="small" style={{ color: errorColor }}>
              {nameError}
            </ThemedText>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              Visible dans l’annuaire. 3 à 40 caractères.
            </ThemedText>
          )}
        </View>

        <View style={styles.field}>
          <ThemedText type="small">Région (optionnel)</ThemedText>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.backgroundElement,
                color: colors.text,
                borderColor: colors.backgroundSelected,
              },
            ]}
            placeholder="Région (ex. Auvergne-Rhône-Alpes)"
            placeholderTextColor={colors.textSecondary}
            value={region}
            onChangeText={setRegion}
            editable={!busy}
          />
        </View>

        <View style={styles.field}>
          <ThemedText type="small">Présentation (optionnel)</ThemedText>
          <TextInput
            style={[
              styles.input,
              styles.textArea,
              {
                backgroundColor: colors.backgroundElement,
                color: colors.text,
                borderColor: colors.backgroundSelected,
              },
            ]}
            placeholder="Qui vous êtes, ce que vous cherchez…"
            placeholderTextColor={colors.textSecondary}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            maxLength={280}
            editable={!busy}
          />
        </View>

        <View style={[styles.notice, { backgroundColor: colors.backgroundElement }]}>
          <Ionicons name="shield-checkmark-outline" size={18} color={colors.tint} />
          <ThemedText type="small" style={styles.noticeText}>
            Tu deviens capitaine et reçois un code d’invitation à partager.
          </ThemedText>
        </View>

        {serverError ? (
          <View style={[styles.serverError, { backgroundColor: 'rgba(209,67,67,0.10)' }]}>
            <ThemedText type="small" style={{ color: errorColor }}>
              {serverError}
            </ThemedText>
          </View>
        ) : null}

        <Pressable
          disabled={busy}
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: colors.tint, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={handleSubmit}>
          {busy ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <ThemedText style={styles.primaryButtonText}>Créer l’équipe</ThemedText>
          )}
        </Pressable>
        <Pressable
          disabled={busy}
          style={({ pressed }) => [
            styles.secondaryButton,
            { backgroundColor: colors.backgroundElement, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={() => router.back()}>
          <ThemedText>Annuler</ThemedText>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
            accessibilityLabel="Retour">
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <ThemedText type="default" style={styles.headerTitle}>
            Créer une équipe
          </ThemedText>
        </View>
        {content}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -Spacing.two,
  },
  headerTitle: {
    fontWeight: '700',
    fontSize: 20,
  },
  scroll: {
    flex: 1,
  },
  formContainer: {
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  field: {
    gap: Spacing.one,
  },
  input: {
    borderRadius: Spacing.two,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  textArea: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Spacing.two,
    padding: Spacing.three,
  },
  noticeText: {
    flex: 1,
  },
  serverError: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
  },
  primaryButton: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  secondaryButton: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  centeredText: {
    textAlign: 'center',
  },
});
