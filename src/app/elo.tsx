import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  Colors,
  MaxContentWidth,
  OnTint,
  Spacing,
  TintBackground,
  TintBorder,
} from '@/constants/theme';
import { useSession } from '@/hooks/use-session';
import { supabase } from '@/lib/supabase';

type EloRow = {
  rank: number;
  player_id: string;
  pseudo: string;
  region: string | null;
  rating: number;
  games: number;
};

/**
 * Classement ELO national (US-11.1).
 *
 * Le seul classement du produit qui traverse les tournois. Il ne mesure qu'une
 * chose — qui bat qui — et l'écrit en clair : la marge d'un score dépend surtout
 * du scénario, et le différentiel a déjà sa place dans les départages d'un
 * tournoi.
 */
export default function EloScreen() {
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const colors = Colors[mode];
  const { session } = useSession();

  const [rows, setRows] = useState<EloRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setFailed(false);
    const { data, error } = await supabase.rpc('national_elo', { p_min_games: 5 });
    if (error) setFailed(true);
    else setRows((data as EloRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const myRank = rows.find((row) => row.player_id === session?.user.id);

  let content;
  if (loading) {
    content = (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.tint} />
      </View>
    );
  } else if (failed) {
    content = (
      <View style={styles.centered}>
        <Ionicons name="cloud-offline-outline" size={40} color={colors.textSecondary} />
        <ThemedText type="smallBold">Impossible de charger le classement</ThemedText>
        <Pressable style={styles.retry} onPress={load}>
          <ThemedText style={{ color: colors.tint }}>Réessayer</ThemedText>
        </Pressable>
      </View>
    );
  } else if (rows.length === 0) {
    content = (
      <View style={styles.centered}>
        <Ionicons name="trending-up-outline" size={40} color={colors.textSecondary} />
        <ThemedText type="smallBold" style={styles.centeredText}>
          Personne n’est encore classé
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
          Il faut cinq parties disputées en tournoi terminé pour apparaître. En dessous, ce ne
          serait pas un classement mais un tirage.
        </ThemedText>
      </View>
    );
  } else {
    content = (
      <FlatList
        data={rows}
        keyExtractor={(item) => item.player_id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.one }} />}
        ListHeaderComponent={
          <ThemedText type="small" themeColor="textSecondary" style={styles.intro}>
            Départ à 1000. Seules les parties de tournois individuels terminés comptent — le bye
            et les forfaits n’en sont pas. La marge du score n’entre pas en jeu : l’ELO mesure qui
            bat qui.
          </ThemedText>
        }
        renderItem={({ item }) => {
          const mine = item.player_id === session?.user.id;
          return (
            <View
              style={[
                styles.row,
                {
                  backgroundColor: mine ? TintBackground[mode] : colors.backgroundElement,
                  borderColor: mine ? TintBorder[mode] : 'transparent',
                },
              ]}>
              <View
                style={[
                  styles.rankBadge,
                  {
                    backgroundColor: item.rank <= 3 ? colors.tint : colors.backgroundSelected,
                  },
                ]}>
                <ThemedText
                  type="smallBold"
                  style={{ color: item.rank <= 3 ? OnTint[mode] : colors.textSecondary }}>
                  {item.rank}
                </ThemedText>
              </View>
              <View style={styles.identity}>
                <ThemedText type="smallBold" numberOfLines={1}>
                  {item.pseudo}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {item.region ?? 'Région non renseignée'} · {item.games} partie
                  {item.games > 1 ? 's' : ''}
                </ThemedText>
              </View>
              <ThemedText type="smallBold">{item.rating}</ThemedText>
            </View>
          );
        }}
      />
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/profil'))}
            style={styles.backButton}
            accessibilityLabel="Retour">
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <View style={styles.headerTexts}>
            <ThemedText type="default" style={styles.headerTitle}>
              Classement national
            </ThemedText>
            {myRank ? (
              <ThemedText type="small" themeColor="textSecondary">
                Tu es {myRank.rank}e avec {myRank.rating} points
              </ThemedText>
            ) : null}
          </View>
        </View>
        {content}
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
  list: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.four },
  intro: { paddingBottom: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 64,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.two,
    borderWidth: 1,
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  centeredText: { textAlign: 'center' },
  retry: { minHeight: 44, justifyContent: 'center' },
});
