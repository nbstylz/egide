import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { EventCard } from '@/components/tournament-card';
import { BottomTabInset, Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import { useUpcomingEvents } from '@/hooks/use-tournaments';

export default function EvenementsScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { events, loading, refresh } = useUpcomingEvents();

  // Recharge quand on revient sur l'onglet (nouveaux tournois publiés).
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  let content;
  if (loading && events.length === 0) {
    content = (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.tint} />
      </View>
    );
  } else if (events.length === 0) {
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
  } else {
    content = (
      <FlatList
        data={events}
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
        {content}
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
  list: {
    alignSelf: 'stretch',
  },
  listContent: {
    paddingBottom: Spacing.four,
  },
});
