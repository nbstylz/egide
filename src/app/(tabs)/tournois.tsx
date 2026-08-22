import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
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

import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MyTournamentCard } from '@/components/tournament-card';
import { BottomTabInset, Colors, MaxContentWidth, OnTint, Spacing } from '@/constants/theme';
import { useMyTournaments } from '@/hooks/use-tournaments';
import { useSession } from '@/hooks/use-session';

function CreateButton({ onPress }: { onPress: () => void }) {
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const colors = Colors[mode];
  return (
    <Pressable
      style={({ pressed }) => [
        styles.createButton,
        { backgroundColor: colors.tint, opacity: pressed ? 0.8 : 1 },
      ]}
      onPress={onPress}>
      <Ionicons name="add-circle-outline" size={20} color={OnTint[mode]} />
      <ThemedText style={[styles.createButtonText, { color: OnTint[mode] }]}>Créer un tournoi</ThemedText>
    </Pressable>
  );
}

export default function TournoisScreen() {
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const colors = Colors[mode];
  const { session, loading: sessionLoading } = useSession();
  const { tournaments, loading, refresh } = useMyTournaments(session?.user.id);

  // Recharge la liste quand on revient sur l'onglet (ex. après une création).
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const goToCreate = () => router.push('/tournois/creer');

  let content;
  if (sessionLoading || (session && loading && tournaments.length === 0)) {
    content = (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.tint} />
      </View>
    );
  } else if (!session) {
    // État non connecté : hero centré + renvoi vers l'onglet Profil.
    content = (
      <View style={styles.centered}>
        <Ionicons name="trophy-outline" size={64} color={colors.tint} />
        <ThemedText type="title" style={styles.centeredText}>
          Mes tournois
        </ThemedText>
        <ThemedText style={styles.centeredText}>
          Connecte-toi pour créer et gérer tes tournois.
        </ThemedText>
        <Pressable
          style={({ pressed }) => [
            styles.signInButton,
            { backgroundColor: colors.tint, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={() => router.push('/profil')}>
          <ThemedText style={[styles.createButtonText, { color: OnTint[mode] }]}>Se connecter</ThemedText>
        </Pressable>
      </View>
    );
  } else if (tournaments.length === 0) {
    content = (
      <View style={styles.centered}>
        <Ionicons name="trophy-outline" size={64} color={colors.textSecondary} />
        <ThemedText style={styles.centeredText}>
          Tu n’as encore organisé aucun tournoi.
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
          Crée ton premier événement et ouvre les inscriptions.
        </ThemedText>
        <View style={styles.emptyButton}>
          <CreateButton onPress={goToCreate} />
        </View>
      </View>
    );
  } else {
    content = (
      <>
        <CreateButton onPress={goToCreate} />
        <FlatList
          data={tournaments}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MyTournamentCard
              tournament={item}
              onPress={() =>
                router.push({ pathname: '/evenements/[id]', params: { id: item.id } })
              }
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.two }} />}
          contentContainerStyle={styles.listContent}
          style={styles.list}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.tint} />
          }
        />
      </>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {session ? <ScreenHeader title="Mes tournois" subtitle="Les tournois que tu organises." /> : null}
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
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignSelf: 'stretch',
    marginBottom: Spacing.three,
  },
  createButtonText: {
    fontWeight: '600',
  },
  signInButton: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.five,
    alignItems: 'center',
  },
  emptyButton: {
    alignSelf: 'stretch',
    marginTop: Spacing.two,
  },
  list: {
    alignSelf: 'stretch',
  },
  listContent: {
    paddingBottom: Spacing.four,
  },
});
