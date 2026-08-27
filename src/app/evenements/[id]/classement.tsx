import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  useColorScheme,
  View,
  type ViewToken,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MetaRow } from '@/components/meta-row';
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
import type { RoundInfo } from '@/hooks/use-my-pairing';
import { useSession } from '@/hooks/use-session';
import { useStandings, type StandingLine } from '@/hooks/use-standings';
import { ordinalFr } from '@/lib/ordinal';
import { supabase } from '@/lib/supabase';
import type { Tournament } from '@/lib/tournaments';

/** Hauteur fixe des lignes : indispensable à l'épinglage et au scroll ciblé. */
const RowHeight = 64;
const RowGap = Spacing.two;

/** La recherche n'apparaît qu'à partir de ce nombre de joueurs classés. */
const SearchThreshold = 8;

/** Les six critères, repris mot pour mot du back office. */
const TieBreakers: { title: string; text: string }[] = [
  {
    title: 'Nombre de victoires.',
    text: 'Une victoire vaut un point de classement, une égalité un demi-point.',
  },
  {
    title: 'Points marqués.',
    text: 'Somme des points de partie obtenus sur l’ensemble des rondes.',
  },
  {
    title: 'Tactiques marquées.',
    text: 'Somme des tactiques réussies. Non renseignée, cette donnée ne départage pas.',
  },
  {
    title: 'Différentiel de score.',
    text: 'Points marqués moins points encaissés, toutes rondes confondues.',
  },
  {
    title: 'Force des adversaires (SoS).',
    text: 'Somme des victoires des adversaires rencontrés.',
  },
  {
    title: 'Tirage au sort.',
    text: 'Fixé une fois pour toutes, identique à chaque affichage.',
  },
];

