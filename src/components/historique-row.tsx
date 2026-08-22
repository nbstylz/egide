import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, useColorScheme, View } from 'react-native';

import { MetaRow } from '@/components/meta-row';
import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing, TintBackground, TintBorder } from '@/constants/theme';
import type { HistoryLine } from '@/hooks/use-player-history';
import { ordinalFr } from '@/lib/ordinal';
import { formatEventDateShort } from '@/lib/tournaments';

/**
 * Une ligne d'historique : un tournoi disputé, son rang et son bilan.
 *
 * Volontairement pas une `EventCard` : celle-ci répond à « dois-je
 * m'inscrire ? » (places restantes, « Complet »), questions sans objet une
 * fois le tournoi joué — et trompeuses sur un événement de l'an dernier.
 *
 * Le détail des rondes n'est pas repris ici : il vit dans « Mon parcours »,
 * sur la fiche de l'événement, à un tap de là.
 */
export function HistoriqueRow({
  line,
  onPress,
}: {
  line: HistoryLine;
  onPress: () => void;
}) {
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const colors = Colors[mode];

  const won = !line.dropped && line.rank === 1;
  const topThree = !line.dropped && line.rank <= 3;

  // Le dénominateur recontextualise sans seuil arbitraire : un 3e sur 4 ne
  // doit pas ressembler à un 3e sur 40.
  const label =
    `${line.name}, ${formatEventDateShort(line.event_date)} à ${line.city}. ` +
    (line.dropped
      ? `Abandon. `
      : `${ordinalFr(line.rank)} sur ${line.field_size}. `) +
    `${line.wins} victoire${line.wins > 1 ? 's' : ''}, ${line.draws} nul${line.draws > 1 ? 's' : ''}, ` +
    `${line.losses} défaite${line.losses > 1 ? 's' : ''}, ${line.points_for} points.`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? colors.backgroundSelected : colors.backgroundElement,
        },
      ]}>
      <View
        style={[
          styles.rankBlock,
          {
            backgroundColor: won ? TintBackground[mode] : colors.backgroundSelected,
            borderColor: won ? TintBorder[mode] : 'transparent',
          },
        ]}>
        <ThemedText
          style={[styles.rankValue, { color: topThree ? colors.tint : colors.text }]}>
          {line.dropped ? '—' : ordinalFr(line.rank)}
        </ThemedText>
        {line.dropped ? null : (
          <ThemedText type="small" themeColor="textSecondary" style={styles.rankTotal}>
            / {line.field_size}
          </ThemedText>
        )}
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <ThemedText style={styles.title} numberOfLines={1}>
            {line.name}
          </ThemedText>
          {won ? <Ionicons name="trophy" size={14} color={colors.tint} /> : null}
        </View>

        <MetaRow icon="calendar-outline">
          <ThemedText type="smallBold">{formatEventDateShort(line.event_date)}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {'  ·  '}
            {line.city}
          </ThemedText>
        </MetaRow>

        <View style={styles.bilanRow}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.bilan}>
            {line.wins} V · {line.draws} N · {line.losses} D {'  ·  '} {line.points_for} pts
          </ThemedText>
          {/* Le rang après abandon n'est pas comparable : on le dit plutôt
              que de laisser croire à un classement ordinaire. */}
          {line.dropped ? (
            <View style={[styles.dropBadge, { backgroundColor: colors.backgroundSelected }]}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.dropText}>
                Abandon
              </ThemedText>
            </View>
          ) : null}
        </View>
      </View>

      <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  rankBlock: {
    width: 48,
    height: 48,
    borderRadius: Spacing.two,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankValue: {
    fontSize: 17,
    fontWeight: '700',
    // Sans chiffres tabulaires, les colonnes dansent d'une ligne à l'autre.
    fontVariant: ['tabular-nums'],
  },
  rankTotal: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  body: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  title: {
    fontWeight: '700',
    flexShrink: 1,
  },
  bilanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  bilan: {
    fontVariant: ['tabular-nums'],
  },
  dropBadge: {
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 1,
  },
  dropText: {
    fontSize: 11,
  },
});
