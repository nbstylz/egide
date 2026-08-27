import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PreparationCard, type FactionLock } from '@/components/preparation-card';
import { JourJCard } from '@/components/jour-j-card';
import { MetaRow } from '@/components/meta-row';
import { MonParcours } from '@/components/mon-parcours';
import { PlayerRow } from '@/components/player-row';
import { StatusBadge } from '@/components/status-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  Colors,
  GreenBackground,
  GreenColor,
  MaxContentWidth,
  OnTint,
  RedBackground,
  RedColor,
  Spacing,
  TintBackground,
} from '@/constants/theme';
import { useArmyList } from '@/hooks/use-army-list';
import { useFactionDeclaration } from '@/hooks/use-faction-declaration';
import { useMyPairing } from '@/hooks/use-my-pairing';
import { useMyTeam } from '@/hooks/use-my-team';
import { useProfile } from '@/hooks/use-profile';
import { useSession } from '@/hooks/use-session';
import { useTournamentDetail, visibleSlice } from '@/hooks/use-tournament-detail';
import { matchFaction } from '@/lib/factions';
import { ordinalFr } from '@/lib/ordinal';
import { flushPushQueue, registerForPush } from '@/lib/push';
import { supabase } from '@/lib/supabase';
import { formatEventDate, formatTypeLabel } from '@/lib/tournaments';

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
  // Un joueur n'a qu'une équipe : il n'y a rien à choisir, seulement à savoir
  // s'il la capitaine.
  const { team: myTeam } = useMyTeam(session?.user.id);
  const {
    tournament,
    loading,
    refresh,
    registered,
    waitlisted,
    registeredCount,
    engagedTeams,
    waitlistedTeams,
    myTeamRegistration,
    isTeamTournament,
    takenSlots,
    myRegistration,
    myWaitlistPosition,
    isOrganizer,
    isFull,
  } = useTournamentDetail(id, session?.user.id);

  // Le déroulé du jour J : ronde en cours, mon appariement, mes résultats.
  const {
    currentRound,
    pairings,
    myPairing,
    myResults,
    standings,
    loading: pairingLoading,
    failed: pairingFailed,
    refreshedAt,
    refresh: refreshPairing,
  } = useMyPairing(id, session?.user.id, tournament?.status);

  // Ma liste d'armée, chargée seulement si j'ai une inscription.
  const { list: armyList, refresh: refreshArmyList } = useArmyList(myRegistration?.id);

  // Au retour de l'écran de saisie, le statut de la liste a pu changer.
  useFocusEffect(
    useCallback(() => {
      refreshArmyList();
    }, [refreshArmyList])
  );

  // Faction déclarée pour ce tournoi : l'écriture ne rafraîchit pas la fiche
  // (cela remettrait `loading` à vrai et remplacerait tout l'écran par un
  // indicateur de chargement à chaque choix).
  const {
    faction: myFaction,
    saving: factionSaving,
    saved: factionSaved,
    error: factionError,
    save: saveFaction,
    retry: retryFaction,
  } = useFactionDeclaration(id, myRegistration?.id, myRegistration?.faction ?? null);

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
    const title = myTeamRegistration
      ? 'Te retirer du roster ?'
      : isWaitlisted
        ? 'Quitter la liste d’attente ?'
        : 'Se désinscrire ?';
    let message;
    if (myTeamRegistration) {
      const teamSize = tournament?.team_size ?? 0;
      message = `Ton équipe passera à ${myTeamRegistration.roster.length - 1} joueur${
        myTeamRegistration.roster.length - 1 > 1 ? 's' : ''
      } sur ${teamSize} et ne pourra pas être appariée tant que le capitaine n’a pas complété le roster.`;
    } else if (isWaitlisted) {
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
          text: myTeamRegistration ? 'Me retirer' : isWaitlisted ? 'Quitter' : 'Se désinscrire',
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
    } else {
      // Le bon moment pour demander les notifications : le joueur vient de
      // s'engager, il a une raison d'être prévenu. Jamais au premier
      // lancement. Sans suite bloquante — un refus se gère en silence.
      registerForPush(session.user.id);
      // Son inscription vient peut-être de notifier l'organisateur.
      flushPushQueue();
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
    } else {
      // Le désistement a peut-être promu quelqu'un : qu'il le sache vite.
      flushPushQueue();
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
          <ThemedText style={[styles.buttonPrimaryText, { color: OnTint[mode] }]}>Se connecter pour s’inscrire</ThemedText>
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
          <ThemedText style={[styles.buttonPrimaryText, { color: OnTint[mode] }]}>Créer mon profil</ThemedText>
        </Pressable>
      );
    } else if (isTeamTournament) {
      // Un tournoi par équipes ne s'inscrit pas joueur par joueur : c'est le
      // capitaine qui engage, et l'équipe entre ou attend en entier.
      const isCaptain = Boolean(myTeam && myTeam.captain_id === session.user.id);
      const teamName = myTeamRegistration?.team?.name;
      if (myTeamRegistration) {
        message = (
          <View style={styles.confirmRow}>
            <Ionicons name="checkmark-circle" size={18} color={GreenColor[mode]} />
            <ThemedText type="smallBold" style={{ color: GreenColor[mode] }}>
              {myTeamRegistration.status === 'waitlisted'
                ? `${teamName} est en liste d’attente`
                : `Inscrit avec ${teamName}`}
            </ThemedText>
          </View>
        );
        if (isCaptain) {
          button = (
            <Pressable
              style={secondaryStyle}
              onPress={() =>
                router.push({ pathname: '/evenements/[id]/inscrire-equipe', params: { id } })
              }>
              <ThemedText>Modifier le roster</ThemedText>
            </Pressable>
          );
        } else {
          button = (
            <Pressable style={secondaryStyle} disabled={busy} onPress={askWithdraw}>
              {busy ? (
                <ActivityIndicator color={colors.tint} />
              ) : (
                <ThemedText style={{ color: RedColor[mode] }}>
                  {confirmingWithdraw ? 'Confirmer mon retrait' : 'Me retirer du roster'}
                </ThemedText>
              )}
            </Pressable>
          );
        }
      } else if (isCaptain) {
        button = (
          <Pressable
            style={primaryStyle}
            onPress={() =>
              router.push({ pathname: '/evenements/[id]/inscrire-equipe', params: { id } })
            }>
            <ThemedText style={[styles.buttonPrimaryText, { color: OnTint[mode] }]}>
              {isFull ? 'Mettre mon équipe en liste d’attente' : 'Inscrire mon équipe'}
            </ThemedText>
          </Pressable>
        );
      } else if (myTeam) {
        message = (
          <ThemedText type="small" themeColor="textSecondary" style={styles.ctaMessage}>
            Seul le capitaine inscrit l’équipe à un tournoi.
          </ThemedText>
        );
        button = (
          <Pressable
            style={secondaryStyle}
            onPress={() => router.push({ pathname: '/equipes/[id]', params: { id: myTeam.id } })}>
            <ThemedText>Voir mon équipe</ThemedText>
          </Pressable>
        );
      } else {
        message = (
          <ThemedText type="small" themeColor="textSecondary" style={styles.ctaMessage}>
            Ce tournoi se joue en équipe. Rejoins une équipe avec le code de son capitaine.
          </ThemedText>
        );
        button = (
          <Pressable style={secondaryStyle} onPress={() => router.push('/(tabs)/equipes')}>
            <ThemedText>Aller aux équipes</ThemedText>
          </Pressable>
        );
      }
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
            <ActivityIndicator color={OnTint[mode]} />
          ) : (
            <ThemedText style={[styles.buttonPrimaryText, { color: OnTint[mode] }]}>Rejoindre la liste d’attente</ThemedText>
          )}
        </Pressable>
      );
    } else {
      button = (
        <Pressable style={primaryStyle} disabled={busy} onPress={handleRegister}>
          {busy ? (
            <ActivityIndicator color={OnTint[mode]} />
          ) : (
            <ThemedText style={[styles.buttonPrimaryText, { color: OnTint[mode] }]}>S’inscrire</ThemedText>
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
    // Un tournoi par équipes compte des équipes : afficher « 36 / 12 » ferait
    // croire à un dépassement.
    const remaining = tournament.capacity - takenSlots;
    const fillPercent = Math.min(100, Math.round((takenSlots / tournament.capacity) * 100));
    const visibleRegistered = visibleSlice(registered, InlineRegisteredLimit, session?.user.id);
    const visibleWaitlist = visibleSlice(waitlisted, InlineWaitlistLimit, session?.user.id);
    const showPromotion = Boolean(myRegistration?.promoted_at) && !promotionSeen && isRegistered;
    const showCheckedIn = tournament.status !== 'open';

    const isDropped = myRegistration?.status === 'dropped';
    // Une liste validée engage la parole de l'organisation ; un tournoi lancé
    // fige ce qui a déjà été annoncé aux adversaires — mais pas ce qui manque
    // encore (« combler oui, réécrire non »).
    const factionLock: FactionLock =
      armyList?.status === 'approved'
        ? 'list'
        : tournament.status !== 'open' && myFaction
          ? 'started'
          : null;
    // Proposée en raccourci seulement : jamais enregistrée sans un tap.
    const favoriteFaction = matchFaction(profile?.faction_favorite);
    // Les inscriptions sont déjà chargées : la faction d'un adversaire s'y lit
    // sans un appel réseau de plus.
    const factionOf = (playerId: string | null | undefined) =>
      (playerId ? registered.find((r) => r.player_id === playerId)?.faction : null) ?? null;
    const showJourJ = tournament.status === 'in_progress' || tournament.status === 'completed';
    const tablesCount = pairings.filter((p) => p.player_b_id !== null).length;

    body = (
      <>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={() => {
                refresh();
                refreshPairing();
                refreshArmyList();
              }}
              tintColor={colors.tint}
              colors={[colors.tint]}
            />
          }>
          {/* Héros */}
          <View style={styles.hero}>
            <View style={styles.badgeRow}>
              <StatusBadge status={tournament.status} />
              <View style={[styles.typeBadge, { backgroundColor: colors.backgroundSelected }]}>
                <ThemedText themeColor="textSecondary" style={styles.typeBadgeText}>
                  {formatTypeLabel(tournament.type, tournament.team_size)}
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

          {/* Ma préparation : faction et liste d'armée, les deux seules choses
              que le joueur inscrit a à faire ici avant le jour J. */}
          {isRegistered && tournament.status === 'open' ? (
            <PreparationCard
              list={armyList}
              submissionsOpen
              onOpen={() =>
                router.push({ pathname: '/evenements/[id]/liste', params: { id } })
              }
              faction={myFaction}
              favoriteFaction={favoriteFaction}
              factionLock={factionLock}
              onDeclareFaction={saveFaction}
              factionSaving={factionSaving}
              factionSaved={factionSaved}
              factionError={factionError}
              onRetryFaction={retryFaction}
            />
          ) : null}

          {/* Le jour J : ma table, mon adversaire, mon parcours */}
          {showJourJ ? (
            <>
              <JourJCard
                tournament={tournament}
                currentRound={currentRound}
                myPairing={myPairing}
                myRegistration={myRegistration}
                userId={session?.user.id}
                standings={standings}
                tablesCount={tablesCount}
                factionOf={factionOf}
                loading={pairingLoading}
                failed={pairingFailed}
                refreshedAt={refreshedAt}
                onSeeTables={() =>
                  router.push({ pathname: '/evenements/[id]/tables', params: { id } })
                }
                onSeeStandings={() =>
                  router.push({ pathname: '/evenements/[id]/classement', params: { id } })
                }
              />
              <MonParcours
                results={myResults}
                initiallyExpanded={tournament.status === 'completed' || isDropped}
                droppedRound={isDropped ? (myRegistration?.dropped_round ?? null) : null}
              />
              {/* Le tournoi est lancé : la liste n'est plus qu'une consultation,
                  mais une faction absente peut encore être comblée. Un joueur
                  qui a abandonné y a droit aussi : ses parties comptent. */}
              {isRegistered || isDropped ? (
                <PreparationCard
                  list={armyList}
                  submissionsOpen={false}
                  onOpen={() =>
                    router.push({ pathname: '/evenements/[id]/liste', params: { id } })
                  }
                  faction={myFaction}
                  favoriteFaction={favoriteFaction}
                  factionLock={factionLock}
                  onDeclareFaction={saveFaction}
                  factionSaving={factionSaving}
                  factionSaved={factionSaved}
                  factionError={factionError}
                  onRetryFaction={retryFaction}
                />
              ) : null}
            </>
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
                {isTeamTournament ? 'Équipes engagées' : 'Inscrits'}
              </ThemedText>
              <ThemedText type="smallBold">
                {takenSlots} / {tournament.capacity}
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
                {isTeamTournament
                  ? ` · ${registeredCount} joueur${registeredCount > 1 ? 's' : ''} engagé${registeredCount > 1 ? 's' : ''}`
                  : ''}
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
              {isTeamTournament ? 'Rosters engagés' : 'Joueurs inscrits'}
            </ThemedText>

            {!session ? (
              renderLockedList()
            ) : isTeamTournament ? (
              engagedTeams.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {tournament.status === 'open'
                    ? 'Aucune équipe engagée pour l’instant.'
                    : 'Aucune équipe engagée.'}
                </ThemedText>
              ) : (
                <View style={styles.playerList}>
                  {engagedTeams.map((engaged) => (
                    <View
                      key={engaged.id}
                      style={[styles.teamBlock, { backgroundColor: colors.background }]}>
                      <View style={styles.confirmRow}>
                        <ThemedText type="smallBold" numberOfLines={1} style={styles.teamName}>
                          {engaged.team?.name ?? 'Équipe'}
                        </ThemedText>
                        {engaged.id === myTeamRegistration?.id ? (
                          <View style={[styles.chip, { backgroundColor: colors.tint }]}>
                            <ThemedText type="small" style={{ color: OnTint[mode] }}>
                              ton équipe
                            </ThemedText>
                          </View>
                        ) : null}
                      </View>
                      {/* Les pseudos du roster, dans l'ordre. La faction se lit
                          sur la liste complète des inscrits : ici, c'est la
                          composition qu'on vient vérifier. */}
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                        {engaged.roster.map((r) => r.profile?.pseudo ?? 'Joueur').join(' · ')}
                        {tournament.team_size && engaged.roster.length < tournament.team_size
                          ? `  —  ${tournament.team_size - engaged.roster.length} place${
                              tournament.team_size - engaged.roster.length > 1 ? 's' : ''
                            } à combler`
                          : ''}
                      </ThemedText>
                    </View>
                  ))}
                  {registered.length > 0
                    ? renderSeeAll(`Voir les ${registered.length} joueurs inscrits`)
                    : null}
                </View>
              )
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
          {(isTeamTournament ? waitlistedTeams.length > 0 : waitlisted.length > 0) || isFull ? (
            <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
              <View style={styles.participantsHeader}>
                <View style={styles.confirmRow}>
                  <Ionicons name="time-outline" size={16} color={colors.tint} />
                  <ThemedText type="small" themeColor="textSecondary">
                    Liste d’attente
                  </ThemedText>
                </View>
                <ThemedText type="smallBold">
                  {isTeamTournament ? waitlistedTeams.length : waitlisted.length}
                </ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                {isTeamTournament
                  ? 'Dès qu’une place se libère, la première équipe de la liste est inscrite automatiquement, avec tout son roster.'
                  : 'Dès qu’une place se libère, le premier de la liste est inscrit automatiquement.'}
              </ThemedText>

              {isTeamTournament ? (
                waitlistedTeams.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    Aucune équipe n’attend pour l’instant.
                  </ThemedText>
                ) : (
                  <View style={styles.playerList}>
                    {waitlistedTeams.map((engaged, index) => (
                      <View
                        key={engaged.id}
                        style={[styles.teamBlock, { backgroundColor: colors.background }]}>
                        <View style={styles.confirmRow}>
                          <ThemedText type="smallBold" style={{ color: colors.tint }}>
                            {ordinalFr(index + 1)}
                          </ThemedText>
                          <ThemedText type="smallBold" numberOfLines={1} style={styles.teamName}>
                            {engaged.team?.name ?? 'Équipe'}
                          </ThemedText>
                          {engaged.id === myTeamRegistration?.id ? (
                            <View style={[styles.chip, { backgroundColor: colors.tint }]}>
                              <ThemedText type="small" style={{ color: OnTint[mode] }}>
                                ton équipe
                              </ThemedText>
                            </View>
                          ) : null}
                        </View>
                      </View>
                    ))}
                  </View>
                )
              ) : waitlisted.length === 0 ? (
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
  teamBlock: {
    borderRadius: Spacing.two,
    padding: Spacing.two,
    gap: Spacing.half,
  },
  teamName: {
    flexShrink: 1,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: Spacing.one,
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
