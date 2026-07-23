import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MetaRow } from '@/components/meta-row';
import { StatusBadge } from '@/components/status-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import { useProfile } from '@/hooks/use-profile';
import { useSession } from '@/hooks/use-session';
import { useTournamentDetail } from '@/hooks/use-tournament-detail';
import { supabase } from '@/lib/supabase';
import { formatEventDate, TypeLabels } from '@/lib/tournaments';

const GreenColor = { light: '#1E7C45', dark: '#63D489' };
const RedColor = { light: '#C13438', dark: '#FF6369' };
const RedBackground = { light: 'rgba(209,67,67,0.10)', dark: 'rgba(255,99,105,0.14)' };


export default function EvenementDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const colors = Colors[mode];

  const { session, loading: sessionLoading } = useSession();
  const { profile } = useProfile(session?.user.id);
  const { tournament, loading, refresh, registeredCount, myRegistration, isOrganizer, isFull } =
    useTournamentDetail(id, session?.user.id);

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // Garde-fou de désinscription : sur web, le bouton demande une seconde
  // pression (« Confirmer ») pendant 5 s ; sur mobile, une alerte native.
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);

  function askWithdraw() {
    if (Platform.OS === 'web') {
      if (confirmingWithdraw) {
        setConfirmingWithdraw(false);
        handleWithdraw();
      } else {
        setConfirmingWithdraw(true);
        setTimeout(() => setConfirmingWithdraw(false), 5000);
      }
    } else {
      Alert.alert('Se désinscrire ?', 'Ta place sera libérée pour un autre joueur.', [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Se désinscrire', style: 'destructive', onPress: () => handleWithdraw() },
      ]);
    }
  }

  const isRegistered = myRegistration?.status === 'registered' || myRegistration?.status === 'checked_in';

  async function handleRegister() {
    if (!supabase || !session) return;
    setBusy(true);
    setActionError(null);
    // upsert : réactive une éventuelle inscription « désinscrit ».
    const { error } = await supabase
      .from('registrations')
      .upsert(
        { tournament_id: id, player_id: session.user.id, status: 'registered' },
        { onConflict: 'tournament_id,player_id' }
      );
    if (error) {
      setActionError('Impossible de finaliser l’inscription. Vérifie ta connexion et réessaie.');
    }
    await refresh();
    setBusy(false);
  }

  async function handleWithdraw() {
    if (!supabase || !myRegistration) return;
    setBusy(true);
    setActionError(null);
    const { error } = await supabase
      .from('registrations')
      .update({ status: 'withdrawn', updated_at: new Date().toISOString() })
      .eq('id', myRegistration.id);
    if (error) {
      setActionError('Impossible de te désinscrire. Vérifie ta connexion et réessaie.');
    }
    await refresh();
    setBusy(false);
  }

  /** Barre d'action du bas : contenu selon l'état du visiteur et du tournoi. */
  function renderCtaBar() {
    if (!tournament || tournament.status === 'cancelled') return null;

    const primaryStyle = ({ pressed }: { pressed: boolean }) => [
      styles.button,
      { backgroundColor: colors.tint, opacity: pressed ? 0.8 : 1 },
    ];
    const secondaryStyle = ({ pressed }: { pressed: boolean }) => [
      styles.button,
      { backgroundColor: colors.backgroundElement, opacity: pressed ? 0.8 : 1 },
    ];

    let message = null;
    let button = null;

    if (tournament.status !== 'open') {
      // Tournoi en cours ou terminé : inscriptions closes.
      message = isRegistered ? (
        <View style={styles.confirmRow}>
          <Ionicons name="checkmark-circle" size={18} color={GreenColor[mode]} />
          <ThemedText type="smallBold" style={{ color: GreenColor[mode] }}>
            Inscrit à ce tournoi
          </ThemedText>
        </View>
      ) : (
        <ThemedText type="small" themeColor="textSecondary" style={styles.ctaMessage}>
          Les inscriptions sont closes.
        </ThemedText>
      );
    } else if (isOrganizer) {
      message = (
        <View style={styles.confirmRow}>
          <Ionicons name="ribbon-outline" size={16} color={colors.tint} />
          <ThemedText type="smallBold">Tu organises ce tournoi</ThemedText>
        </View>
      );
      button = (
        <View style={[styles.button, { backgroundColor: colors.backgroundElement, opacity: 0.6 }]}>
          <View style={styles.confirmRow}>
            <ThemedText themeColor="textSecondary">Gérer le tournoi</ThemedText>
            <View style={[styles.soonBadge, { backgroundColor: colors.backgroundSelected }]}>
              <ThemedText themeColor="textSecondary" style={styles.soonBadgeText}>
                Bientôt
              </ThemedText>
            </View>
          </View>
        </View>
      );
    } else if (!session) {
      button = (
        <Pressable style={primaryStyle} onPress={() => router.push('/profil')}>
          <ThemedText style={styles.buttonPrimaryText}>Se connecter pour s’inscrire</ThemedText>
        </Pressable>
      );
    } else if (!profile) {
      message = (
        <ThemedText type="small" themeColor="textSecondary" style={styles.ctaMessage}>
          Un pseudo est requis pour s’inscrire.
        </ThemedText>
      );
      button = (
        <Pressable style={primaryStyle} onPress={() => router.push('/profil')}>
          <ThemedText style={styles.buttonPrimaryText}>Créer mon profil</ThemedText>
        </Pressable>
      );
    } else if (isRegistered) {
      message = (
        <View style={styles.confirmRow}>
          <Ionicons name="checkmark-circle" size={18} color={GreenColor[mode]} />
          <ThemedText type="smallBold" style={{ color: GreenColor[mode] }}>
            Inscrit à ce tournoi
          </ThemedText>
        </View>
      );
      button = (
        <Pressable style={secondaryStyle} disabled={busy} onPress={askWithdraw}>
          {busy ? (
            <ActivityIndicator color={colors.tint} />
          ) : (
            <ThemedText style={{ color: RedColor[mode] }}>
              {confirmingWithdraw ? 'Confirmer la désinscription' : 'Se désinscrire'}
            </ThemedText>
          )}
        </Pressable>
      );
    } else if (isFull) {
      message = (
        <ThemedText type="small" themeColor="textSecondary" style={styles.ctaMessage}>
          Liste d’attente bientôt disponible.
        </ThemedText>
      );
      button = (
        <View style={[styles.button, { backgroundColor: colors.backgroundElement, opacity: 0.6 }]}>
          <ThemedText themeColor="textSecondary">Complet</ThemedText>
        </View>
      );
    } else {
      button = (
        <Pressable style={primaryStyle} disabled={busy} onPress={handleRegister}>
          {busy ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <ThemedText style={styles.buttonPrimaryText}>S’inscrire</ThemedText>
          )}
        </Pressable>
      );
    }

    return (
      <View
        style={[
          styles.ctaBar,
          { backgroundColor: colors.background, borderTopColor: colors.backgroundSelected },
        ]}>
        {actionError ? (
          <View style={[styles.errorBanner, { backgroundColor: RedBackground[mode] }]}>
            <ThemedText type="small" style={{ color: RedColor[mode] }}>
              {actionError}
            </ThemedText>
          </View>
        ) : null}
        {message}
        {button}
      </View>
    );
  }

  let body;
  if (loading || sessionLoading) {
    body = (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.tint} />
      </View>
    );
  } else if (!tournament) {
    body = (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.textSecondary} />
        <ThemedText type="default" style={styles.notFoundTitle}>
          Événement introuvable
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
          Il a peut-être été supprimé par son organisateur.
        </ThemedText>
        <Pressable
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.backgroundElement, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={() => router.back()}>
          <ThemedText>Retour aux événements</ThemedText>
        </Pressable>
      </View>
    );
  } else {
    const remaining = tournament.capacity - registeredCount;
    const fillPercent = Math.min(100, Math.round((registeredCount / tournament.capacity) * 100));

    body = (
      <>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {/* Héros */}
          <View style={styles.hero}>
            <View style={styles.badgeRow}>
              <StatusBadge status={tournament.status} />
              <View style={[styles.typeBadge, { backgroundColor: colors.backgroundSelected }]}>
                <ThemedText themeColor="textSecondary" style={styles.typeBadgeText}>
                  {TypeLabels[tournament.type]}
                </ThemedText>
              </View>
            </View>
            <ThemedText style={styles.heroTitle}>{tournament.name}</ThemedText>
            <ThemedText type="default" style={styles.heroDate}>
              {formatEventDate(tournament.event_date)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {tournament.city}
              {tournament.region ? ` · ${tournament.region}` : ''}
            </ThemedText>
          </View>

          {tournament.status === 'cancelled' ? (
            <View style={[styles.errorBanner, { backgroundColor: RedBackground[mode] }]}>
              <ThemedText type="small" style={{ color: RedColor[mode] }}>
                Cet événement a été annulé par l’organisateur.
              </ThemedText>
            </View>
          ) : null}

          {/* Carte Format */}
          <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
            <MetaRow icon="location-outline">
              <ThemedText type="small">
                <ThemedText type="smallBold">{tournament.city}</ThemedText>
                {tournament.region ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    , {tournament.region}
                  </ThemedText>
                ) : null}
              </ThemedText>
            </MetaRow>
            <MetaRow icon="flag-outline">
              <ThemedText type="small">
                {tournament.points_limit} points · {tournament.rounds_count} rondes
              </ThemedText>
            </MetaRow>
            <MetaRow icon="person-outline">
              <ThemedText type="small" themeColor="textSecondary">
                Organisé par{' '}
                <ThemedText type="smallBold" themeColor="text">
                  {tournament.organizer?.pseudo ?? 'inconnu'}
                </ThemedText>
              </ThemedText>
            </MetaRow>
          </View>

          {/* Carte Participants */}
          <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
            <View style={styles.participantsHeader}>
              <ThemedText type="small" themeColor="textSecondary">
                Inscrits
              </ThemedText>
              <ThemedText type="smallBold">
                {registeredCount} / {tournament.capacity}
              </ThemedText>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: colors.backgroundSelected }]}>
              <View
                style={[
                  styles.progressFill,
                  { backgroundColor: colors.tint, width: `${fillPercent}%` },
                ]}
              />
            </View>
            {remaining > 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                {remaining} {remaining > 1 ? 'places restantes' : 'place restante'}
              </ThemedText>
            ) : (
              <ThemedText type="small">
                <ThemedText type="smallBold">Complet</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {'  '}Liste d’attente bientôt disponible.
                </ThemedText>
              </ThemedText>
            )}
          </View>
        </ScrollView>
        {renderCtaBar()}
      </>
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
            Événement
          </ThemedText>
        </View>
        {body}
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
  scrollContent: {
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  hero: {
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
  },
  heroTitle: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '600',
  },
  heroDate: {
    fontWeight: '700',
  },
  typeBadge: {
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  typeBadgeText: {
    fontSize: 12,
    lineHeight: 16,
  },
  card: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  participantsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  ctaBar: {
    borderTopWidth: 1,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    gap: Spacing.two,
  },
  ctaMessage: {
    textAlign: 'center',
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
  },
  soonBadge: {
    borderRadius: 999,
    paddingHorizontal: Spacing.one,
    paddingVertical: 1,
  },
  soonBadgeText: {
    fontSize: 10,
    lineHeight: 14,
  },
  button: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    alignSelf: 'stretch',
  },
  buttonPrimaryText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  errorBanner: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  centeredText: {
    textAlign: 'center',
  },
  notFoundTitle: {
    fontWeight: '700',
  },
});
