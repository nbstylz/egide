import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { PlayerRow } from '@/components/player-row';
import { StatusBadge } from '@/components/status-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import { useProfile } from '@/hooks/use-profile';
import { useSession } from '@/hooks/use-session';
import { useTournamentDetail, visibleSlice } from '@/hooks/use-tournament-detail';
import { ordinalFr } from '@/lib/ordinal';
import { supabase } from '@/lib/supabase';
import { formatEventDate, TypeLabels } from '@/lib/tournaments';

const GreenColor = { light: '#1E7C45', dark: '#63D489' };
const GreenBackground = { light: 'rgba(30,124,69,0.10)', dark: 'rgba(99,212,137,0.14)' };
const RedColor = { light: '#C13438', dark: '#FF6369' };
const RedBackground = { light: 'rgba(209,67,67,0.10)', dark: 'rgba(255,99,105,0.14)' };
const TintBackground = { light: 'rgba(156,122,31,0.10)', dark: 'rgba(212,175,55,0.14)' };

/** Nombre de lignes affichées directement sur la fiche avant « Voir tous ». */
const InlineRegisteredLimit = 10;
const InlineWaitlistLimit = 5;

export default function EvenementDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const colors = Colors[mode];

  const { session, loading: sessionLoading } = useSession();
  const { profile } = useProfile(session?.user.id);
  const {
    tournament,
    loading,
    refresh,
    registered,
    waitlisted,
    registeredCount,
    myRegistration,
    myWaitlistPosition,
    isOrganizer,
    isFull,
  } = useTournamentDetail(id, session?.user.id);

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // Garde-fou de sortie : sur web, le bouton demande une seconde pression
  // pendant 5 s ; sur mobile, une alerte native.
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);
  // Bandeau « tu viens d'être promu », masqué une fois acquitté.
  const [promotionSeen, setPromotionSeen] = useState(true);

  const isCheckedIn = myRegistration?.status === 'checked_in';
  const isRegistered = myRegistration?.status === 'registered' || isCheckedIn;
  const isWaitlisted = myRegistration?.status === 'waitlisted';
  const promotionKey = myRegistration ? `egide.promo.${myRegistration.id}` : null;

  // Une promotion n'est annoncée qu'une fois : on retient l'acquittement
  // sur l'appareil (pas de notification push en v1).
  useEffect(() => {
    if (!promotionKey || !myRegistration?.promoted_at) {
      setPromotionSeen(true);
      return;
    }
    AsyncStorage.getItem(promotionKey).then((seenAt) => {
      setPromotionSeen(seenAt === myRegistration.promoted_at);
    });
  }, [promotionKey, myRegistration?.promoted_at]);

  async function acknowledgePromotion() {
    if (promotionKey && myRegistration?.promoted_at) {
      await AsyncStorage.setItem(promotionKey, myRegistration.promoted_at);
    }
    setPromotionSeen(true);
  }

  function askWithdraw() {
    const title = isWaitlisted ? 'Quitter la liste d’attente ?' : 'Se désinscrire ?';
    let message;
    if (isWaitlisted) {
      message = `Tu perdras ta position (${ordinalFr(myWaitlistPosition ?? 1)}). Si tu reviens, tu repartiras en fin de liste.`;
    } else if (waitlisted.length > 0) {
      message = 'Ta place sera attribuée au 1er joueur de la liste d’attente.';
    } else {
      message = 'Ta place sera libérée pour un autre joueur.';
    }

    if (Platform.OS === 'web') {
      if (confirmingWithdraw) {
        setConfirmingWithdraw(false);
        handleWithdraw();
      } else {
        setConfirmingWithdraw(true);
        setTimeout(() => setConfirmingWithdraw(false), 5000);
      }
    } else {
      Alert.alert(title, message, [
        { text: 'Annuler', style: 'cancel' },
        {
          text: isWaitlisted ? 'Quitter' : 'Se désinscrire',
          style: 'destructive',
          onPress: () => handleWithdraw(),
        },
      ]);
    }
  }

  async function handleRegister() {
    if (!supabase || !session) return;
    setBusy(true);
    setActionError(null);
    // La fonction côté base verrouille le tournoi le temps de compter les
    // places : elle décide seule entre « inscrit » et « liste d'attente ».
    const { error } = await supabase.rpc('register_for_tournament', {
      p_tournament_id: id,
    });
    if (error) {
      setActionError(
        isFull
          ? 'Impossible de rejoindre la liste d’attente. Vérifie ta connexion et réessaie.'
          : 'Impossible de finaliser l’inscription. Vérifie ta connexion et réessaie.'
      );
    }
    await refresh();
    setBusy(false);
  }

  async function handleWithdraw() {
    if (!supabase || !myRegistration) return;
    const wasWaitlisted = isWaitlisted;
    setBusy(true);
    setActionError(null);
    // Libère la place et promeut le premier de la liste d'attente.
    const { error } = await supabase.rpc('withdraw_from_tournament', {
      p_tournament_id: id,
    });
    if (error) {
      setActionError(
        wasWaitlisted
          ? 'Impossible de quitter la liste d’attente. Vérifie ta connexion et réessaie.'
          : 'Impossible de te désinscrire. Vérifie ta connexion et réessaie.'
      );
    }
    await refresh();
    setBusy(false);
  }

  /** Invitation à se connecter, à la place des pseudos, pour les visiteurs. */
  function renderLockedList() {
    return (
      <View style={styles.lockedBlock}>
        <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} />
        <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
          Les pseudos des inscrits sont visibles par les membres connectés.
        </ThemedText>
        <Pressable style={styles.linkButton} onPress={() => router.push('/profil')}>
          <ThemedText type="smallBold" style={{ color: colors.tint }}>
            Se connecter
          </ThemedText>
        </Pressable>
      </View>
    );
  }

  /** Lien « Voir les N inscrits » vers l'écran complet. */
  function renderSeeAll(label: string) {
    return (
      <Pressable
        style={({ pressed }) => [styles.seeAll, { opacity: pressed ? 0.8 : 1 }]}
        onPress={() => router.push({ pathname: '/evenements/[id]/inscrits', params: { id } })}>
        <ThemedText type="smallBold" style={{ color: colors.tint }}>
          {label}
        </ThemedText>
        <Ionicons name="chevron-forward" size={16} color={colors.tint} />
      </Pressable>
    );
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

    const registeredLine = (
      <View style={styles.confirmRow}>
        <Ionicons name="checkmark-circle" size={18} color={GreenColor[mode]} />
        <ThemedText type="smallBold" style={{ color: GreenColor[mode] }}>
          {isCheckedIn ? 'Présence confirmée' : 'Inscrit à ce tournoi'}
        </ThemedText>
      </View>
    );

    let message = null;
    let button = null;

    if (tournament.status !== 'open') {
      // Tournoi en cours ou terminé : plus d'inscription possible.
      if (isRegistered) {
        message = registeredLine;
      } else if (isWaitlisted) {
        message = (
          <ThemedText type="small" themeColor="textSecondary" style={styles.ctaMessage}>
            Les inscriptions sont closes — tu n’as pas obtenu de place.
          </ThemedText>
        );
      } else {
        message = (
          <ThemedText type="small" themeColor="textSecondary" style={styles.ctaMessage}>
            Les inscriptions sont closes.
          </ThemedText>
        );
      }
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
    } else if (isCheckedIn) {
      message = registeredLine;
    } else if (isRegistered) {
      message = registeredLine;
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
    } else if (isWaitlisted) {
      message = (
        <View style={styles.confirmRow}>
          <Ionicons name="time-outline" size={16} color={colors.tint} />
          <ThemedText type="smallBold" style={{ color: colors.tint }}>
            {ordinalFr(myWaitlistPosition ?? 1)} sur la liste d’attente
          </ThemedText>
        </View>
      );
      button = (
        <Pressable style={secondaryStyle} disabled={busy} onPress={askWithdraw}>
          {busy ? (
            <ActivityIndicator color={colors.tint} />
          ) : (
            <ThemedText style={{ color: RedColor[mode] }}>
              {confirmingWithdraw ? 'Confirmer la sortie' : 'Quitter la liste d’attente'}
            </ThemedText>
          )}
        </Pressable>
      );
    } else if (isFull) {
      // Complet : on propose la liste d'attente plutôt qu'un bouton mort.
      message = (
        <ThemedText type="small" themeColor="textSecondary" style={styles.ctaMessage}>
          Complet. Les places libérées sont attribuées dans l’ordre de la liste.
        </ThemedText>
      );
      button = (
        <Pressable style={primaryStyle} disabled={busy} onPress={handleRegister}>
          {busy ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <ThemedText style={styles.buttonPrimaryText}>Rejoindre la liste d’attente</ThemedText>
          )}
        </Pressable>
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

    if (!message && !button) return null;

    return (
      <View
        style={[
          styles.ctaBar,
          { backgroundColor: colors.background, borderTopColor: colors.backgroundSelected },
        ]}>
        {actionError ? (
          <View style={[styles.banner, { backgroundColor: RedBackground[mode] }]}>
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
    const visibleRegistered = visibleSlice(registered, InlineRegisteredLimit, session?.user.id);
    const visibleWaitlist = visibleSlice(waitlisted, InlineWaitlistLimit, session?.user.id);
    const showPromotion = Boolean(myRegistration?.promoted_at) && !promotionSeen && isRegistered;
    const showCheckedIn = tournament.status !== 'open';

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

          {/* Bandeau : je viens d'être promu depuis la liste d'attente */}
          {showPromotion ? (
            <View style={[styles.statusBanner, { backgroundColor: GreenBackground[mode] }]}>
              <Ionicons name="checkmark-circle" size={20} color={GreenColor[mode]} />
              <View style={styles.statusBannerTexts}>
                <ThemedText type="default" style={{ fontWeight: '700', color: GreenColor[mode] }}>
                  Une place s’est libérée : tu es inscrit !
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Tu étais sur la liste d’attente. Ta place au {tournament.name} est confirmée.
                </ThemedText>
                <Pressable style={styles.linkButton} onPress={acknowledgePromotion}>
                  <ThemedText type="smallBold" style={{ color: GreenColor[mode] }}>
                    J’ai compris
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          ) : null}

          {/* Bandeau : je suis en liste d'attente */}
          {isWaitlisted && myWaitlistPosition ? (
            <View style={[styles.statusBanner, { backgroundColor: TintBackground[mode] }]}>
              <Ionicons name="time-outline" size={20} color={colors.tint} />
              <View style={styles.statusBannerTexts}>
                <ThemedText type="default" style={{ fontWeight: '700', color: colors.tint }}>
                  Tu es {ordinalFr(myWaitlistPosition)} sur la liste d’attente
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {myWaitlistPosition === 1
                    ? 'Tu es le prochain à obtenir une place.'
                    : `Il y a ${myWaitlistPosition - 1} joueur${myWaitlistPosition > 2 ? 's' : ''} devant toi. Tu seras inscrit automatiquement si une place se libère.`}
                </ThemedText>
              </View>
            </View>
          ) : null}

          {tournament.status === 'cancelled' ? (
            <View style={[styles.banner, { backgroundColor: RedBackground[mode] }]}>
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
                {tournament.organizer?.pseudo ? (
                  <>
                    Organisé par{' '}
                    <ThemedText type="smallBold" themeColor="text">
                      {tournament.organizer.pseudo}
                    </ThemedText>
                  </>
                ) : (
                  'Organisateur visible par les membres connectés'
                )}
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
                  {'  '}
                  {waitlisted.length > 0
                    ? `${waitlisted.length} joueur${waitlisted.length > 1 ? 's' : ''} en liste d’attente`
                    : 'Rejoins la liste d’attente pour être prévenu'}
                </ThemedText>
              </ThemedText>
            )}

            <View style={[styles.divider, { backgroundColor: colors.backgroundSelected }]} />

            <ThemedText type="small" themeColor="textSecondary">
              Joueurs inscrits
            </ThemedText>

            {!session ? (
              renderLockedList()
            ) : registered.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                {tournament.status === 'open'
                  ? 'Aucun inscrit pour l’instant. Sois le premier !'
                  : 'Aucun inscrit.'}
              </ThemedText>
            ) : (
              <View style={styles.playerList}>
                {visibleRegistered.map((registration) => (
                  <PlayerRow
                    key={registration.id}
                    registration={registration}
                    isMe={registration.player_id === session.user.id}
                    showCheckedIn={showCheckedIn}
                  />
                ))}
                {registered.length > visibleRegistered.length
                  ? renderSeeAll(`Voir les ${registered.length} inscrits`)
                  : null}
              </View>
            )}
          </View>

          {/* Carte Liste d'attente */}
          {waitlisted.length > 0 || isFull ? (
            <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
              <View style={styles.participantsHeader}>
                <View style={styles.confirmRow}>
                  <Ionicons name="time-outline" size={16} color={colors.tint} />
                  <ThemedText type="small" themeColor="textSecondary">
                    Liste d’attente
                  </ThemedText>
                </View>
                <ThemedText type="smallBold">{waitlisted.length}</ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                Dès qu’une place se libère, le premier de la liste est inscrit automatiquement.
              </ThemedText>

              {waitlisted.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Personne n’attend pour l’instant.
                </ThemedText>
              ) : !session ? (
                renderLockedList()
              ) : (
                <View style={styles.playerList}>
                  {visibleWaitlist.map((registration) => (
                    <PlayerRow
                      key={registration.id}
                      registration={registration}
                      isMe={registration.player_id === session.user.id}
                      waitlistPosition={
                        waitlisted.findIndex((r) => r.id === registration.id) + 1
                      }
                    />
                  ))}
                  {waitlisted.length > visibleWaitlist.length
                    ? renderSeeAll(`Voir les ${waitlisted.length} joueurs en attente`)
                    : null}
                </View>
              )}
            </View>
          ) : null}
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
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    borderRadius: Spacing.two,
    padding: Spacing.three,
  },
  statusBannerTexts: {
    flex: 1,
    gap: Spacing.half,
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
  divider: {
    height: 1,
    marginVertical: Spacing.one,
    marginHorizontal: -Spacing.three,
  },
  playerList: {
    gap: Spacing.two,
  },
  lockedBlock: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
  },
  linkButton: {
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    minHeight: 44,
    marginTop: Spacing.one,
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
  banner: {
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
