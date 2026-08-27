import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
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

import { FactionRow } from '@/components/faction-row';
import { HistoriqueRow } from '@/components/historique-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  Colors,
  MaxContentWidth,
  OnTint,
  Spacing,
  TintBackground,
  TintBorder,
  type ThemeColor,
} from '@/constants/theme';
import {
  summarize,
  summarizeByFaction,
  usePlayerHistory,
  type HistoryLine,
} from '@/hooks/use-player-history';
import { useSession } from '@/hooks/use-session';
import { ordinalFr } from '@/lib/ordinal';
import { formatEventDateShort } from '@/lib/tournaments';

/** Au-delà, un tournoi « en cours » n'est plus en cours : il n'a pas été clôturé. */
const StillRunningDays = 2;

export default function HistoriqueScreen() {
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const colors = Colors[mode];
  const { session } = useSession();
  const { history, loading, failed, refresh } = usePlayerHistory(session?.user.id);

  // Un tournoi encore en cours n'a pas de rang définitif : le montrer comme
  // un résultat créerait des réclamations le lendemain. Il va en tête, à part.
  const { running, finished } = useMemo(() => {
    const limit = Date.now() - StillRunningDays * 24 * 60 * 60 * 1000;
    const runningLines: HistoryLine[] = [];
    const finishedLines: HistoryLine[] = [];
    for (const line of history) {
      if (line.status === 'in_progress') {
        if (new Date(`${line.event_date}T00:00:00`).getTime() >= limit) runningLines.push(line);
        // Au-delà du délai, l'organisateur a simplement oublié de clôturer :
        // on n'épingle pas ce tournoi en tête indéfiniment, et on ne lui
        // invente pas un classement.
      } else {
        finishedLines.push(line);
      }
    }
    return { running: runningLines, finished: finishedLines };
  }, [history]);

  const summary = useMemo(() => summarize(finished), [finished]);

  /** Piège maison : `router.back()` échoue sur un écran ouvert par lien direct. */
  function leave() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profil');
  }

  const header = (
    <View style={styles.headerRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Retour"
        onPress={leave}
        style={styles.backButton}>
        <Ionicons name="chevron-back" size={24} color={colors.text} />
      </Pressable>
      <View style={styles.headerTexts}>
        <ThemedText style={styles.headerTitle}>Mon historique</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Tes tournois terminés
        </ThemedText>
      </View>
    </View>
  );

  let body;
  if (loading && history.length === 0) {
    body = (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.tint} />
      </View>
    );
  } else if (failed) {
    body = (
      <View style={styles.centered}>
        <Ionicons name="cloud-offline-outline" size={40} color={colors.textSecondary} />
        <ThemedText type="smallBold" style={styles.centeredText}>
          Impossible de charger ton historique
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
          Vérifie ta connexion, puis réessaie.
        </ThemedText>
        {/* En salle de tournoi le réseau tombe : le bouton doit être large. */}
        <Pressable
          onPress={refresh}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.backgroundElement, opacity: pressed ? 0.8 : 1 },
          ]}>
          <ThemedText>Réessayer</ThemedText>
        </Pressable>
      </View>
    );
  } else if (finished.length === 0 && running.length === 0) {
    body = (
      <View style={styles.centered}>
        <Ionicons name="trophy-outline" size={64} color={colors.textSecondary} />
        <ThemedText type="smallBold" style={styles.centeredText}>
          Ton historique est encore vide
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
          Tes résultats apparaîtront ici dès qu’un tournoi auquel tu as participé sera terminé.
        </ThemedText>
        <Pressable
          onPress={() => router.replace('/(tabs)')}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.tint, opacity: pressed ? 0.8 : 1 },
          ]}>
          <ThemedText style={{ color: OnTint[mode], fontWeight: '600' }}>
            Voir les événements
          </ThemedText>
        </Pressable>
      </View>
    );
  } else {
    body = (
      <FlatList
        data={finished}
        keyExtractor={(item) => item.tournament_id}
        renderItem={({ item }) => (
          <HistoriqueRow
            line={item}
            onPress={() =>
              router.push({
                pathname: '/evenements/[id]',
                params: { id: item.tournament_id },
              })
            }
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.two }} />}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            {running.map((line) => (
              <RunningCard key={line.tournament_id} line={line} mode={mode} colors={colors} />
            ))}
            {finished.length > 0 ? (
              <View style={styles.tiles}>
                <Tile
                  value={String(summary.tournaments)}
                  label={summary.tournaments > 1 ? 'tournois joués' : 'tournoi joué'}
                  colors={colors}
                />
                <Tile
                  value={`${summary.wins}·${summary.draws}·${summary.losses}`}
                  label="parties (V·N·D)"
                  colors={colors}
                />
                <Tile
                  value={summary.bestRank === null ? '—' : ordinalFr(summary.bestRank)}
                  label="meilleur résultat"
                  colors={colors}
                />
              </View>
            ) : null}
          </View>
        }
        ListFooterComponent={<FactionsSection lines={finished} colors={colors} />}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.tint} />
        }
      />
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {header}
        {body}
      </SafeAreaView>
    </ThemedView>
  );
}

