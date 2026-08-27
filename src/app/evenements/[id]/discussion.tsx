import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ThreadView } from '@/components/thread-view';
import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import { useSession } from '@/hooks/use-session';
import { useThread } from '@/hooks/use-thread';
import { useTournamentDetail } from '@/hooks/use-tournament-detail';

export default function DiscussionTournoiScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { session } = useSession();
  const { tournament } = useTournamentDetail(id, session?.user.id);
  const thread = useThread(id, null);

  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/evenements/[id]', params: { id: id ?? '' } });
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.headerRow}>
          <Pressable onPress={leave} style={styles.backButton} accessibilityLabel="Retour">
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <View style={styles.headerTexts}>
            <ThemedText type="default" style={styles.headerTitle}>
              Discussion
            </ThemedText>
            {tournament ? (
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {tournament.name}
              </ThemedText>
            ) : null}
          </View>
        </View>

        <ThreadView
          messages={thread.messages}
          loading={thread.loading}
          failed={thread.failed}
          refresh={thread.refresh}
          post={thread.post}
          remove={thread.remove}
          report={thread.report}
          myId={session?.user.id}
          emptyText="Personne n’a encore écrit. Une question sur le covoiturage, l’horaire, la salle ?"
          audienceText="Visible par les inscrits et l’organisation."
          canWrite={tournament?.status !== 'cancelled'}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTexts: { flex: 1 },
  headerTitle: { fontSize: 20, fontWeight: '700' },
});
