import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
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
import {
  Colors,
  Fonts,
  GreenBackground,
  GreenColor,
  MaxContentWidth,
  OnTint,
  RedBackground,
  RedColor,
  Spacing,
} from '@/constants/theme';
import { useArmyList } from '@/hooks/use-army-list';
import { useProfile } from '@/hooks/use-profile';
import { useSession } from '@/hooks/use-session';
import { useTournamentDetail } from '@/hooks/use-tournament-detail';
import { supabase } from '@/lib/supabase';

/** « 12 juillet à 18:04 ». */
function longDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ListeArmeeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  /** Retour vers la fiche même quand l'écran a été ouvert par lien direct. */
  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/evenements/[id]', params: { id: id ?? '' } });
  };
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const colors = Colors[mode];

  const { session, loading: sessionLoading } = useSession();
  const { profile, loading: profileLoading } = useProfile(session?.user.id);
  const { tournament, loading: tournamentLoading, myRegistration } = useTournamentDetail(
    id,
    session?.user.id
  );
  const { list, loading: listLoading, refresh } = useArmyList(myRegistration?.id);

  const [faction, setFaction] = useState('');
  const [content, setContent] = useState('');
  const [seeded, setSeeded] = useState(false);
  const [factionError, setFactionError] = useState(false);
  const [serverError, setServerError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmingExit, setConfirmingExit] = useState(false);

  // Préremplissage une seule fois : liste existante d'abord, sinon la
  // faction favorite du profil. Jamais pendant la saisie — et pas avant que
  // le profil soit chargé, sinon la faction resterait vide.
  useEffect(() => {
    // `listLoading` retombe à faux tant que l'inscription n'est pas connue :
    // il faut donc aussi attendre la session et la fiche du tournoi.
    if (seeded || sessionLoading || tournamentLoading || listLoading || profileLoading) return;
    if (list) {
      setContent(list.content);
      setFaction(list.faction ?? profile?.faction_favorite ?? '');
    } else {
      setFaction(profile?.faction_favorite ?? '');
    }
    setSeeded(true);
  }, [seeded, sessionLoading, tournamentLoading, listLoading, profileLoading, list, profile?.faction_favorite]);

  const submissionsOpen = tournament?.status === 'open';
  const readOnly = !submissionsOpen || list?.status === 'approved';
  const dirty = seeded && (content !== (list?.content ?? '') || faction !== (list?.faction ?? (profile?.faction_favorite ?? '')));

  function goBack() {
    if (!dirty || readOnly) {
      leave();
      return;
    }
    if (Platform.OS === 'web') {
      if (confirmingExit) {
        leave();
      } else {
        setConfirmingExit(true);
        setTimeout(() => setConfirmingExit(false), 5000);
      }
      return;
    }
    Alert.alert('Quitter sans enregistrer ?', 'Les modifications de ta liste seront perdues.', [
      { text: 'Continuer la saisie', style: 'cancel' },
      { text: 'Quitter', style: 'destructive', onPress: () => leave() },
    ]);
  }

  async function handleSubmit() {
    if (!supabase || !id) return;
    if (faction.trim() === '') {
      setFactionError(true);
      return;
    }
    setFactionError(false);
    setServerError(false);
    setBusy(true);
    const { error } = await supabase.rpc('submit_army_list', {
      p_tournament_id: id,
      p_content: content,
      p_faction: faction.trim(),
    });
    setBusy(false);
    if (error) {
      // Quoi qu'il arrive, le texte saisi reste dans le champ.
      setServerError(true);
      return;
    }
    await refresh();
    leave();
  }

  const loading = sessionLoading || tournamentLoading || listLoading || !seeded;

  let submitLabel = 'Soumettre ma liste';
  if (list?.status === 'rejected') submitLabel = 'Soumettre la liste corrigée';
  else if (list) submitLabel = 'Enregistrer les modifications';

  let content_;
  if (loading) {
    content_ = (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.tint} />
      </View>
    );
  } else if (!session || !myRegistration) {
    content_ = (
      <View style={styles.centered}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
          La liste d’armée est réservée aux personnes inscrites au tournoi.
        </ThemedText>
        <Pressable
          style={({ pressed }) => [
            styles.secondaryButton,
            { backgroundColor: colors.backgroundElement, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={() => router.back()}>
          <ThemedText>Retour à l’événement</ThemedText>
        </Pressable>
      </View>
    );
  } else if (readOnly) {
    content_ = (
      <ScrollView contentContainerStyle={styles.readOnlyContent}>
        {list?.status === 'approved' && list.reviewed_at ? (
          <View style={[styles.banner, { backgroundColor: GreenBackground[mode] }]}>
            <ThemedText type="small" style={{ color: GreenColor[mode] }}>
              Liste validée le {longDate(list.reviewed_at)}.
            </ThemedText>
          </View>
        ) : null}
        {list ? (
          <>
            {list.faction ? (
              <ThemedText type="small" themeColor="textSecondary">
                Faction : {list.faction}
              </ThemedText>
            ) : null}
            <View style={[styles.readOnlyBox, { backgroundColor: colors.backgroundElement }]}>
              <ThemedText selectable style={[styles.mono, { color: colors.text }]}>
                {list.content}
              </ThemedText>
            </View>
          </>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            Aucune liste n’a été soumise. La soumission est close.
          </ThemedText>
        )}
      </ScrollView>
    );
  } else {
    content_ = (
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.formContent}
          keyboardShouldPersistTaps="handled">
          {list?.status === 'rejected' ? (
            <View style={[styles.rejectBox, { backgroundColor: RedBackground[mode] }]}>
              <ThemedText type="smallBold" style={{ color: RedColor[mode] }}>
                Motif du refus
              </ThemedText>
              <ThemedText type="small">
                {list.organizer_comment ?? 'Aucun motif transmis.'}
              </ThemedText>
            </View>
          ) : null}

          <View style={styles.field}>
            <ThemedText type="small" themeColor="textSecondary">
              Faction
            </ThemedText>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.backgroundElement,
                  color: colors.text,
                  borderColor: factionError ? RedColor[mode] : 'transparent',
                },
              ]}
              value={faction}
              onChangeText={(value) => {
                setFaction(value);
                setFactionError(false);
              }}
              placeholder="Ex. Stormcast Eternals"
              placeholderTextColor={colors.textSecondary}
              editable={!busy}
              maxLength={60}
            />
            {factionError ? (
              <ThemedText style={[styles.fieldError, { color: RedColor[mode] }]}>
                Indique ta faction.
              </ThemedText>
            ) : null}
          </View>

          <View style={styles.field}>
            <View style={styles.labelRow}>
              <ThemedText type="small" themeColor="textSecondary">
                Liste d’armée
              </ThemedText>
              {content.length > 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {content.length.toLocaleString('fr-FR')} caractères
                </ThemedText>
              ) : null}
            </View>
            <TextInput
              style={[
                styles.input,
                styles.listInput,
                { backgroundColor: colors.backgroundElement, color: colors.text },
              ]}
              value={content}
              onChangeText={setContent}
              placeholder="Colle ici la liste exportée depuis ton application (texte brut)."
              placeholderTextColor={colors.textSecondary}
              multiline
              // Les exports d'apps de listes ne doivent pas être « corrigés ».
              autoCorrect={false}
              autoCapitalize="none"
              editable={!busy}
              maxLength={20000}
            />
          </View>
        </ScrollView>

        <View style={[styles.actionBar, { borderTopColor: colors.backgroundSelected }]}>
          {serverError ? (
            <View style={[styles.banner, { backgroundColor: RedBackground[mode] }]}>
              <ThemedText type="small" style={{ color: RedColor[mode] }}>
                Impossible d’envoyer ta liste. Vérifie ta connexion et réessaie. Ton texte est
                conservé.
              </ThemedText>
            </View>
          ) : null}
          <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
            Modifiable jusqu’à validation par l’organisation ou lancement du tournoi.
          </ThemedText>
          <Pressable
            disabled={busy || content.trim() === ''}
            onPress={handleSubmit}
            style={({ pressed }) => [
              styles.primaryButton,
              {
                backgroundColor: colors.tint,
                opacity: pressed || content.trim() === '' ? 0.8 : 1,
              },
            ]}>
            {busy ? (
              <ActivityIndicator color={OnTint[mode]} />
            ) : (
              <ThemedText type="smallBold" style={{ color: OnTint[mode] }}>
                {submitLabel}
              </ThemedText>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.headerRow}>
          <Pressable onPress={goBack} style={styles.backButton} accessibilityLabel="Retour">
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <View style={styles.headerTexts}>
            <ThemedText type="default" style={styles.headerTitle}>
              Ma liste d’armée
            </ThemedText>
            {tournament ? (
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {tournament.name} · {tournament.points_limit} points
              </ThemedText>
            ) : null}
          </View>
        </View>
        {confirmingExit ? (
          <View style={[styles.banner, { backgroundColor: RedBackground[mode] }]}>
            <ThemedText type="small" style={{ color: RedColor[mode] }}>
              Modifications non enregistrées. Appuie à nouveau sur Retour pour quitter.
            </ThemedText>
          </View>
        ) : null}
        {content_}
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
  flex: {
    flex: 1,
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
  headerTexts: {
    flex: 1,
  },
  headerTitle: {
    fontWeight: '700',
    fontSize: 20,
  },
  formContent: {
    gap: Spacing.three,
    paddingBottom: Spacing.three,
  },
  field: {
    gap: Spacing.one,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  input: {
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
    minHeight: 48,
  },
  listInput: {
    minHeight: 320,
    textAlignVertical: 'top',
    fontFamily: Fonts.mono,
    fontSize: 13,
    lineHeight: 19,
  },
  fieldError: {
    fontSize: 13,
    lineHeight: 18,
  },
  rejectBox: {
    borderRadius: Spacing.two,
    padding: Spacing.two,
    gap: Spacing.half,
  },
  actionBar: {
    borderTopWidth: 1,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    gap: Spacing.two,
  },
  note: {
    textAlign: 'center',
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  readOnlyContent: {
    gap: Spacing.two,
    paddingBottom: Spacing.six,
  },
  readOnlyBox: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
  },
  mono: {
    fontFamily: Fonts.mono,
    fontSize: 13,
    lineHeight: 19,
  },
  banner: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
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
