import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  SectionList,
  StyleSheet,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  Colors,
  MaxContentWidth,
  RedColor,
  Spacing,
  TintBackground,
  TintBorder,
} from '@/constants/theme';
import { AllianceLabels, FactionsByAlliance, normalizeFaction } from '@/lib/factions';

type Props = {
  value: string;
  onChange: (faction: string) => void;
  error?: string | null;
  label?: string;
  disabled?: boolean;
  /** Phrase affichée sous le champ, pour dire à quoi sert la saisie. */
  hint?: string | null;
};

/**
 * Sélecteur de faction : une liste fermée, sur le modèle du sélecteur de
 * région. La faction était saisie librement, ce qui rendait tout
 * regroupement faux — « nighthaunt » et « Nighthaunt » ne se rencontraient
 * jamais. Le champ n'est plus modifiable au clavier.
 *
 * Les factions sont groupées par Grande Alliance : c'est ainsi qu'un joueur
 * les cherche, et cela rend évident où insérer un futur battletome.
 */
export function FactionPicker({
  value,
  onChange,
  error,
  label = 'Faction',
  disabled,
  hint,
}: Props) {
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const colors = Colors[mode];
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const sections = useMemo(() => {
    const needle = normalizeFaction(search);
    return (Object.keys(FactionsByAlliance) as (keyof typeof FactionsByAlliance)[])
      .map((alliance) => ({
        title: AllianceLabels[alliance],
        data: needle
          ? FactionsByAlliance[alliance].filter((faction) =>
              normalizeFaction(faction).includes(needle)
            )
          : [...FactionsByAlliance[alliance]],
      }))
      .filter((section) => section.data.length > 0);
  }, [search]);

  function select(faction: string) {
    onChange(faction);
    setOpen(false);
    setSearch('');
  }

  return (
    <View style={styles.field}>
      <ThemedText type="small">{label}</ThemedText>
      <Pressable
        disabled={disabled}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={value ? `Faction : ${value}. Modifier` : 'Choisir une faction'}
        style={({ pressed }) => [
          styles.input,
          {
            backgroundColor: colors.backgroundElement,
            borderColor: error ? RedColor[mode] : colors.backgroundSelected,
            opacity: pressed || disabled ? 0.8 : 1,
          },
        ]}>
        <ThemedText
          style={[styles.value, !value && { color: colors.textSecondary }]}
          numberOfLines={1}>
          {value || 'Choisir une faction'}
        </ThemedText>
        <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
      </Pressable>
      {error ? (
        <ThemedText style={[styles.error, { color: RedColor[mode] }]}>{error}</ThemedText>
      ) : null}
      {hint && !error ? (
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      ) : null}

      {/* Monté seulement quand il faut : sur React Native Web, un Modal déjà
          monté ne disparaît pas quand `visible` repasse à faux. */}
      {open ? (
        <Modal
          visible
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setOpen(false)}>
          <ThemedView style={styles.modal}>
            <SafeAreaView style={styles.modalSafe}>
              <View style={styles.modalHeader}>
                <ThemedText style={styles.modalTitle}>Choisir une faction</ThemedText>
                <Pressable
                  onPress={() => setOpen(false)}
                  accessibilityLabel="Fermer"
                  style={styles.closeButton}>
                  <Ionicons name="close" size={24} color={colors.text} />
                </Pressable>
              </View>

              <View style={[styles.searchBox, { backgroundColor: colors.backgroundElement }]}>
                <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
                <TextInput
                  style={[styles.searchInput, { color: colors.text }]}
                  placeholder="Rechercher une faction"
                  placeholderTextColor={colors.textSecondary}
                  value={search}
                  onChangeText={setSearch}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
              </View>

              <SectionList
                sections={sections}
                keyExtractor={(item) => item}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.list}
                stickySectionHeadersEnabled={false}
                renderSectionHeader={({ section }) => (
                  <ThemedText
                    type="small"
                    style={[styles.sectionHeader, { color: colors.tint }]}>
                    {section.title.toUpperCase()}
                  </ThemedText>
                )}
                renderItem={({ item }) => {
                  const selected = item === value;
                  return (
                    <Pressable
                      onPress={() => select(item)}
                      accessibilityRole="button"
                      style={({ pressed }) => [
                        styles.row,
                        selected && {
                          backgroundColor: TintBackground[mode],
                          borderColor: TintBorder[mode],
                        },
                        pressed && !selected && { backgroundColor: colors.backgroundElement },
                      ]}>
                      <ThemedText type={selected ? 'smallBold' : 'small'} style={styles.rowText}>
                        {item}
                      </ThemedText>
                      {selected ? (
                        <Ionicons name="checkmark" size={18} color={colors.tint} />
                      ) : null}
                    </Pressable>
                  );
                }}
                ListEmptyComponent={
                  <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                    Aucune faction ne correspond à «&nbsp;{search.trim()}&nbsp;».
                  </ThemedText>
                }
              />
            </SafeAreaView>
          </ThemedView>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: Spacing.one,
  },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    borderRadius: Spacing.two,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    minHeight: 52,
  },
  value: {
    flex: 1,
    fontSize: 16,
  },
  error: {
    fontSize: 13,
    lineHeight: 18,
  },
  modal: {
    flex: 1,
  },
  modalSafe: {
    flex: 1,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.three,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -Spacing.two,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    minHeight: 48,
    marginBottom: Spacing.two,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: Spacing.two,
  },
  list: {
    paddingBottom: Spacing.six,
  },
  sectionHeader: {
    fontWeight: '700',
    letterSpacing: 0.6,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    minHeight: 52,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  rowText: {
    flex: 1,
    fontSize: 16,
  },
  empty: {
    textAlign: 'center',
    paddingVertical: Spacing.five,
  },
});