/**
 * Les factions jouées, en pied de liste.
 *
 * En pied et non en tête : les tuiles du haut répondent à « où j'en suis »,
 * la faction à « avec quoi j'ai joué » — une question de fin de lecture, qui
 * n'a rien à faire dans le parcours d'un jour de tournoi.
 */
function FactionsSection({
  lines,
  colors,
}: {
  lines: HistoryLine[];
  colors: Record<ThemeColor, string>;
}) {
  const tallies = useMemo(() => summarizeByFaction(lines), [lines]);
  if (lines.length === 0) return null;

  const known = tallies.filter((tally) => tally.faction !== null);
  const covered = known.reduce((total, tally) => total + tally.tournaments, 0);

  return (
    <View style={styles.factions}>
      <ThemedText style={styles.sectionTitle}>Factions jouées</ThemedText>

      {known.length === 0 ? (
        <View style={[styles.factionEmpty, { backgroundColor: colors.backgroundElement }]}>
          <ThemedText type="small" themeColor="textSecondary">
            Aucune faction enregistrée pour l’instant. Indique la faction jouée sur la fiche
            d’un tournoi, section « Ma préparation » : ce bloc se remplira.
          </ThemedText>
        </View>
      ) : (
        <>
          {/* Ne rien dire quand la couverture est totale : une précision
              inutile ressemble à un avertissement. */}
          {covered < lines.length ? (
            <ThemedText type="small" themeColor="textSecondary">
              Basé sur {covered} de tes {lines.length} tournois.
            </ThemedText>
          ) : null}
          {tallies.map((tally) => (
            <FactionRow key={tally.faction ?? '—'} tally={tally} />
          ))}
          {covered < lines.length ? (
            // Dire où combler, sans reprocher l'absence. La ligne d'historique
            // mène déjà à la fiche du tournoi : le rattrapage tient en deux taps.
            <ThemedText type="small" themeColor="textSecondary">
              La faction se renseigne sur la fiche du tournoi, section « Ma préparation ».
            </ThemedText>
          ) : null}
        </>
      )}
    </View>
  );
}

/** Le tournoi du jour : ce que cherche un joueur qui ouvre l'app un samedi. */
function RunningCard({
  line,
  mode,
  colors,
}: {
  line: HistoryLine;
  mode: 'light' | 'dark';
  colors: Record<ThemeColor, string>;
}) {
  return (
    <View
      style={[
        styles.runningCard,
        { backgroundColor: TintBackground[mode], borderColor: TintBorder[mode] },
      ]}>
      <ThemedText style={[styles.overline, { color: colors.tint }]}>EN COURS</ThemedText>
      <ThemedText style={styles.runningTitle} numberOfLines={1}>
        {line.name}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {formatEventDateShort(line.event_date)} · {line.city}
      </ThemedText>
      <Pressable
        onPress={() =>
          router.push({ pathname: '/evenements/[id]', params: { id: line.tournament_id } })
        }
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: colors.tint, opacity: pressed ? 0.8 : 1 },
        ]}>
        {/* Seul fond doré plein de l'écran : le texte passe en OnTint. */}
        <ThemedText style={{ color: OnTint[mode], fontWeight: '600' }}>
          Suivre le tournoi
        </ThemedText>
      </Pressable>
    </View>
  );
}

function Tile({
  value,
  label,
  colors,
}: {
  value: string;
  label: string;
  colors: Record<ThemeColor, string>;
}) {
  return (
    <View style={[styles.tile, { backgroundColor: colors.backgroundElement }]}>
      <ThemedText style={styles.tileValue}>{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.tileLabel}>
        {label}
      </ThemedText>
    </View>
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
    width: '100%',
    paddingHorizontal: Spacing.four,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
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
    fontSize: 20,
    fontWeight: '700',
  },
  listHeader: {
    gap: Spacing.three,
    paddingBottom: Spacing.three,
  },
  listContent: {
    paddingBottom: Spacing.six,
  },
  factions: {
    gap: Spacing.two,
    paddingTop: Spacing.four,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  factionEmpty: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
  },
  tiles: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  tile: {
    flex: 1,
    borderRadius: Spacing.two,
    padding: Spacing.three,
    alignItems: 'center',
    gap: Spacing.one,
  },
  tileValue: {
    fontSize: 20,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  tileLabel: {
    fontSize: 12,
    textAlign: 'center',
  },
  runningCard: {
    borderRadius: Spacing.two,
    borderWidth: 1,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  overline: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  runningTitle: {
    fontSize: 17,
    fontWeight: '700',
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
  button: {
    minHeight: 48,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.four,
  },
});
