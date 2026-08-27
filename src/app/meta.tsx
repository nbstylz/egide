import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

type MetaRowData = {
  faction: string;
  players: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  average_points: number;
  /** Null tant que l'échantillon ne porte pas de pourcentage. */
  win_rate: number | null;
  sample_sufficient: boolean;
};

type Coverage = {
  tournaments: number;
  games: number;
  players: number;
  first_event: string | null;
  last_event: string | null;
};

/** « depuis le 1er mars 2026 » à partir d'une date ISO. */
function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Statistiques méta par faction (US-11.3).
 *
 * C'est ici que revient le taux de victoire, écarté du profil parce qu'un
 * joueur ne dispute pas assez de parties pour qu'il veuille dire quelque chose.
 * À l'échelle de la communauté il peut enfin en dire — mais **la base décide**,
 * faction par faction : sous 30 parties, elle ne renvoie aucun taux, et
 * l'écran affiche les entiers en disant pourquoi.
 */
export default function MetaScreen() {
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const colors = Colors[mode];

  const [period, setPeriod] = useState('year');
  const [rows, setRows] = useState<MetaRowData[]>([]);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setFailed(false);
    const since =
      period === 'all'
        ? null
        : new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    const [stats, cover] = await Promise.all([
      supabase.rpc('faction_meta_stats', { p_since: since, p_region: null }),
      supabase.rpc('meta_coverage', { p_since: since, p_region: null }),
    ]);
    if (stats.error || cover.error) setFailed(true);
    else {
      setRows((stats.data as MetaRowData[]) ?? []);
      setCoverage(((cover.data as Coverage[]) ?? [])[0] ?? null);
    }
    setLoading(false);
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

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
        <ThemedText type="smallBold">Impossible de charger les statistiques</ThemedText>
        <Pressable style={styles.retry} onPress={load}>
          <ThemedText style={{ color: colors.tint }}>Réessayer</ThemedText>
        </Pressable>
      </View>
    );
  } else if (rows.length === 0) {
    content = (
      <View style={styles.centered}>
        <Ionicons name="bar-chart-outline" size={40} color={colors.textSecondary} />
        <ThemedText type="smallBold" style={styles.centeredText}>
          Pas encore de quoi mesurer
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
          Les statistiques se remplissent avec les tournois terminés dont les joueurs ont
          déclaré leur faction.
        </ThemedText>
      </View>
    );
  } else {
    const enough = rows.filter((row) => row.sample_sufficient).length;
    content = (
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Dire sur quoi reposent les chiffres : sans ce cadre, un tableau de
            pourcentages laisse croire à une mesure là où il y a deux tournois. */}
        {coverage ? (
          <View style={[styles.coverage, { backgroundColor: colors.backgroundElement }]}>
            <ThemedText type="small" themeColor="textSecondary">
              {coverage.tournaments} tournoi{coverage.tournaments > 1 ? 's' : ''} terminé
              {coverage.tournaments > 1 ? 's' : ''} · {coverage.games} partie
              {coverage.games > 1 ? 's' : ''} · {coverage.players} joueur
              {coverage.players > 1 ? 's' : ''}
              {coverage.first_event ? ` · depuis le ${longDate(coverage.first_event)}` : ''}
            </ThemedText>
            {enough < rows.length ? (
              <ThemedText type="small" themeColor="textSecondary">
                Le taux de victoire n’apparaît qu’au-delà de 30 parties : en dessous, il
                varierait trop pour vouloir dire quoi que ce soit.
              </ThemedText>
            ) : null}
          </View>
        ) : null}

        {rows.map((row) => (
          <View
            key={row.faction}
            style={[styles.row, { backgroundColor: colors.backgroundElement }]}>
            <View style={styles.identity}>
              <ThemedText type="smallBold" numberOfLines={1}>
                {row.faction}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {row.games} partie{row.games > 1 ? 's' : ''} · {row.players} joueur
                {row.players > 1 ? 's' : ''} · {row.average_points} pts en moyenne
              </ThemedText>
            </View>
            <View style={styles.numbers}>
              {row.win_rate !== null ? (
                <ThemedText type="smallBold">{row.win_rate.toLocaleString('fr-FR')} %</ThemedText>
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  —
                </ThemedText>
              )}
              <ThemedText type="small" themeColor="textSecondary">
                {row.wins} – {row.draws} – {row.losses}
              </ThemedText>
            </View>
          </View>
        ))}

        <ThemedText type="small" themeColor="textSecondary">
          Les tournois par équipes sont exclus : leurs appariements sont choisis par les
          capitaines, un taux de victoire y mesurerait autant leur flair que la force d’une
          faction. Le bye et les forfaits ne comptent pas comme des parties.
        </ThemedText>
      </ScrollView>
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
              Le méta
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Ce que jouent les autres, et comment ça se passe
            </ThemedText>
          </View>
        </View>

        <View style={styles.tabs}>
          <SegmentedControl
            value={period}
            onChange={setPeriod}
            options={[
              { value: 'year', label: '12 derniers mois' },
              { value: 'all', label: 'Depuis toujours' },
            ]}
          />
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
  tabs: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.two },
  scroll: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.four, gap: Spacing.two },
  coverage: { borderRadius: Spacing.two, padding: Spacing.two, gap: Spacing.half },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 64,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.two,
  },
  identity: { flex: 1 },
  numbers: { alignItems: 'flex-end' },
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
