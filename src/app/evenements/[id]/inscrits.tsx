import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SectionList,
  StyleSheet,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlayerRow } from '@/components/player-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import { useSession } from '@/hooks/use-session';
import { useTournamentDetail, type RegistrationRow } from '@/hooks/use-tournament-detail';

/** Au-delà de ce nombre d'inscrits, on propose une recherche. */
const SearchThreshold = 25;

export default function InscritsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const { session } = useSession();
  const { tournament, loading, registered, waitlisted } = useTournamentDetail(
    id,
    session?.user.id
  );

  const [search, setSearch] = useState('');

  // La position dans la file est calculée avant tout filtrage : elle ne doit
  // pas changer parce qu'on cherche un nom.
  const waitlistPositions = useMemo(() => {
    const map = new Map<string, number>();
    waitlisted.forEach((registration, index) => map.set(registration.id, index + 1));
    return map;
  }, [waitlisted]);

  const sections = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const matches = (registration: RegistrationRow) => {
      if (!needle) return true;
      const pseudo = registration.profile?.pseudo?.toLowerCase() ?? '';
      const faction = registration.faction?.toLowerCase() ?? '';
      return pseudo.includes(needle) || faction.includes(needle);
    };

    const result = [
      { key: 'registered', title: `Inscrits (${registered.length})`, data: registered.filter(matches) },
    ];
    if (waitlisted.length > 0) {
      result.push({
        key: 'waitlist',
        title: `Liste d’attente (${waitlisted.length})`,
        data: waitlisted.filter(matches),
      });
    }
    return result.filter((section) => section.data.length > 0);
  }, [registered, waitlisted, search]);

  const total = registered.length + waitlisted.length;

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
          <View style={styles.headerTexts}>
            <ThemedText type="default" style={styles.headerTitle}>
              Inscrits
            </ThemedText>
            {tournament ? (
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {tournament.name}
              </ThemedText>
            ) : null}
          </View>
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.tint} />
          </View>
        ) : (
          <>
            {total > SearchThreshold ? (
              <View
                style={[styles.searchBox, { backgroundColor: colors.backgroundElement }]}>
                <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
                <TextInput
                  style={[styles.searchInput, { color: colors.text }]}
                  placeholder="Rechercher un joueur"
                  placeholderTextColor={colors.textSecondary}
                  value={search}
                  onChangeText={setSearch}
                  autoCorrect={false}
                />
              </View>
            ) : null}

            <SectionList
              sections={sections}
              keyExtractor={(item) => item.id}
              stickySectionHeadersEnabled
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.listContent}
              renderSectionHeader={({ section }) => (
                <ThemedText
                  type="smallBold"
                  style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
                  {section.title}
                </ThemedText>
              )}
              renderItem={({ item, section }) => (
                <PlayerRow
                  registration={item}
                  isMe={item.player_id === session?.user.id}
                  waitlistPosition={
                    section.key === 'waitlist' ? waitlistPositions.get(item.id) : undefined
                  }
                  showCheckedIn={tournament?.status !== 'open'}
                />
              )}
              ItemSeparatorComponent={() => <View style={{ height: Spacing.two }} />}
              ListEmptyComponent={
                <View style={styles.centered}>
                  <Ionicons name="search-outline" size={40} color={colors.textSecondary} />
                  <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
                    {search
                      ? `Aucun joueur ne correspond à « ${search} ».`
                      : 'Aucun inscrit pour l’instant.'}
                  </ThemedText>
                </View>
              }
            />
          </>
        )}
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
  headerTexts: {
    flex: 1,
  },
  headerTitle: {
    fontWeight: '700',
    fontSize: 20,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 48,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    marginBottom: Spacing.three,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  listContent: {
    paddingBottom: Spacing.six,
  },
  sectionHeader: {
    paddingVertical: Spacing.two,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.six,
  },
  centeredText: {
    textAlign: 'center',
  },
});
