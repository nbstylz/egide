import { StyleSheet, useColorScheme, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';
import type { FactionTally } from '@/hooks/use-player-history';

/**
 * Une faction jouée et son bilan.
 *
 * Non pressable : il n'y a rien à ouvrir, et simuler l'interactivité
 * décevrait. Aucune couleur verte ou rouge non plus — dans cette app le vert
 * est la couleur d'*une partie* gagnée ; un bilan de faction n'est ni bon ni
 * mauvais, il est ce qu'il est.
 *
 * Et surtout : que des entiers. Aucun pourcentage. Sur cinq parties, un
 * « 60 % de victoires » a un intervalle réel d'environ 15 % à 95 % — il
 * n'informe pas, il fait croire à une mesure.
 */
export function FactionRow({ tally }: { tally: FactionTally }) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const unknown = tally.faction === null;
  const name = tally.faction ?? 'Faction non renseignée';

  return (
    <View
      accessibilityLabel={
        `${name} : ${tally.tournaments} tournoi${tally.tournaments > 1 ? 's' : ''}, ` +
        `${tally.played} partie${tally.played > 1 ? 's' : ''}, ` +
        `${tally.wins} victoire${tally.wins > 1 ? 's' : ''}, ` +
        `${tally.draws} nul${tally.draws > 1 ? 's' : ''}, ` +
        `${tally.losses} défaite${tally.losses > 1 ? 's' : ''}.`
      }
      style={[
        styles.row,
        unknown
          ? { borderColor: colors.backgroundSelected }
          : { backgroundColor: colors.backgroundElement, borderColor: 'transparent' },
      ]}>
      <ThemedText
        style={[styles.name, unknown && { color: colors.textSecondary, fontWeight: '600' }]}
        numberOfLines={1}>
        {name}
      </ThemedText>
      <View style={styles.tallies}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.counts}>
          {tally.tournaments} tournoi{tally.tournaments > 1 ? 's' : ''} · {tally.played} partie
          {tally.played > 1 ? 's' : ''}
        </ThemedText>
        <ThemedText style={styles.record}>
          {tally.wins} V · {tally.draws} N · {tally.losses} D
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    borderRadius: Spacing.two,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
  },
  tallies: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  counts: {
    flexShrink: 1,
    fontVariant: ['tabular-nums'],
  },
  record: {
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
