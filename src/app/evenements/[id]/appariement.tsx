import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  Colors,
  GreenColor,
  MaxContentWidth,
  OnTint,
  RedBackground,
  RedColor,
  Spacing,
  TintBackground,
  TintBorder,
} from '@/constants/theme';
import { useCaptainPairing } from '@/hooks/use-captain-pairing';
import { useMyTeam } from '@/hooks/use-my-team';
import { useSession } from '@/hooks/use-session';
import { useTournamentDetail } from '@/hooks/use-tournament-detail';
import { supabase } from '@/lib/supabase';

/** « Actualisé il y a 7 min » — sans temps réel, la fraîcheur est l'information. */
function freshness(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'Actualisé à l’instant';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Actualisé il y a ${minutes} min`;
  return `Actualisé il y a ${Math.floor(minutes / 60)} h`;
}

function readableError(message: string): string {
  switch (message) {
    case 'NOT_CAPTAIN':
      return 'Seuls les capitaines apparient.';
    case 'NOT_YOUR_TURN':
      return 'Ce n’est pas à ton équipe de jouer.';
    case 'WRONG_STEP':
      return 'La rencontre a avancé. Actualise pour voir où elle en est.';
    case 'PLAYER_NOT_FREE':
      return 'Ce joueur est déjà apparié.';
    case 'OFFER_TWO_REQUIRED':
      return 'Il faut présenter exactement deux joueurs.';
    case 'NOT_OFFERED':
      return 'Ce joueur ne fait pas partie des deux présentés.';
    default:
      return 'Impossible d’enregistrer ton choix. Vérifie ta connexion et réessaie.';
  }
}

export default function AppariementScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const colors = Colors[mode];

  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/evenements/[id]', params: { id: id ?? '' } });
  };

  const { session } = useSession();
  const { tournament, myTeamRegistration, engagedTeams } = useTournamentDetail(
    id,
    session?.user.id
  );
  const { team } = useMyTeam(session?.user.id);
  const { encounter, state, loading, failed, refresh, refreshedAt, setState } = useCaptainPairing(
    id,
    myTeamRegistration?.id ?? null
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Sélection en cours pour « présenter deux » : le geste attend deux taps. */
  const [offer, setOffer] = useState<string[]>([]);

  const isCaptain = Boolean(team && session && team.captain_id === session.user.id);

  /** Pseudo et faction déclarée de chaque joueur, pris sur les inscriptions. */
  const players = useMemo(() => {
    const map = new Map<string, { pseudo: string; faction: string | null }>();
    for (const engaged of engagedTeams) {
      for (const row of engaged.roster) {
        map.set(row.player_id, {
          pseudo: row.profile?.pseudo ?? 'Joueur',
          faction: row.faction,
        });
      }
    }
    return map;
  }, [engagedTeams]);

  const teamNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const engaged of engagedTeams) map.set(engaged.id, engaged.team?.name ?? 'Équipe');
    return map;
  }, [engagedTeams]);

  const myTurn =
    state !== null &&
    myTeamRegistration !== null &&
    ((state.step === 'post' && state.attacker_team_id === myTeamRegistration.id) ||
      (state.step === 'offer' && state.defender_team_id === myTeamRegistration.id) ||
      (state.step === 'pick' && state.attacker_team_id === myTeamRegistration.id));

  async function act(fn: () => PromiseLike<{ data: unknown; error: { message: string } | null }>) {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { data, error: dbError } = await fn();
    setBusy(false);
    if (dbError) {
      setError(readableError(dbError.message));
      // L'état local peut être en retard : on le remet d'aplomb.
      refresh();
      return;
    }
    setOffer([]);
    setState(data as never);
  }

  const post = (playerId: string) =>
    act(() =>
      supabase!.rpc('captain_post_player', {
        p_team_pairing_id: encounter!.id,
        p_player_id: playerId,
      })
    );

  const confirmOffer = () =>
    act(() =>
      supabase!.rpc('captain_offer_two', {
        p_team_pairing_id: encounter!.id,
        p_player_ids: offer,
      })
    );

  const pick = (playerId: string) =>
    act(() =>
      supabase!.rpc('captain_pick_opponent', {
        p_team_pairing_id: encounter!.id,
        p_player_id: playerId,
      })
    );

  function toggleOffer(playerId: string) {
    setError(null);
    setOffer((current) => {
      if (current.includes(playerId)) return current.filter((p) => p !== playerId);
      if (current.length >= 2) return current;
      return [...current, playerId];
    });
  }

  // ---------------------------------------------------------------------
  let content;
  if (loading) {
    content = (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.tint} />
      </View>
    );
  } else if (failed) {
    content = (
      <View style={styles.centered}>
        <Ionicons name="cloud-offline-outline" size={40} color={colors.textSecondary} />
        <ThemedText type="smallBold">Impossible de charger la rencontre</ThemedText>
        <Pressable style={styles.secondaryButton} onPress={refresh}>
          <ThemedText>Réessayer</ThemedText>
        </Pressable>
      </View>
    );
  } else if (!myTeamRegistration || !encounter || !state) {
    content = (
      <View style={styles.centered}>
        <Ionicons name="people-outline" size={40} color={colors.textSecondary} />
        <ThemedText type="smallBold" style={styles.centeredText}>
          Aucune rencontre à apparier
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
          L’appariement s’ouvrira quand l’organisation aura généré la ronde.
        </ThemedText>
        <Pressable style={styles.secondaryButton} onPress={leave}>
          <ThemedText>Retour au tournoi</ThemedText>
        </Pressable>
      </View>
    );
  } else {
    const opponentTeamId =
      state.team_a_id === myTeamRegistration.id ? state.team_b_id : state.team_a_id;
    const myFree = state.team_a_id === myTeamRegistration.id ? state.free_a : state.free_b;
    const theirFree = state.team_a_id === myTeamRegistration.id ? state.free_b : state.free_a;

    /** Une carte de joueur : pseudo, faction déclarée, et son rôle du moment. */
    const playerCard = (
      playerId: string,
      onPress: (() => void) | null,
      selected = false,
      label?: string
    ) => {
      const info = players.get(playerId);
      return (
        <Pressable
          key={playerId}
          onPress={onPress ?? undefined}
          disabled={!onPress || busy}
          accessibilityRole={onPress ? 'button' : undefined}
          style={({ pressed }) => [
            styles.playerCard,
            {
              backgroundColor: selected ? TintBackground[mode] : colors.backgroundElement,
              borderColor: selected ? TintBorder[mode] : 'transparent',
              opacity: !onPress ? 0.6 : pressed ? 0.8 : 1,
            },
          ]}>
          <View style={styles.playerIdentity}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {info?.pseudo ?? 'Joueur'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {info?.faction ?? 'Faction non déclarée'}
            </ThemedText>
          </View>
          {label ? (
            <ThemedText type="small" style={{ color: colors.tint }}>
              {label}
            </ThemedText>
          ) : null}
        </Pressable>
      );
    };

    // La consigne du moment, en clair. Une seule question à l'écran.
    let instruction: string;
    let action = null;
    if (state.pairing_status === 'locked' || state.step === 'done') {
      instruction = 'Les tables de cette rencontre sont composées.';
    } else if (state.step === 'last') {
      instruction =
        'Il ne reste qu’un joueur de chaque côté : leur match se formera tout seul.';
    } else if (!isCaptain) {
      instruction =
        state.step === 'post'
          ? `${teamNames.get(state.attacker_team_id) ?? 'L’équipe'} doit poser un joueur.`
          : state.step === 'offer'
            ? `${teamNames.get(state.defender_team_id ?? '') ?? 'L’équipe'} doit présenter deux joueurs.`
            : `${teamNames.get(state.attacker_team_id) ?? 'L’équipe'} doit choisir l’adversaire.`;
    } else if (myTurn && state.step === 'post') {
      instruction = 'À toi de poser un joueur.';
      action = <View style={styles.list}>{myFree.map((p) => playerCard(p, () => post(p)))}</View>;
    } else if (myTurn && state.step === 'offer') {
      instruction = `${players.get(state.posted_player_id ?? '')?.pseudo ?? 'L’adversaire'} est posé. Présente deux de tes joueurs.`;
      action = (
        <>
          <View style={styles.list}>
            {myFree.map((p) => playerCard(p, () => toggleOffer(p), offer.includes(p)))}
          </View>
          <Pressable
            onPress={confirmOffer}
            disabled={offer.length !== 2 || busy}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.primaryButton,
              {
                backgroundColor: offer.length === 2 ? colors.tint : colors.backgroundSelected,
                opacity: pressed ? 0.8 : 1,
              },
            ]}>
            <ThemedText
              type="smallBold"
              style={{ color: offer.length === 2 ? OnTint[mode] : colors.textSecondary }}>
              {offer.length === 2 ? 'Présenter ces deux joueurs' : `Choisis ${2 - offer.length} joueur${2 - offer.length > 1 ? 's' : ''}`}
            </ThemedText>
          </Pressable>
        </>
      );
    } else if (myTurn && state.step === 'pick') {
      instruction = `Choisis qui affronte ${players.get(state.posted_player_id ?? '')?.pseudo ?? 'ton joueur'}.`;
      action = (
        <View style={styles.list}>
          {state.offered_player_ids.map((p) => playerCard(p, () => pick(p)))}
        </View>
      );
    } else {
      instruction = `En attente de ${teamNames.get(opponentTeamId ?? '') ?? 'l’équipe adverse'}.`;
    }

    content = (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.matchHeader}>
          <ThemedText type="subtitle" numberOfLines={2}>
            {teamNames.get(myTeamRegistration.id) ?? 'Mon équipe'} contre{' '}
            {teamNames.get(opponentTeamId ?? '') ?? 'l’équipe adverse'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Rencontre {encounter.encounter_number} · passe {state.pass_number} sur{' '}
            {state.team_size - 1}
          </ThemedText>
        </View>

        {/* La consigne : la seule question posée à l'écran. */}
        <View
          style={[
            styles.instruction,
            { backgroundColor: TintBackground[mode], borderColor: TintBorder[mode] },
          ]}>
          <ThemedText type="smallBold" style={styles.instructionText}>
            {instruction}
          </ThemedText>
        </View>

        {error ? (
          <View style={[styles.banner, { backgroundColor: RedBackground[mode] }]}>
            <ThemedText type="small" style={{ color: RedColor[mode] }}>
              {error}
            </ThemedText>
          </View>
        ) : null}

        {action}

        <ThemedText type="small" themeColor="textSecondary">
          Joueurs encore libres en face
        </ThemedText>
        <View style={styles.list}>{theirFree.map((p) => playerCard(p, null))}</View>

        {/* Sans temps réel, la fraîcheur est l'information — et le bouton est
            plein format : debout, le tirer-pour-rafraîchir ne se découvre pas. */}
        <Pressable style={styles.secondaryButton} onPress={refresh} disabled={busy}>
          <ThemedText type="smallBold" style={{ color: colors.tint }}>
            Actualiser
          </ThemedText>
        </Pressable>
        {refreshedAt ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
            {freshness(refreshedAt)}
          </ThemedText>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.headerRow}>
          <Pressable onPress={leave} style={styles.backButton} accessibilityLabel="Retour">
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <View style={styles.headerTexts}>
            <ThemedText type="default" style={styles.headerTitle}>
              Appariement
            </ThemedText>
            {tournament ? (
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {tournament.name}
              </ThemedText>
            ) : null}
          </View>
          {state?.pairing_status === 'locked' ? (
            <Ionicons name="lock-closed" size={18} color={GreenColor[mode]} />
          ) : null}
        </View>
        {content}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTexts: { flex: 1 },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
    gap: Spacing.two,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  centeredText: { textAlign: 'center' },
  matchHeader: { gap: Spacing.half },
  instruction: {
    borderRadius: Spacing.two,
    borderWidth: 1,
    padding: Spacing.three,
  },
  instructionText: { fontSize: 18, lineHeight: 24 },
  list: { gap: Spacing.two },
  playerCard: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: 1,
  },
  playerIdentity: { flex: 1 },
  banner: { borderRadius: Spacing.two, padding: Spacing.two },
  primaryButton: {
    minHeight: 52,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
});
