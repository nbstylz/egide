import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActiveFilterChips, FilterBar } from '@/components/filter-bar';
import { FiltersModal } from '@/components/filters-modal';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { EventCard } from '@/components/tournament-card';
import { BottomTabInset, Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import { useEventFilters } from '@/hooks/use-event-filters';
import { useProfile } from '@/hooks/use-profile';
import { useSession } from '@/hooks/use-session';
import { useUpcomingEvents } from '@/hooks/use-tournaments';
import {
  activeFilterChips,
  activeFilterCount,
  applyFilters,
  regionKey,
} from '@/lib/event-filters';

export default function EvenementsScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  // « Passés » change la requête elle-même (statut terminé, tri inverse) :
  // on reflète la période des filtres dans un état dédié.
  const [past, setPast] = useState(false);
  const { events, loading, refresh } = useUpcomingEvents(past);
  const { session } = useSession();
  const { profile } = useProfile(session?.user.id);
  const { filters, setFilters, persist, reset } = useEventFilters(events);
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    setPast(filters.period === 'past');
  }, [filters.period]);

  // Recharge quand on revient sur l'onglet (nouveaux tournois publiés).
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const visibleEvents = useMemo(() => applyFilters(events, filters), [events, filters]);
  const chips = useMemo(
    () =>
      activeFilterChips(events, filters).map((chip) => ({
        label: chip.label,
        onRemove: () => {
          const next = chip.remove(filters);
          setFilters(next);
          persist(next);
        },
      })),
    [events, filters, setFilters, persist]
  );
  const activeCount = activeFilterCount(filters);

  function closeFilters() {
    setFiltersOpen(false);
    persist(filters);
  }

  let content;
  if (loading && events.length === 0) {
    content = (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.tint} />
      </View>
    );
  } else if (events.length === 0) {
    // Vide global : rien à filtrer, la barre reste masquée.
    content = (
      <View style={styles.centered}>
        <Ionicons name="calendar-outline" size={64} color={colors.textSecondary} />
        <ThemedText style={styles.centeredText}>
          Aucun tournoi à venir pour le moment.
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
          Reviens bientôt, ou{' '}
          <ThemedText
            type="small"
            style={{ color: colors.tint }}
            onPress={() => router.push('/tournois')}>
            organise le tien
          </ThemedText>{' '}
          depuis l’onglet Tournois.
        </ThemedText>
      </View>
    );
  } else if (visibleEvents.length === 0) {
    // Vide filtré : on garde barre et chips, qui expliquent la situation.
    content = (
      <View style={styles.centered}>
        <Ionicons name="funnel-outline" size={64} color={colors.textSecondary} />
        <ThemedText style={styles.centeredText}>
          Aucun événement ne correspond à tes filtres.
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
          Filtres actifs : {chips.map((chip) => chip.label).join(' · ')}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
          {events.length} {events.length > 1 ? 'événements sont disponibles' : 'événement est disponible'}{' '}
          sans filtre.
        </ThemedText>
        <Pressable
          onPress={reset}
          style={({ pressed }) => [
            styles.resetButton,
            { backgroundColor: colors.backgroundElement, opacity: pressed ? 0.8 : 1 },
          ]}>
          <ThemedText>Réinitialiser les filtres</ThemedText>
        </Pressable>
        <Pressable onPress={() => setFiltersOpen(true)} style={styles.modifyLink}>
          <ThemedText type="small" style={{ color: colors.tint }}>
            Modifier les filtres
          </ThemedText>
        </Pressable>
      </View>
    );
  } else {
    content = (
      <FlatList
        data={visibleEvents}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <EventCard
            tournament={item}
            onPress={() => router.push({ pathname: '/evenements/[id]', params: { id: item.id } })}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.two }} />}
        contentContainerStyle={styles.listContent}
        style={styles.list}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.tint} />
        }
      />
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="Événements" subtitle="Les tournois ouverts aux inscriptions." />
        {events.length > 0 ? (
          <>
            <FilterBar
              activeCount={activeCount}
              resultCount={visibleEvents.length}
              totalCount={events.length}
              onPress={() => setFiltersOpen(true)}
            />
            <ActiveFilterChips chips={chips} />
          </>
        ) : null}
        {content}
      </SafeAreaView>

      <FiltersModal
        visible={filtersOpen}
        events={events}
        filters={filters}
        onChange={setFilters}
        onClose={closeFilters}
        profileRegionKey={profile?.region ? regionKey(profile.region) : null}
      />
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
    paddingTop: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  centeredText: {
    textAlign: 'center',
  },
  resetButton: {
    minHeight: 52,
    borderRadius: Spacing.two,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modifyLink: {
    minHeight: 44,
    justifyContent: 'center',
  },
  list: {
    alignSelf: 'stretch',
  },
  listContent: {
    paddingBottom: Spacing.four,
  },
});
