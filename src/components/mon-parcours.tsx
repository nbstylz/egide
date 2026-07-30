import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, useColorScheme, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, GreenColor, RedColor, Spacing } from '@/constants/theme';
import type { MyResult } from '@/hooks/use-my-pairing';

type Props = {
  results: MyResult[];
  /** Déplié d'office quand le tournoi est fini ou que le joueur a abandonné. */
  initiallyExpanded: boolean;
  droppedRound: number | null;
};

/**
 * Mes rondes passées, repliées par défaut le jour J : l'écran doit tenir en
 * un coup d'œil, l'historique est une consultation à froid. L'en-tête replié
 * porte quand même le bilan.
 */
export function MonParcours({ results, initiallyExpanded, droppedRound }: Props) {
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const colors = Colors[mode];
  const [expanded, setExpanded] = useState(initiallyExpanded);

  // Aucune ronde jouée : rien à raconter, la carte n'apparaît pas.
  if (results.length === 0) return null;

  const wins = results.filter((r) => r.outcome === 'win').length;
  const draws = results.filter((r) => r.outcome === 'draw').length;
  const losses = results.filter((r) => r.outcome === 'loss').length;
  const totalPoints = results.reduce((sum, r) => sum + r.points_for, 0);

  const outcomeColor = (outcome: MyResult['outcome']) =>
    outcome === 'win'
      ? GreenColor[mode]
      : outcome === 'loss'
        ? RedColor[mode]
        : colors.backgroundSelected;

  return (
    <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
      <Pressable
        onPress={() => setExpanded((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={styles.header}>
        <ThemedText type="smallBold">Mon parcours</ThemedText>
        <View style={styles.headerRight}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.tally}>
            {wins} V · {draws} N · {losses} D
          </ThemedText>
          <Ionicons
            name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'}
            size={18}
            color={colors.textSecondary}
          />
        </View>
      </Pressable>

      {expanded ? (
        <>
          {results.map((result) => (
            <View key={result.round_number}>
              <View style={[styles.separator, { backgroundColor: colors.backgroundSelected }]} />
              <View style={styles.line}>
                <View style={[styles.outcomeBar, { backgroundColor: outcomeColor(result.outcome) }]} />
                <ThemedText type="smallBold" themeColor="textSecondary" style={styles.roundNo}>
                  R{result.round_number}
                </ThemedText>
                {result.bye ? (
                  <ThemedText
                    type="small"
                    themeColor="textSecondary"
                    style={[styles.opponent, styles.byeText]}>
                    Bye — sans adversaire
                  </ThemedText>
                ) : (
                  <ThemedText type="small" numberOfLines={1} style={styles.opponent}>
                    {result.opponent_pseudo ?? 'Adversaire'}
                  </ThemedText>
                )}
                <ThemedText type="smallBold" style={styles.score}>
                  {result.points_for} – {result.points_against}
                </ThemedText>
              </View>
            </View>
          ))}

          <View style={[styles.separator, { backgroundColor: colors.backgroundSelected }]} />
          <ThemedText type="small" themeColor="textSecondary">
            {wins} {wins > 1 ? 'victoires' : 'victoire'} · {draws} {draws > 1 ? 'nuls' : 'nul'} ·{' '}
            {losses} {losses > 1 ? 'défaites' : 'défaite'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {totalPoints} points marqués
          </ThemedText>
          {droppedRound ? (
            <ThemedText type="small" themeColor="textSecondary">
              Abandon à la ronde {droppedRound} — les rondes suivantes ne sont pas comptées.
            </ThemedText>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  header: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  tally: {
    fontVariant: ['tabular-nums'],
  },
  separator: {
    height: 1,
    marginHorizontal: -Spacing.three,
    marginVertical: Spacing.one,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
  },
  outcomeBar: {
    width: 3,
    height: 28,
    borderRadius: 999,
  },
  roundNo: {
    width: 28,
  },
  opponent: {
    flex: 1,
  },
  byeText: {
    fontStyle: 'italic',
  },
  score: {
    fontVariant: ['tabular-nums'],
  },
});
