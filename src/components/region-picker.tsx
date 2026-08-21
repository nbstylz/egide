import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
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
import { Regions, normalizeRegion } from '@/lib/regions';

type Props = {
  value: string;
  onChange: (region: string) => void;
  /** Message d'erreur affiché sous le champ, si la région manque. */
  error?: string | null;
  label?: string;
  disabled?: boolean;
};

/**
 * Sélecteur de région : une liste fermée, pas une saisie libre. Le champ
 * n'est pas modifiable au clavier — il ouvre une liste défilante avec
 * recherche, ce qui garantit que deux personnes désignant la même région
 * écrivent la même chose.
 */
export function RegionPicker({
  value,
  onChange,
  error,
  label = 'Région',
  disabled,
}: Props) {
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const colors = Colors[mode];
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const needle = normalizeRegion(search);
  const visible = needle
    ? Regions.filter((region) => normalizeRegion(region).includes(needle))
    : Regions;

  function select(region: string) {
    onChange(region);
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
        accessibilityLabel={value ? `Région : ${value}. Modifier` : 'Choisir une région'}
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
          {value || 'Choisir une région'}
        </ThemedText>
        <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
      </Pressable>
      {error ? (
        <ThemedText style={[styles.error, { color: RedColor[mode] }]}>{error}</ThemedText>
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
              <ThemedText style={styles.modalTitle}>Choisir une région</ThemedText>
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
                placeholder="Rechercher une région"
                placeholderTextColor={colors.textSecondary}
                value={search}
                onChangeText={setSearch}
                autoCorrect={false}
              />
            </View>

            <FlatList
              data={visible}
              keyExtractor={(item) => item}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.list}
              ItemSeparatorComponent={() => (
                <View style={[styles.separator, { backgroundColor: colors.backgroundSelected }]} />
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
                        borderWidth: 1,
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
                  Aucune région ne correspond à « {search.trim()} ».
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
  separator: {
    height: 1,
  },
  empty: {
    textAlign: 'center',
    paddingVertical: Spacing.five,
  },
});
