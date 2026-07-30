import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MemberRow } from '@/components/member-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import { useSession } from '@/hooks/use-session';
import type { Team } from '@/hooks/use-my-team';
import { supabase } from '@/lib/supabase';

/**
 * Fiche publique d'une équipe, atteinte depuis l'annuaire. Aucune action
 * ici : on rejoint par code, jamais par bouton — c'est le capitaine qui
 * décide qui entre.
 */
export default function EquipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { session } = useSession();
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!supabase || !id) return;
    setLoading(true);
    const { data } = await supabase
      .from('teams')
      .select(
        'id, name, description, region, captain_id, created_at, members:team_members(id, player_id, role, joined_at, profile:profiles(pseudo, faction_favorite))'
      )
      .eq('id', id)
      .maybeSingle<Team>();
    if (data) {
      setTeam({
        ...data,
        members: [...data.members].sort((a, b) =>
          a.role !== b.role
            ? a.role === 'captain'
              ? -1
              : 1
            : a.joined_at.localeCompare(b.joined_at)
        ),
      });
    } else {
      setTeam(null);
    }
    setLoading(false);
  }, [id]);

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
  } else if (!team) {
    content = (
      <View style={styles.centered}>
        <ThemedText style={styles.centeredText}>Cette équipe n’existe plus.</ThemedText>
      </View>
    );
  } else {
    content = (
      <ScrollView contentContainerStyle={styles.scroll}>
        <ThemedText type="subtitle">{team.name}</ThemedText>
        {team.region ? (
          <ThemedText type="small" themeColor="textSecondary">
            {team.region}
          </ThemedText>
        ) : null}
        {team.description ? (
          <ThemedText style={styles.description}>{team.description}</ThemedText>
        ) : null}

        <ThemedText type="smallBold" style={styles.rosterHeading}>
          Roster · {team.members.length} {team.members.length > 1 ? 'joueurs' : 'joueur'}
        </ThemedText>
        <View style={styles.stack}>
          {team.members.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              isMe={member.player_id === session?.user.id}
            />
          ))}
        </View>

        <View style={[styles.notice, { backgroundColor: colors.backgroundElement }]}>
          <Ionicons name="key-outline" size={18} color={colors.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.noticeText}>
            On rejoint une équipe avec le code d’invitation de son capitaine.
          </ThemedText>
        </View>
      </ScrollView>
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
          <ThemedText type="default" style={styles.headerTitle}>
            Équipe
          </ThemedText>
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
  headerTitle: {
    fontWeight: '700',
    fontSize: 20,
  },
  scroll: {
    gap: Spacing.one,
    paddingBottom: Spacing.six,
  },
  description: {
    marginTop: Spacing.two,
  },
  rosterHeading: {
    marginTop: Spacing.four,
    marginBottom: Spacing.two,
  },
  stack: {
    gap: Spacing.two,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Spacing.two,
    padding: Spacing.three,
    marginTop: Spacing.four,
  },
  noticeText: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  centeredText: {
    textAlign: 'center',
  },
});
