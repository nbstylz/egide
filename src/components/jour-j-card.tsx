import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, useColorScheme, useWindowDimensions, View } from 'react-native';

import { MetaRow } from '@/components/meta-row';
import { ThemedText } from '@/components/themed-text';
import {
  Colors,
  GreenColor,
  RedColor,
  Spacing,
  TintBackground,
  TintBorder,
  TintDivider,
} from '@/constants/theme';
import type { PairingInfo, RoundInfo, StandingRow } from '@/hooks/use-my-pairing';
import { ordinalFr } from '@/lib/ordinal';
import type { Tournament } from '@/lib/tournaments';

type Registration = { status: string; dropped_round: number | null } | null;

type Props = {
  tournament: Tournament;
  currentRound: RoundInfo | null;
  myPairing: PairingInfo | null;
  myRegistration: Registration;
  userId: string | undefined;
  standings: StandingRow[];
  tablesCount: number;
  loading: boolean;
  failed: boolean;
  refreshedAt: Date | null;
  onSeeTables: () => void;
};

/** « 15 – 5 » insécable : le score ne se coupe jamais en fin de ligne. */
function score(a: number, b: number) {
  return `${a} – ${b}`;
}

/** « Actualisé il y a 7 min » — sans temps réel, la fraîcheur est l'info. */
function freshness(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'Actualisé à l’instant';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Actualisé il y a ${minutes} min`;
  return `Actualisé il y a ${Math.floor(minutes / 60)} h`;
}

/**
 * Le bloc « Le jour J » : ce que le joueur vient chercher sur son téléphone
 * en marchant vers sa table. Lecture seule, aucun bouton d'action.
 */
export function JourJCard({
  tournament,
  currentRound,
  myPairing,
  myRegistration,
  userId,
  standings,
  tablesCount,
  loading,
  failed,
  refreshedAt,
  onSeeTables,
}: Props) {
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const colors = Colors[mode];
  const { width } = useWindowDimensions();

  // État 1 : tournoi pas lancé — le bloc n'existe pas.
  if (tournament.status !== 'in_progress' && tournament.status !== 'completed') return null;

  const completed = tournament.status === 'completed';
  const dropped = myRegistration?.status === 'dropped';
  const participating =
    myRegistration?.status === 'checked_in' ||
    myRegistration?.status === 'registered' ||
    dropped;

  // L'état doré est réservé au match en cours : un seul bloc doré par écran.
  const isMatchState =
    !completed && !dropped && participating && myPairing !== null && myPairing.player_b_id !== null;

  const surTitre = currentRound ? (
    <ThemedText style={[styles.overline, { color: colors.tint }]}>
      Ronde {currentRound.number} sur {tournament.rounds_count}
    </ThemedText>
  ) : null;

  const scenario =
    currentRound?.scenario && !completed ? (
      <MetaRow icon="map-outline">
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
          {currentRound.scenario}
        </ThemedText>
      </MetaRow>
    ) : null;

  const footer = (
    <>
      <View
        style={[
          styles.divider,
          { backgroundColor: isMatchState ? TintDivider[mode] : colors.backgroundSelected },
        ]}
      />
      <View style={styles.actions}>
        <Pressable
          onPress={onSeeTables}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.action,
            {
              backgroundColor: isMatchState ? colors.background : colors.backgroundSelected,
              opacity: pressed ? 0.8 : 1,
            },
          ]}>
          <Ionicons name="grid-outline" size={16} color={colors.tint} />
          <ThemedText type="smallBold" style={{ color: colors.tint }}>
            {tablesCount === 1 ? 'La table' : `Les ${tablesCount} tables`}
          </ThemedText>
        </Pressable>
      </View>
      {!completed && refreshedAt ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.freshness}>
          {freshness(refreshedAt)}
        </ThemedText>
      ) : null}
    </>
  );

  // Chargement : hauteur fixe pour que la carte Format ne saute pas sous le doigt.
  if (loading) {
    return (
      <View style={[styles.card, styles.loading, { backgroundColor: colors.backgroundElement }]}>
        <ActivityIndicator color={colors.tint} />
      </View>
    );
  }

  if (failed) {
    return (
      <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
        <MetaRow icon="cloud-offline-outline">
          <ThemedText type="smallBold">Impossible de charger ta table</ThemedText>
        </MetaRow>
        <ThemedText type="small" themeColor="textSecondary">
          Vérifie ta connexion, puis tire vers le bas pour réessayer.
        </ThemedText>
      </View>
    );
  }

  // État 6 : tournoi terminé.
  if (completed) {
    const mine = userId ? standings.find((row) => row.player_id === userId) : undefined;
    const winner = standings[0];
    return (
      <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
        <ThemedText type="default" style={styles.doneTitle}>
          Tournoi terminé
        </ThemedText>
        {mine ? (
          dropped ? (
            <ThemedText type="small">
              Tu as abandonné à la ronde {myRegistration?.dropped_round ?? '—'}. Tes résultats
              restent acquis.
            </ThemedText>
          ) : (
            <ThemedText type="small">
              Tu termines {ordinalFr(mine.rank)} sur {standings.length}, avec {mine.wins}{' '}
              {mine.wins > 1 ? 'victoires' : 'victoire'}.
            </ThemedText>
          )
        ) : winner ? (
          <ThemedText type="small" themeColor="textSecondary">
            Vainqueur : {winner.pseudo}
          </ThemedText>
        ) : null}
        <View style={[styles.divider, { backgroundColor: colors.backgroundSelected }]} />
        <Pressable
          onPress={onSeeTables}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.action,
            { backgroundColor: colors.backgroundSelected, opacity: pressed ? 0.8 : 1 },
          ]}>
          <Ionicons name="grid-outline" size={16} color={colors.tint} />
          <ThemedText type="smallBold" style={{ color: colors.tint }}>
            Revoir les tables
          </ThemedText>
        </Pressable>
      </View>
    );
  }

  // État 5 : j'ai abandonné — deux lignes, ton neutre, jamais de rouge.
  if (dropped) {
    const round = myRegistration?.dropped_round ?? null;
    return (
      <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
        <MetaRow icon="remove-circle-outline">
          <ThemedText type="default" style={styles.droppedTitle}>
            Tu as abandonné{round ? ` à la ronde ${round}` : ''}
          </ThemedText>
        </MetaRow>
        <ThemedText type="small" themeColor="textSecondary">
          {round && round > 1
            ? `Tes résultats des rondes 1 à ${round - 1} restent acquis au classement.`
            : 'Tu n’as pas de résultat enregistré.'}
        </ThemedText>
        {footer}
      </View>
    );
  }

  // État 7 : spectateur (pas inscrit, pas connecté, liste d'attente).
  if (!participating || !userId) {
    return (
      <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
        <MetaRow icon="play-circle-outline" iconColor={colors.tint}>
          <ThemedText type="smallBold">
            Tournoi en cours — ronde {currentRound?.number ?? 1} sur {tournament.rounds_count}
          </ThemedText>
        </MetaRow>
        {scenario}
        {footer}
      </View>
    );
  }

  // État 3 : j'ai le bye — fond neutre, mécanique expliquée sans jugement.
  if (myPairing && myPairing.player_b_id === null) {
    return (
      <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
        {surTitre}
        {scenario}
        <View style={styles.byeRow}>
          <Ionicons name="cafe-outline" size={28} color={colors.textSecondary} />
          <View style={styles.byeTexts}>
            <ThemedText style={styles.byeTitle}>Tu as le bye à cette ronde</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Nombre impair de joueurs : pas d’adversaire ce tour-ci. Tu remportes la ronde{' '}
              {score(15, 5)}.
            </ThemedText>
          </View>
        </View>
        {footer}
      </View>
    );
  }

  // État 4 : le score de ma table est saisi.
  if (myPairing && myPairing.score_a !== null && myPairing.score_b !== null) {
    const iAmA = myPairing.player_a_id === userId;
    const mine = iAmA ? myPairing.score_a : myPairing.score_b;
    const theirs = iAmA ? myPairing.score_b : myPairing.score_a;
    const opponent = iAmA ? myPairing.player_b : myPairing.player_a;
    const outcome = mine === theirs ? 'Égalité' : mine > theirs ? 'Victoire' : 'Défaite';
    const outcomeColor =
      mine === theirs ? colors.text : mine > theirs ? GreenColor[mode] : RedColor[mode];
    const lastRound = currentRound?.number === tournament.rounds_count;
    return (
      <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
        {surTitre}
        <View style={styles.resultRow}>
          <ThemedText style={[styles.resultOutcome, { color: outcomeColor }]}>{outcome}</ThemedText>
          <ThemedText style={styles.resultScore}>{score(mine, theirs)}</ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          contre {opponent?.pseudo ?? 'ton adversaire'} · table {myPairing.table_number}
        </ThemedText>
        <MetaRow icon="hourglass-outline">
          <ThemedText type="small" themeColor="textSecondary">
            {lastRound ? 'En attente du classement final' : 'En attente de la ronde suivante'}
          </ThemedText>
        </MetaRow>
        {footer}
      </View>
    );
  }

  // État 2 : ronde en cours, je suis apparié — l'état principal, le seul doré.
  if (myPairing) {
    const iAmA = myPairing.player_a_id === userId;
    const opponent = iAmA ? myPairing.player_b : myPairing.player_a;
    const compact = width < 360;
    return (
      <View
        style={[
          styles.card,
          {
            backgroundColor: TintBackground[mode],
            borderWidth: 1,
            borderColor: TintBorder[mode],
          },
        ]}>
        {surTitre}
        {scenario}
        <View
          style={styles.matchRow}
          accessible
          accessibilityLabel={`Ronde ${currentRound?.number} sur ${tournament.rounds_count}. Table ${myPairing.table_number}. Contre ${opponent?.pseudo ?? 'adversaire inconnu'}${opponent?.faction_favorite ? `, ${opponent.faction_favorite}` : ''}.`}>
          <View style={styles.matchLeft}>
            <ThemedText style={[styles.matchLabel, { color: colors.textSecondary }]}>
              TABLE
            </ThemedText>
            <ThemedText
              maxFontSizeMultiplier={1.3}
              style={[
                styles.tableNumber,
                compact && styles.tableNumberCompact,
                { color: colors.text },
              ]}>
              {myPairing.table_number}
            </ThemedText>
          </View>
          <View style={[styles.matchDivider, { backgroundColor: TintDivider[mode] }]} />
          <View style={styles.matchRight}>
            <ThemedText style={[styles.matchLabel, { color: colors.textSecondary }]}>
              CONTRE
            </ThemedText>
            <ThemedText style={styles.opponentName} numberOfLines={2}>
              {opponent?.pseudo ?? 'Adversaire à venir'}
            </ThemedText>
            {opponent?.faction_favorite ? (
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {opponent.faction_favorite}
              </ThemedText>
            ) : null}
          </View>
        </View>
        {footer}
      </View>
    );
  }

  // Apparié nulle part (écarté au lancement, arrivé en cours de route) :
  // on retombe sur l'état spectateur.
  return (
    <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
      <MetaRow icon="play-circle-outline" iconColor={colors.tint}>
        <ThemedText type="smallBold">
          Tournoi en cours — ronde {currentRound?.number ?? 1} sur {tournament.rounds_count}
        </ThemedText>
      </MetaRow>
      <ThemedText type="small" themeColor="textSecondary">
        Tu n’as pas de table à cette ronde.
      </ThemedText>
      {scenario}
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  loading: {
    height: 152,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overline: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  divider: {
    height: 1,
    marginHorizontal: -Spacing.three,
    marginVertical: Spacing.one,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    minHeight: 48,
    borderRadius: Spacing.two,
  },
  freshness: {
    textAlign: 'center',
    marginTop: Spacing.one,
    fontSize: 12,
    lineHeight: 16,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  matchLeft: {
    minWidth: 88,
    alignItems: 'flex-start',
  },
  matchDivider: {
    width: 1,
    alignSelf: 'stretch',
    marginVertical: Spacing.one,
  },
  matchRight: {
    flex: 1,
  },
  matchLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 1,
  },
  tableNumber: {
    fontSize: 64,
    lineHeight: 68,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  tableNumberCompact: {
    fontSize: 52,
    lineHeight: 56,
  },
  opponentName: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  byeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  byeTexts: {
    flex: 1,
    gap: Spacing.half,
  },
  byeTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  resultOutcome: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '800',
  },
  resultScore: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  droppedTitle: {
    fontWeight: '600',
  },
  doneTitle: {
    fontWeight: '700',
  },
});