export default function ClassementScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const colors = Colors[mode];
  const { session } = useSession();
  const userId = session?.user.id;

  const { standings, loading: standingsLoading, failed, refresh } = useStandings(id);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [roundsCount, setRoundsCount] = useState(0);
  const [contextLoading, setContextLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [rulesOpen, setRulesOpen] = useState(false);
  const [myRowVisible, setMyRowVisible] = useState(true);
  const listRef = useRef<FlatList<StandingLine>>(null);

  const loadContext = useCallback(async () => {
    if (!supabase || !id) return;
    const [tournamentResult, roundsResult] = await Promise.all([
      supabase.from('tournaments').select('*').eq('id', id).maybeSingle<Tournament>(),
      supabase.from('rounds').select('id, number, status, scenario').eq('tournament_id', id),
    ]);
    setTournament(tournamentResult.data ?? null);
    setRoundsCount(((roundsResult.data as RoundInfo[]) ?? []).length);
    setContextLoading(false);
  }, [id]);

  useEffect(() => {
    loadContext();
  }, [loadContext]);

  const completed = tournament?.status === 'completed';
  const myIndex = userId ? standings.findIndex((row) => row.player_id === userId) : -1;
  const myLine = myIndex >= 0 ? standings[myIndex] : null;
  const hasDropped = standings.some((row) => row.dropped);

  const query = search.trim().toLocaleLowerCase('fr');
  const filtered = query
    ? standings.filter((row) => row.pseudo.toLocaleLowerCase('fr').includes(query))
    : standings;

  // La FlatList exige une référence stable pour ce callback ; l'identifiant
  // du joueur passe par une ref pour que la fermeture ne vieillisse pas.
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    setMyRowVisible(
      viewableItems.some((token) => (token.item as StandingLine)?.player_id === userIdRef.current)
    );
  });
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 });

  /** « 3,5 V » — victoires en notation française. */
  const winScoreFr = (value: number) => `${value.toLocaleString('fr-FR')} V`;

  function renderLine(row: StandingLine, pinned = false) {
    const isMe = row.player_id === userId;
    const topThree = !completed && row.rank <= 3;
    return (
      <View
        style={[
          styles.row,
          { backgroundColor: colors.backgroundElement },
          isMe && {
            backgroundColor: pinned ? colors.backgroundElement : TintBackground[mode],
            borderWidth: pinned ? 1.5 : 1,
            borderColor: TintBorder[mode],
          },
        ]}
        accessible
        accessibilityLabel={`${ordinalFr(row.rank)}. ${row.pseudo}, ${row.wins} ${row.wins > 1 ? 'victoires' : 'victoire'}, ${row.draws} ${row.draws > 1 ? 'nuls' : 'nul'}, ${row.losses} ${row.losses > 1 ? 'défaites' : 'défaite'}, ${row.points_for} points.`}>
        <View style={[styles.rankBadge, { backgroundColor: colors.backgroundSelected }]}>
          <ThemedText style={[styles.rankText, topThree && { color: colors.tint }]}>
            {row.rank}
          </ThemedText>
        </View>
        <View style={styles.playerBlock}>
          <View style={styles.pseudoLine}>
            <ThemedText type="smallBold" numberOfLines={1} style={styles.pseudo}>
              {row.pseudo}
            </ThemedText>
            {isMe ? (
              <View style={[styles.chip, { backgroundColor: colors.tint }]}>
                <ThemedText style={[styles.chipText, { color: OnTint[mode] }]}>toi</ThemedText>
              </View>
            ) : null}
          </View>
          {row.dropped ? (
            <View style={[styles.dropBadge, { backgroundColor: colors.backgroundSelected }]}>
              <ThemedText style={[styles.dropBadgeText, { color: colors.textSecondary }]}>
                Abandon
              </ThemedText>
            </View>
          ) : row.faction ? (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {row.faction}
            </ThemedText>
          ) : null}
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.record}>
          {row.wins} – {row.draws} – {row.losses}
        </ThemedText>
        <ThemedText style={styles.points}>{row.points_for}</ThemedText>
      </View>
    );
  }

  /** Podium final : une célébration, pas un extrait du tableau. */
  function renderPodium() {
    if (!completed || standings.length < 3) return null;
    const top = standings.slice(0, 3);
    return (
      <View style={styles.podium}>
        {top.map((row, index) => {
          const first = index === 0;
          const isMe = row.player_id === userId;
          return (
            <View
              key={row.player_id}
              style={[
                styles.podiumCard,
                { backgroundColor: first ? TintBackground[mode] : colors.backgroundElement },
                first && { borderWidth: 1, borderColor: TintBorder[mode] },
              ]}>
              {first ? <Ionicons name="trophy" size={20} color={colors.tint} /> : null}
              <View style={styles.podiumRankLine}>
                <ThemedText style={[styles.podiumRank, { color: colors.textSecondary }]}>
                  {ordinalFr(row.rank).toUpperCase()}
                </ThemedText>
                {isMe ? (
                  <View style={[styles.chip, { backgroundColor: colors.tint }]}>
                    <ThemedText style={[styles.chipText, { color: OnTint[mode] }]}>toi</ThemedText>
                  </View>
                ) : null}
              </View>
              <ThemedText numberOfLines={2} style={styles.podiumPseudo}>
                {row.pseudo}
              </ThemedText>
              {row.faction ? (
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {row.faction}
                </ThemedText>
              ) : null}
              <ThemedText style={[styles.podiumScore, { color: colors.textSecondary }]}>
                {winScoreFr(row.win_score)} · {row.points_for} pts
              </ThemedText>
            </View>
          );
        })}
      </View>
    );
  }

  const footer = (
    <View style={styles.footer}>
      <ThemedText style={[styles.legend, { color: colors.textSecondary }]}>
        Bilan V – N – D · points marqués
      </ThemedText>
      <Pressable
        onPress={() => setRulesOpen(true)}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.rulesButton,
          { backgroundColor: colors.backgroundElement, opacity: pressed ? 0.8 : 1 },
        ]}>
        <Ionicons name="help-circle-outline" size={16} color={colors.tint} />
        <ThemedText type="smallBold" style={{ color: colors.tint }}>
          Comment ce classement est calculé ?
        </ThemedText>
      </Pressable>
    </View>
  );

  const loading = standingsLoading || contextLoading;
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
        <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
          Vérifie ta connexion, puis réessaie.
        </ThemedText>
        <Pressable
          style={({ pressed }) => [
            styles.retryButton,
            { backgroundColor: colors.backgroundElement, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={() => {
            refresh();
            loadContext();
          }}>
          <ThemedText>Réessayer</ThemedText>
        </Pressable>
      </View>
    );
  } else if (standings.length === 0) {
    content = (
      <View style={styles.centered}>
        <Ionicons name="podium-outline" size={40} color={colors.textSecondary} />
        <ThemedText type="smallBold" style={styles.centeredText}>
          Le classement apparaîtra après les premiers résultats
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
          Reviens après la première table terminée.
        </ThemedText>
        <Pressable
          style={({ pressed }) => [
            styles.retryButton,
            { backgroundColor: colors.backgroundElement, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={() => router.back()}>
          <ThemedText>Retour à l’événement</ThemedText>
        </Pressable>
      </View>
    );
  } else {
    content = (
      <>
        <MetaRow icon="podium-outline">
          <View style={styles.contextTexts}>
            <ThemedText type="small" themeColor="textSecondary">
              {completed
                ? `${roundsCount} rondes jouées · ${standings.length} joueurs`
                : `Après la ronde ${roundsCount} sur ${tournament?.rounds_count ?? roundsCount}`}
            </ThemedText>
            {hasDropped ? (
              <ThemedText type="small" themeColor="textSecondary">
                Les joueurs ayant abandonné gardent leurs résultats acquis.
              </ThemedText>
            ) : null}
          </View>
        </MetaRow>

        {standings.length >= SearchThreshold ? (
          <View style={[styles.searchBox, { backgroundColor: colors.backgroundElement }]}>
            <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Rechercher un joueur"
              placeholderTextColor={colors.textSecondary}
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
            />
            {search !== '' ? (
              <Pressable onPress={() => setSearch('')} accessibilityLabel="Effacer la recherche">
                <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {query && filtered.length === 0 ? (
          <View style={styles.centered}>
            <Ionicons name="search-outline" size={32} color={colors.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
              Aucun joueur ne correspond à « {search.trim()} ».
            </ThemedText>
          </View>
        ) : (
          <View style={styles.listWrap}>
            <FlatList
              ref={listRef}
              data={filtered}
              keyExtractor={(item) => item.player_id}
              renderItem={({ item }) => renderLine(item)}
              ItemSeparatorComponent={() => <View style={{ height: RowGap }} />}
              ListHeaderComponent={renderPodium()}
              ListFooterComponent={footer}
              contentContainerStyle={styles.listContent}
              getItemLayout={
                completed
                  ? undefined // le podium en tête rend les offsets inexacts
                  : (_, index) => ({
                      length: RowHeight + RowGap,
                      offset: (RowHeight + RowGap) * index,
                      index,
                    })
              }
              initialScrollIndex={
                !completed && !query && myIndex > 0 ? Math.max(0, myIndex - 1) : undefined
              }
              onViewableItemsChanged={onViewableItemsChanged.current}
              viewabilityConfig={viewabilityConfig.current}
              refreshControl={
                <RefreshControl
                  refreshing={false}
                  onRefresh={() => {
                    refresh();
                    loadContext();
                  }}
                  tintColor={colors.tint}
                />
              }
            />

            {/* Ma ligne, épinglée quand elle est hors écran. */}
            {myLine && !myRowVisible && !query ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Voir ma position dans le classement"
                onPress={() =>
                  listRef.current?.scrollToIndex({ index: Math.max(0, myIndex - 1) })
                }
                style={styles.pinned}>
                {renderLine(myLine, true)}
              </Pressable>
            ) : null}
          </View>
        )}
      </>
    );
  }

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
              {completed ? 'Classement final' : 'Classement'}
            </ThemedText>
            {tournament ? (
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {tournament.name}
              </ThemedText>
            ) : null}
          </View>
        </View>
        {content}

        {/* Les six départages, dans les mêmes termes que le back office.
            Montée seulement à l'ouverture : sur React Native Web, un Modal
            déjà monté ne disparaît pas quand `visible` repasse à faux. */}
        {rulesOpen ? (
        <Modal
          visible
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setRulesOpen(false)}>
          <View style={[styles.modal, { backgroundColor: colors.background }]}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>Comment le classement est calculé</ThemedText>
              <Pressable
                onPress={() => setRulesOpen(false)}
                style={styles.backButton}
                accessibilityLabel="Fermer">
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalContent}>
              {TieBreakers.map((rule, index) => (
                <View key={rule.title} style={styles.ruleRow}>
                  <ThemedText style={[styles.ruleNumber, { color: colors.tint }]}>
                    {index + 1}
                  </ThemedText>
                  <View style={styles.ruleTexts}>
                    <ThemedText type="smallBold">{rule.title}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {rule.text}
                    </ThemedText>
                  </View>
                </View>
              ))}
              <ThemedText type="small" themeColor="textSecondary">
                Le bye compte comme une victoire 15 – 5 avec 3 tactiques. Les critères
                s’appliquent dans l’ordre : on ne passe au suivant qu’en cas d’égalité stricte sur
                tous les précédents.
              </ThemedText>
            </ScrollView>
          </View>
        </Modal>
        ) : null}
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
    gap: Spacing.two,
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
  contextTexts: {
    flex: 1,
    gap: 2,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    minHeight: 48,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: Spacing.two,
  },
  listWrap: {
    flex: 1,
  },
  listContent: {
    // La ligne épinglée ne doit jamais masquer la fin de liste.
    paddingBottom: Spacing.six + RowHeight,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    height: RowHeight,
  },
  rankBadge: {
    width: 36,
    height: 36,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  playerBlock: {
    flex: 1,
    gap: 1,
  },
  pseudoLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  pseudo: {
    flexShrink: 1,
  },
  record: {
    width: 64,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  points: {
    width: 40,
    textAlign: 'right',
    fontSize: 17,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: Spacing.one,
    paddingVertical: 1,
  },
  chipText: {
    fontSize: 10,
    lineHeight: 14,
  },
  dropBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 1,
  },
  dropBadgeText: {
    fontSize: 11,
    lineHeight: 15,
  },
  podium: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginBottom: Spacing.three,
  },
  podiumCard: {
    flex: 1,
    minHeight: 132,
    borderRadius: Spacing.two,
    padding: Spacing.three,
    alignItems: 'center',
    gap: Spacing.one,
  },
  podiumRankLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  podiumRank: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  podiumPseudo: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  podiumScore: {
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  pinned: {
    position: 'absolute',
    bottom: Spacing.three,
    left: 0,
    right: 0,
    // Ombre légère pour détacher la copie de la liste qu'elle recouvre.
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  footer: {
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  legend: {
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  rulesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    minHeight: 48,
    borderRadius: Spacing.two,
  },
  modal: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  modalTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
  },
  modalContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  ruleRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  ruleNumber: {
    width: 24,
    fontSize: 16,
    fontWeight: '700',
  },
  ruleTexts: {
    flex: 1,
    gap: 2,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.five,
  },
  centeredText: {
    textAlign: 'center',
  },
  retryButton: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    marginTop: Spacing.two,
  },
});
