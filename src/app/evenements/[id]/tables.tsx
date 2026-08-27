import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  useColorScheme,
  View,
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
import { useSession } from '@/hooks/use-session';
import type { PairingInfo, RoundInfo } from '@/hooks/use-my-pairing';
import { supabase } from '@/lib/supabase';
import type { Tournament } from '@/lib/tournaments';

/** Hauteur fixe des lignes : indispensable pour s'ouvrir sur ma table. */
const RowHeight = 76;
const RowGap = Spacing.two;

/** La recherche n'apparaît qu'à partir de ce nombre de tables. */
const SearchThreshold = 8;

export default function TablesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const colors = Colors[mode];
  const { session } = useSession();
  const userId = session?.user.id;

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [rounds, setRounds] = useState<RoundInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pairings, setPairings] = useState<PairingInfo[]>([]);
  // Les rencontres de la ronde : dans un tournoi par équipes, une table isolée
  // ne dit rien — c'est « Aubrac contre Les Corbeaux » qu'on cherche des yeux.
  const [encounters, setEncounters] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState('');
  const listRef = useRef<FlatList<PairingInfo>>(null);

  const load = useCallback(async () => {
    if (!supabase || !id) return;
    setFailed(false);

    const [tournamentResult, roundsResult] = await Promise.all([
      supabase.from('tournaments').select('*').eq('id', id).maybeSingle<Tournament>(),
      supabase
        .from('rounds')
        .select('id, number, status, scenario')
        .eq('tournament_id', id)
        .order('number'),
    ]);

    if (tournamentResult.error || roundsResult.error) {
      setFailed(true);
      setLoading(false);
      return;
    }
    setTournament(tournamentResult.data ?? null);
    const list = (roundsResult.data as RoundInfo[]) ?? [];
    setRounds(list);
    // Par défaut : la ronde en cours (la dernière générée).
    setSelectedId((current) =>
      current && list.some((r) => r.id === current) ? current : (list[list.length - 1]?.id ?? null)
    );
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const loadPairings = useCallback(async () => {
    if (!supabase || !selectedId) return;
    const { data, error } = await supabase
      .from('pairings')
      .select(
        'id, table_number, player_a_id, player_b_id, score_a, score_b, team_pairing_id, player_a:profiles!pairings_player_a_id_fkey(pseudo), player_b:profiles!pairings_player_b_id_fkey(pseudo)'
      )
      .eq('round_id', selectedId)
      .order('table_number');
    if (error) {
      setFailed(true);
      return;
    }
    setPairings((data as unknown as PairingInfo[]) ?? []);

    const { data: teams } = await supabase
      .from('team_pairings')
      .select(
        'id, encounter_number, team_a:team_registrations!team_pairings_team_a_id_fkey(team:teams(name)), team_b:team_registrations!team_pairings_team_b_id_fkey(team:teams(name))'
      )
      .eq('round_id', selectedId)
      .order('encounter_number');
    const map = new Map<string, string>();
    for (const row of (teams as unknown as {
      id: string;
      encounter_number: number;
      team_a: { team: { name: string } | null } | null;
      team_b: { team: { name: string } | null } | null;
    }[]) ?? []) {
      map.set(
        row.id,
        row.team_b
          ? `Rencontre ${row.encounter_number} — ${row.team_a?.team?.name ?? 'Équipe'} contre ${row.team_b.team?.name ?? 'Équipe'}`
          : `Rencontre ${row.encounter_number} — ${row.team_a?.team?.name ?? 'Équipe'} a le bye`
      );
    }
    setEncounters(map);
  }, [selectedId]);

  useEffect(() => {
    loadPairings();
  }, [loadPairings]);

  const selectedRound = rounds.find((r) => r.id === selectedId) ?? null;

  // Le bye ferme la marche : sa « table » n'en est pas une.
  const ordered = useMemo(() => {
    const real = pairings.filter((p) => p.player_b_id !== null);
    const byes = pairings.filter((p) => p.player_b_id === null);
    return [...real, ...byes];
  }, [pairings]);

  const query = search.trim().toLocaleLowerCase('fr');
  const filtered = query
    ? ordered.filter((p) =>
        [p.player_a?.pseudo, p.player_b?.pseudo].some((pseudo) =>
          pseudo?.toLocaleLowerCase('fr').includes(query)
        )
      )
    : ordered;

  const myIndex = userId
    ? ordered.findIndex((p) => p.player_a_id === userId || p.player_b_id === userId)
    : -1;

  /** Encart-réponse quand la recherche isole un seul joueur. */
  const answer = useMemo(() => {
    if (!query || filtered.length !== 1) return null;
    const pairing = filtered[0];
    const inA = pairing.player_a?.pseudo?.toLocaleLowerCase('fr').includes(query);
    const found = inA ? pairing.player_a : pairing.player_b;
    const other = inA ? pairing.player_b : pairing.player_a;
    if (!found) return null;
    if (pairing.player_b_id === null) {
      return `${found.pseudo} a le bye à cette ronde.`;
    }
    return `${found.pseudo} joue à la table ${pairing.table_number}, contre ${other?.pseudo ?? '—'}.`;
  }, [query, filtered]);

  function renderPairing({ item, index }: { item: PairingInfo; index: number }) {
    // En-tête de rencontre, posé sur la première table de chaque groupe.
    const label = item.team_pairing_id ? encounters.get(item.team_pairing_id) : null;
    const previous = index > 0 ? ordered[index - 1] : null;
    const header =
      label && item.team_pairing_id !== previous?.team_pairing_id ? (
        <ThemedText type="smallBold" style={styles.encounterHeader} numberOfLines={2}>
          {label}
        </ThemedText>
      ) : null;
    const bye = item.player_b_id === null;
    const mine = userId !== undefined && (item.player_a_id === userId || item.player_b_id === userId);
    const scored = item.score_a !== null && item.score_b !== null;
    const aWins = scored && item.score_a! > item.score_b!;
    const bWins = scored && item.score_b! > item.score_a!;

    const playerLine = (
      player: PairingInfo['player_a'],
      playerId: string | null,
      points: number | null,
      winner: boolean
    ) => (
      <View style={styles.playerLine}>
        <View style={styles.pseudoWrap}>
          <ThemedText
            type="small"
            numberOfLines={1}
            style={winner ? styles.winner : undefined}>
            {player?.pseudo ?? '—'}
          </ThemedText>
          {playerId === userId ? (
            <View style={[styles.chip, { backgroundColor: colors.tint }]}>
              <ThemedText style={[styles.chipText, { color: OnTint[mode] }]}>toi</ThemedText>
            </View>
          ) : null}
        </View>
        {scored ? (
          <ThemedText type="smallBold" style={[styles.points, winner && styles.winner]}>
            {points}
          </ThemedText>
        ) : null}
      </View>
    );

    return (
      <>
      {header}
      <View
        style={[
          styles.row,
          { backgroundColor: colors.backgroundElement },
          mine && {
            backgroundColor: TintBackground[mode],
            borderWidth: 1,
            borderColor: TintBorder[mode],
          },
        ]}>
        <View style={[styles.tableBadge, { backgroundColor: colors.backgroundSelected }]}>
          <ThemedText style={styles.tableBadgeText}>
            {bye ? '—' : item.table_number}
          </ThemedText>
        </View>
        <View style={styles.rowBody}>
          {bye ? (
            <>
              {playerLine(item.player_a, item.player_a_id, null, false)}
              <ThemedText type="small" themeColor="textSecondary">
                Bye · victoire 15 – 5
              </ThemedText>
            </>
          ) : (
            <>
              {playerLine(item.player_a, item.player_a_id, item.score_a, aWins)}
              {playerLine(item.player_b, item.player_b_id, item.score_b, bWins)}
            </>
          )}
        </View>
        {!bye && !scored ? (
          <ThemedText type="small" themeColor="textSecondary">
            En cours
          </ThemedText>
        ) : null}
      </View>
      </>
    );
  }

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
        <ThemedText type="smallBold">Impossible de charger les tables</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
          Vérifie ta connexion, puis réessaie.
        </ThemedText>
        <Pressable
          style={({ pressed }) => [
            styles.retryButton,
            { backgroundColor: colors.backgroundElement, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={() => {
            setLoading(true);
            load();
            loadPairings();
          }}>
          <ThemedText>Réessayer</ThemedText>
        </Pressable>
      </View>
    );
  } else if (!tournament || rounds.length === 0) {
    // Lien direct vers un tournoi pas encore lancé : état vide, pas d'erreur.
    content = (
      <View style={styles.centered}>
        <Ionicons name="calendar-outline" size={40} color={colors.textSecondary} />
        <ThemedText type="smallBold">Le tournoi n’a pas encore commencé</ThemedText>
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
        {/* Sélecteur de ronde : seules les rondes générées existent. */}
        <View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.roundPicker}>
            {rounds.map((round) => {
              const active = round.id === selectedId;
              return (
                <Pressable
                  key={round.id}
                  onPress={() => setSelectedId(round.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.roundChip,
                    { backgroundColor: active ? colors.tint : colors.backgroundElement },
                  ]}>
                  <ThemedText
                    type="smallBold"
                    style={{ color: active ? OnTint[mode] : colors.textSecondary }}>
                    Ronde {round.number}
                  </ThemedText>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {selectedRound?.scenario ? (
          <MetaRow icon="map-outline">
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
              {selectedRound.scenario}
            </ThemedText>
          </MetaRow>
        ) : null}

        {ordered.length >= SearchThreshold ? (
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

        {answer ? (
          <View style={[styles.answer, { backgroundColor: TintBackground[mode] }]}>
            <ThemedText type="default">{answer}</ThemedText>
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
          <FlatList
            ref={listRef}
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={renderPairing}
            ItemSeparatorComponent={() => <View style={{ height: RowGap }} />}
            contentContainerStyle={styles.listContent}
            getItemLayout={(_, index) => ({
              length: RowHeight + RowGap,
              offset: (RowHeight + RowGap) * index,
              index,
            })}
            // S'ouvre sur ma table, une ligne de contexte au-dessus.
            initialScrollIndex={query ? undefined : myIndex > 0 ? myIndex - 1 : undefined}
            refreshControl={
              <RefreshControl
                refreshing={false}
                onRefresh={() => {
                  load();
                  loadPairings();
                }}
                tintColor={colors.tint}
              />
            }
          />
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
              Tables
            </ThemedText>
            {tournament ? (
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {tournament.name}
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
  roundPicker: {
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  roundChip: {
    minHeight: 40,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
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
  answer: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
  },
  listContent: {
    paddingBottom: Spacing.six,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderRadius: Spacing.two,
    padding: Spacing.two,
    height: RowHeight,
  },
  encounterHeader: {
    marginTop: Spacing.two,
    marginBottom: Spacing.half,
  },
  tableBadge: {
    width: 44,
    height: 44,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableBadgeText: {
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  playerLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  pseudoWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  winner: {
    fontWeight: '700',
  },
  points: {
    width: 32,
    textAlign: 'right',
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
