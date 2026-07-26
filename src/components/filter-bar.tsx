import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';

type BarProps = {
  /** Nombre de catégories filtrées (0 = aucun filtre). */
  activeCount: number;
  resultCount: number;
  totalCount: number;
  onPress: () => void;
};

/** Ligne d'accès aux filtres + compteur de résultats. */
export function FilterBar({ activeCount, resultCount, totalCount, onPress }: BarProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const active = activeCount > 0;

  const label = active
    ? `${resultCount} sur ${totalCount} ${totalCount > 1 ? 'événements' : 'événement'}`
    : `${totalCount} ${totalCount > 1 ? 'événements' : 'événement'}`;

  return (
    <View style={styles.bar}>
      <Pressable
        onPress={onPress}
        accessibilityLabel={
          active
            ? `Filtrer les événements, ${activeCount} ${activeCount > 1 ? 'filtres actifs' : 'filtre actif'}`
            : 'Filtrer les événements'
        }
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: pressed ? colors.backgroundSelected : colors.backgroundElement,
          },
          active && { borderWidth: 1, borderColor: colors.tint },
        ]}>
        <Ionicons
          name="options-outline"
          size={18}
          color={active ? colors.tint : colors.text}
        />
        <ThemedText type="smallBold" style={active ? { color: colors.tint } : null}>
          Filtrer
        </ThemedText>
        {active ? (
          <View style={[styles.counter, { backgroundColor: colors.tint }]}>
            {/* Texte sur fond doré : la couleur de fond du thème assure le contraste
                en clair (blanc) comme en sombre (noir). */}
            <ThemedText style={[styles.counterText, { color: colors.background }]}>
              {activeCount}
            </ThemedText>
          </View>
        ) : null}
      </Pressable>

      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

type ChipsProps = {
  chips: { label: string; onRemove: () => void }[];
};

/** Chips des filtres actifs : un tap retire le critère. */
export function ActiveFilterChips({ chips }: ChipsProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  if (chips.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.chipsScroll}
      contentContainerStyle={styles.chipsContent}>
      {chips.map((chip) => (
        <Pressable
          key={chip.label}
          onPress={chip.onRemove}
          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          accessibilityLabel={`Retirer le filtre ${chip.label}`}
          style={[styles.chip, { backgroundColor: colors.backgroundSelected }]}>
          <ThemedText type="small">{chip.label}</ThemedText>
          <Ionicons name="close" size={14} color={colors.textSecondary} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    marginBottom: Spacing.two,
    alignSelf: 'stretch',
  },
  button: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
  counter: {
    width: 20,
    height: 20,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  counterText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  chipsScroll: {
    alignSelf: 'stretch',
    marginBottom: Spacing.two,
    flexGrow: 0,
  },
  chipsContent: {
    gap: Spacing.two,
    alignItems: 'center',
  },
  chip: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.two,
    borderRadius: 999,
  },
});
