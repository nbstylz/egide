import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import type { TournamentWithCount } from '@/hooks/use-tournaments';
import { maskDateInput } from '@/lib/dates';
import {
  activeFilterCount,
  applyFilters,
  dateErrors,
  EmptyFilters,
  hasDateError,
  PeriodLabels,
  pointsOptions,
  regionOptions,
  type EventFilters,
  type PeriodKey,
  type TypeFilter,
} from '@/lib/event-filters';

const ErrorColor = { light: '#D14343', dark: '#FF6369' };
/** Au-delà, on propose un champ de recherche de région. */
const RegionSearchThreshold = 12;
const Periods: PeriodKey[] = ['upcoming', 'this_month', 'three_months', 'custom'];

type Props = {
  visible: boolean;
  events: TournamentWithCount[];
  filters: EventFilters;
  /**
   * Mise à jour fonctionnelle : deux sélections rapprochées ne peuvent pas
   * s'écraser l'une l'autre.
   */
  onChange: (update: (current: EventFilters) => EventFilters) => void;
  onClose: () => void;
  /** Région du profil, mise en avant si elle existe dans les données. */
  profileRegionKey?: string | null;
};

/** Modale plein écran de filtrage de l'annuaire. */
export function FiltersModal({
  visible,
  events,
  filters,
  onChange,
  onClose,
  profileRegionKey,
}: Props) {
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const colors = Colors[mode];
  const [regionSearch, setRegionSearch] = useState('');

  const regions = useMemo(() => regionOptions(events, filters), [events, filters]);
  const points = useMemo(() => pointsOptions(events, filters), [events, filters]);
  const results = useMemo(() => applyFilters(events, filters), [events, filters]);
  const errors = dateErrors(filters);
  const invalidDates = hasDateError(filters);
  const activeCount = activeFilterCount(filters);

  // La région du profil n'est mise en avant que si elle existe réellement.
  const myRegion = profileRegionKey
    ? regions.find((option) => option.key === profileRegionKey)
    : undefined;
  const otherRegions = regions.filter((option) => option.key !== myRegion?.key);

  const needle = regionSearch
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  const filterBySearch = (label: string) =>
    needle === '' ||
    label
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .includes(needle);

  function toggleRegion(key: string) {
    onChange((current) => ({
      ...current,
      regions: current.regions.includes(key)
        ? current.regions.filter((r) => r !== key)
        : [...current.regions, key],
    }));
  }

  function togglePoints(value: number) {
    onChange((current) => ({
      ...current,
      points: current.points.includes(value)
        ? current.points.filter((p) => p !== value)
        : [...current.points, value],
    }));
  }

  /** Chip générique : libellé + compteur, avec état sélectionné et désactivé. */
  function Chip({
    label,
    count,
    selected,
    onPress,
  }: {
    label: string;
    count?: number;
    selected: boolean;
    onPress: () => void;
  }) {
    const disabled = count === 0 && !selected;
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        style={[
          styles.chip,
          { backgroundColor: colors.backgroundElement },
          selected && { borderWidth: 1, borderColor: colors.tint },
          disabled && { opacity: 0.4 },
        ]}>
        {selected ? <Ionicons name="checkmark" size={14} color={colors.tint} /> : null}
        <ThemedText
          type={selected ? 'smallBold' : 'small'}
          style={selected ? { color: colors.tint } : null}>
          {label}
          {count !== undefined ? ` (${count})` : ''}
        </ThemedText>
      </Pressable>
    );
  }

  let ctaLabel = `Voir les ${results.length} résultats`;
  if (invalidDates) ctaLabel = 'Corrige les dates';
  else if (results.length === 0) ctaLabel = 'Aucun résultat';
  else if (results.length === 1) ctaLabel = 'Voir le résultat';

  const ctaDisabled = invalidDates || results.length === 0;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          {/* En-tête */}
          <View style={styles.header}>
            <Pressable
              onPress={onClose}
              style={styles.closeButton}
              accessibilityLabel="Fermer les filtres">
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
            <ThemedText style={styles.headerTitle}>Filtres</ThemedText>
            <Pressable
              onPress={() => onChange(() => EmptyFilters)}
              disabled={activeCount === 0}
              style={styles.resetButton}>
              <ThemedText
                type="small"
                style={{
                  color: activeCount === 0 ? colors.textSecondary : colors.tint,
                  opacity: activeCount === 0 ? 0.5 : 1,
                }}>
                Réinitialiser
              </ThemedText>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {/* Région */}
            <View style={styles.section}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.sectionTitle}>
                Région
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Régions telles qu’elles ont été saisies par les organisateurs.
              </ThemedText>

              {regions.length > RegionSearchThreshold ? (
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: colors.backgroundElement,
                      color: colors.text,
                      borderColor: colors.backgroundSelected,
                    },
                  ]}
                  placeholder="Rechercher une région"
                  placeholderTextColor={colors.textSecondary}
                  value={regionSearch}
                  onChangeText={setRegionSearch}
                />
              ) : null}

              {myRegion && filterBySearch(myRegion.label) ? (
                <>
                  <ThemedText type="small" themeColor="textSecondary">
                    Ta région
                  </ThemedText>
                  <View style={styles.chipRow}>
                    <Chip
                      label={myRegion.label}
                      count={myRegion.count}
                      selected={filters.regions.includes(myRegion.key)}
                      onPress={() => toggleRegion(myRegion.key)}
                    />
                  </View>
                  <View
                    style={[styles.separator, { backgroundColor: colors.backgroundSelected }]}
                  />
                  <ThemedText type="small" themeColor="textSecondary">
                    Toutes les régions
                  </ThemedText>
                </>
              ) : null}

              <View style={styles.chipRow}>
                {otherRegions
                  .filter((option) => filterBySearch(option.label))
                  .map((option) => (
                    <Chip
                      key={option.key}
                      label={option.label}
                      count={option.count}
                      selected={filters.regions.includes(option.key)}
                      onPress={() => toggleRegion(option.key)}
                    />
                  ))}
              </View>
            </View>

            {/* Période */}
            <View style={styles.section}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.sectionTitle}>
                Période
              </ThemedText>
              <View style={styles.chipRow}>
                {Periods.map((period) => (
                  <Chip
                    key={period}
                    label={PeriodLabels[period]}
                    selected={filters.period === period}
                    onPress={() =>
                      onChange((current) => ({
                        ...current,
                        period,
                        ...(period === 'custom' ? {} : { from: '', to: '' }),
                      }))
                    }
                  />
                ))}
              </View>

              {filters.period === 'custom' ? (
                <>
                  <View style={styles.dateRow}>
                    <View style={styles.dateField}>
                      <ThemedText type="small">À partir du</ThemedText>
                      <TextInput
                        style={[
                          styles.input,
                          {
                            backgroundColor: colors.backgroundElement,
                            color: colors.text,
                            borderColor: errors.from
                              ? ErrorColor[mode]
                              : colors.backgroundSelected,
                          },
                        ]}
                        placeholder="JJ/MM/AAAA"
                        placeholderTextColor={colors.textSecondary}
                        keyboardType="number-pad"
                        maxLength={10}
                        value={filters.from}
                        onChangeText={(text) =>
                          onChange((current) => ({ ...current, from: maskDateInput(text) }))
                        }
                      />
                    </View>
                    <View style={styles.dateField}>
                      <ThemedText type="small">Jusqu’au</ThemedText>
                      <TextInput
                        style={[
                          styles.input,
                          {
                            backgroundColor: colors.backgroundElement,
                            color: colors.text,
                            borderColor: errors.to ? ErrorColor[mode] : colors.backgroundSelected,
                          },
                        ]}
                        placeholder="JJ/MM/AAAA"
                        placeholderTextColor={colors.textSecondary}
                        keyboardType="number-pad"
                        maxLength={10}
                        value={filters.to}
                        onChangeText={(text) =>
                          onChange((current) => ({ ...current, to: maskDateInput(text) }))
                        }
                      />
                    </View>
                  </View>
                  {errors.from ? (
                    <ThemedText type="small" style={{ color: ErrorColor[mode] }}>
                      {errors.from}
                    </ThemedText>
                  ) : null}
                  {errors.to ? (
                    <ThemedText type="small" style={{ color: ErrorColor[mode] }}>
                      {errors.to}
                    </ThemedText>
                  ) : null}
                  <ThemedText type="small" themeColor="textSecondary">
                    Laisse un champ vide pour ne pas borner de ce côté.
                  </ThemedText>
                </>
              ) : null}
            </View>

            {/* Format */}
            <View style={styles.section}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.sectionTitle}>
                Format
              </ThemedText>
              <View style={styles.chipRow}>
                {points.map((option) => (
                  <Chip
                    key={option.value}
                    label={`${option.value} pts`}
                    count={option.count}
                    selected={filters.points.includes(option.value)}
                    onPress={() => togglePoints(option.value)}
                  />
                ))}
              </View>
            </View>

            {/* Type */}
            <View style={styles.section}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.sectionTitle}>
                Type
              </ThemedText>
              <SegmentedControl
                value={filters.type}
                onChange={(value) =>
                  onChange((current) => ({ ...current, type: value as TypeFilter }))
                }
                options={[
                  { value: 'all', label: 'Tous' },
                  { value: 'individual', label: 'Individuel' },
                  { value: 'team', label: 'Équipe' },
                ]}
              />
            </View>
          </ScrollView>

          {/* Pied collant */}
          <View style={[styles.footer, { borderTopColor: colors.backgroundSelected }]}>
            <Pressable
              onPress={onClose}
              disabled={ctaDisabled}
              style={({ pressed }) => [
                styles.cta,
                {
                  backgroundColor: colors.tint,
                  opacity: ctaDisabled ? 0.5 : pressed ? 0.8 : 1,
                },
              ]}>
              <ThemedText style={styles.ctaText}>{ctaLabel}</ThemedText>
            </Pressable>
            {results.length === 0 && !invalidDates ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.ctaHint}>
                Élargis tes filtres ou réinitialise.
              </ThemedText>
            ) : null}
          </View>
        </SafeAreaView>
      </ThemedView>
    </Modal>
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
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -Spacing.two,
  },
  headerTitle: {
    flex: 1,
    marginLeft: Spacing.two,
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '700',
  },
  resetButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
  body: {
    paddingBottom: Spacing.four,
    gap: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  sectionTitle: {
    textTransform: 'uppercase',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
  },
  input: {
    borderRadius: Spacing.two,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  dateRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  dateField: {
    flex: 1,
    gap: Spacing.one,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.three,
    gap: Spacing.two,
  },
  cta: {
    minHeight: 52,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  ctaHint: {
    textAlign: 'center',
  },
});
