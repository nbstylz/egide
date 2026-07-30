import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmButton } from '@/components/confirm-button';
import { InviteCodeCard } from '@/components/invite-code-card';
import { JoinCodeInput } from '@/components/join-code-input';
import { MemberRow } from '@/components/member-row';
import { ScreenHeader } from '@/components/screen-header';
import { SegmentedControl } from '@/components/segmented-control';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import { useMyTeam, useTeams, type TeamMember } from '@/hooks/use-my-team';
import { useSession } from '@/hooks/use-session';
import { CodeLength } from '@/lib/invite-code';
import { supabase } from '@/lib/supabase';
import { teamErrorMessage } from '@/lib/teams';

type Tab = 'mine' | 'directory';

/** Carte « Rejoindre » : l'action la plus fréquente, donc la plus visible. */
function JoinCard({ onJoined }: { onJoined: () => void }) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const join = useCallback(
    async (value: string) => {
      if (!supabase || value.length < CodeLength) return;
      setBusy(true);
      setError(null);
      const { error: dbError } = await supabase.rpc('join_team', {
        p_invite_code: value,
      });
      setBusy(false);
      if (dbError) {
        setError(teamErrorMessage(dbError));
        setCode('');
        return;
      }
      onJoined();
    },
    [onJoined]
  );

  return (
    <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
      <ThemedText type="smallBold">Tu as reçu un code ?</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Saisis les 6 caractères transmis par le capitaine.
      </ThemedText>
      <View style={styles.codeInput}>
        <JoinCodeInput
          value={code}
          onChange={(value) => {
            setCode(value);
            setError(null);
          }}
          onComplete={join}
          disabled={busy}
        />
      </View>
      {busy ? <ActivityIndicator color={colors.tint} /> : null}
      {error ? (
        <ThemedText type="small" style={[styles.error, { color: colors.tint }]}>
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

/** Actions du capitaine sur un membre, dépliées sous sa ligne. */
function MemberActions({
  member,
  onRemove,
  onPromote,
}: {
  member: TeamMember;
  onRemove: () => void;
  onPromote: () => void;
}) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const pseudo = member.profile?.pseudo ?? 'ce joueur';

  return (
    <View style={[styles.memberActions, { backgroundColor: colors.backgroundElement }]}>
      <Pressable
        onPress={onPromote}
        style={({ pressed }) => [styles.memberAction, { opacity: pressed ? 0.7 : 1 }]}>
        <Ionicons name="shield-checkmark-outline" size={18} color={colors.text} />
        <ThemedText type="small">Transmettre le capitanat</ThemedText>
      </Pressable>
      <ConfirmButton
        label={`Retirer ${pseudo} de l’équipe`}
        confirmLabel="Confirmer le retrait"
        consequence={`${pseudo} perdra l’accès à l’équipe.`}
        onConfirm={onRemove}
      />
    </View>
  );
}

export default function EquipesScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { session, loading: sessionLoading } = useSession();
  const userId = session?.user.id;
  const { team, inviteCode, setInviteCode, isCaptain, loading, refresh } = useMyTeam(userId);
  const { teams, loading: directoryLoading, refresh: refreshDirectory } = useTeams();
  const [tab, setTab] = useState<Tab>('mine');
  const [openMember, setOpenMember] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Au retour de l'écran de création, l'équipe vient peut-être de naître.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const regenerate = useCallback(async () => {
    if (!supabase || !team) return;
    const { data, error } = await supabase.rpc('regenerate_invite_code', {
      p_team_id: team.id,
    });
    if (error) {
      setNotice(teamErrorMessage(error));
      return;
    }
    setInviteCode(data as string);
    setNotice('Nouveau code généré. L’ancien ne fonctionne plus.');
  }, [team, setInviteCode]);

  const removeMember = useCallback(
    async (playerId: string) => {
      if (!supabase || !team) return;
      setOpenMember(null);
      const { error } = await supabase.rpc('leave_team', {
        p_team_id: team.id,
        p_player_id: playerId,
      });
      setNotice(error ? teamErrorMessage(error) : 'Membre retiré.');
      refresh();
    },
    [team, refresh]
  );

  const promote = useCallback(
    async (playerId: string) => {
      if (!supabase || !team) return;
      setOpenMember(null);
      const { error } = await supabase.rpc('transfer_captaincy', {
        p_team_id: team.id,
        p_new_captain: playerId,
      });
      setNotice(error ? teamErrorMessage(error) : 'Capitanat transmis.');
      refresh();
    },
    [team, refresh]
  );

  const leave = useCallback(async () => {
    if (!supabase || !team) return;
    const { error } = await supabase.rpc('leave_team', { p_team_id: team.id });
    if (error) {
      setNotice(teamErrorMessage(error));
      return;
    }
    // On quitte l'écran d'équipe : les messages qui la concernaient n'ont
    // plus de sens.
    setNotice(null);
    refresh();
    refreshDirectory();
  }, [team, refresh, refreshDirectory]);

  const disband = useCallback(async () => {
    if (!supabase || !team) return;
    const { error } = await supabase.rpc('disband_team', { p_team_id: team.id });
    if (error) {
      setNotice(teamErrorMessage(error));
      return;
    }
    setNotice(null);
    refresh();
    refreshDirectory();
  }, [team, refresh, refreshDirectory]);

  const onJoined = useCallback(() => {
    setNotice(null);
    refresh();
    refreshDirectory();
  }, [refresh, refreshDirectory]);

  // --- États d'écran ---------------------------------------------------

  if (sessionLoading) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={[styles.safeArea, styles.centered]}>
          <ActivityIndicator color={colors.tint} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (!session) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={[styles.safeArea, styles.centered]}>
          <Ionicons name="people-outline" size={64} color={colors.tint} />
          <ThemedText type="subtitle" style={styles.centeredText}>
            Équipes
          </ThemedText>
          <ThemedText style={styles.centeredText}>
            Connecte-toi pour créer une équipe ou en rejoindre une.
          </ThemedText>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.tint, opacity: pressed ? 0.8 : 1 },
            ]}
            onPress={() => router.push('/profil')}>
            <ThemedText style={styles.primaryButtonText}>Se connecter</ThemedText>
          </Pressable>
        </SafeAreaView>
      </ThemedView>
    );
  }

  let mineContent;
  if (loading && !team) {
    mineContent = (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.tint} />
      </View>
    );
  } else if (!team) {
    // Sans équipe : rejoindre passe devant, créer reste accessible.
    mineContent = (
      <View style={styles.stack}>
        <JoinCard onJoined={onJoined} />
        <View style={styles.separator}>
          <View style={[styles.line, { backgroundColor: colors.backgroundSelected }]} />
          <ThemedText type="small" themeColor="textSecondary">
            ou
          </ThemedText>
          <View style={[styles.line, { backgroundColor: colors.backgroundSelected }]} />
        </View>
        <Pressable
          onPress={() => router.push('/equipes/creer')}
          style={({ pressed }) => [
            styles.secondaryButton,
            { borderColor: colors.backgroundSelected, opacity: pressed ? 0.7 : 1 },
          ]}>
          <Ionicons name="add-circle-outline" size={20} color={colors.text} />
          <ThemedText type="smallBold">Créer une équipe</ThemedText>
        </Pressable>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
          Tu en deviendras le capitaine et recevras un code à partager.
        </ThemedText>
      </View>
    );
  } else {
    mineContent = (
      <View style={styles.stack}>
        <View style={styles.teamHeading}>
          <ThemedText type="subtitle">{team.name}</ThemedText>
          {team.region ? (
            <ThemedText type="small" themeColor="textSecondary">
              {team.region}
            </ThemedText>
          ) : null}
          {team.description ? <ThemedText type="small">{team.description}</ThemedText> : null}
        </View>

        {isCaptain && inviteCode ? (
          <InviteCodeCard code={inviteCode} teamName={team.name} onRegenerate={regenerate} />
        ) : null}

        <View style={styles.rosterHeading}>
          <ThemedText type="smallBold">
            Roster · {team.members.length}{' '}
            {team.members.length > 1 ? 'joueurs' : 'joueur'}
          </ThemedText>
          {isCaptain && team.members.length > 1 ? (
            <ThemedText type="small" themeColor="textSecondary">
              Touche un membre pour agir
            </ThemedText>
          ) : null}
        </View>

        {team.members.map((member) => {
          const canAct = isCaptain && member.player_id !== userId;
          return (
            <View key={member.id} style={styles.memberBlock}>
              <MemberRow
                member={member}
                isMe={member.player_id === userId}
                onPress={
                  canAct
                    ? () => setOpenMember(openMember === member.id ? null : member.id)
                    : undefined
                }
              />
              {openMember === member.id ? (
                <MemberActions
                  member={member}
                  onRemove={() => removeMember(member.player_id)}
                  onPromote={() => promote(member.player_id)}
                />
              ) : null}
            </View>
          );
        })}

        <View style={styles.dangerZone}>
          {isCaptain ? (
            <ConfirmButton
              label="Dissoudre l’équipe"
              confirmLabel="Confirmer la dissolution"
              consequence="L’équipe et son roster seront supprimés. C’est définitif."
              onConfirm={disband}
            />
          ) : (
            <ConfirmButton
              label="Quitter l’équipe"
              confirmLabel="Confirmer le départ"
              consequence="Il te faudra un nouveau code pour revenir."
              onConfirm={leave}
            />
          )}
          {isCaptain && team.members.length > 1 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
              Pour partir sans dissoudre, transmets d’abord le capitanat.
            </ThemedText>
          ) : null}
        </View>
      </View>
    );
  }

  const directoryContent = directoryLoading && teams.length === 0 ? (
    <View style={styles.centered}>
      <ActivityIndicator color={colors.tint} />
    </View>
  ) : teams.length === 0 ? (
    <View style={styles.centered}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
        Aucune équipe pour l’instant. La première pourrait être la tienne.
      </ThemedText>
    </View>
  ) : (
    <View style={styles.stack}>
      {teams.map((entry) => (
        <Pressable
          key={entry.id}
          onPress={() =>
            router.push({ pathname: '/equipes/[id]', params: { id: entry.id } })
          }
          style={({ pressed }) => [
            styles.directoryRow,
            {
              backgroundColor: pressed ? colors.backgroundSelected : colors.backgroundElement,
            },
          ]}>
          <View style={styles.identity}>
            <ThemedText type="smallBold">{entry.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {entry.members[0]?.count ?? 0} membre
              {(entry.members[0]?.count ?? 0) > 1 ? 's' : ''}
              {entry.region ? ` · ${entry.region}` : ''}
            </ThemedText>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </Pressable>
      ))}
    </View>
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl
              refreshing={loading || directoryLoading}
              onRefresh={() => {
                refresh();
                refreshDirectory();
              }}
              tintColor={colors.tint}
            />
          }>
          <ScreenHeader
            title="Équipes"
            subtitle="Rejoins une équipe existante ou monte la tienne."
          />
          <SegmentedControl
            options={[
              { value: 'mine', label: 'Mon équipe' },
              { value: 'directory', label: 'Annuaire' },
            ]}
            value={tab}
            onChange={(value) => setTab(value as Tab)}
          />
          {notice ? (
            <Pressable onPress={() => setNotice(null)}>
              <View style={[styles.notice, { backgroundColor: colors.backgroundElement }]}>
                <ThemedText type="small">{notice}</ThemedText>
              </View>
            </Pressable>
          ) : null}
          <View style={styles.tabContent}>
            {tab === 'mine' ? mineContent : directoryContent}
          </View>
        </ScrollView>
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
  },
  scroll: {
    paddingBottom: BottomTabInset + Spacing.five,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.five,
  },
  centeredText: {
    textAlign: 'center',
  },
  stack: {
    gap: Spacing.two,
  },
  tabContent: {
    marginTop: Spacing.three,
  },
  card: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  codeInput: {
    marginTop: Spacing.two,
  },
  error: {
    marginTop: Spacing.one,
  },
  separator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginVertical: Spacing.two,
  },
  line: {
    flex: 1,
    height: 1,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    minHeight: 52,
    borderRadius: Spacing.two,
    borderWidth: 1,
  },
  primaryButton: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.five,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  teamHeading: {
    gap: Spacing.one,
    marginBottom: Spacing.two,
  },
  rosterHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: Spacing.three,
    marginBottom: Spacing.one,
  },
  memberBlock: {
    gap: Spacing.one,
  },
  memberActions: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  memberAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
  },
  dangerZone: {
    marginTop: Spacing.five,
    gap: Spacing.two,
  },
  directoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.two,
    minHeight: 64,
  },
  identity: {
    flex: 1,
    gap: 1,
  },
  notice: {
    borderRadius: Spacing.two,
    padding: Spacing.three,
    marginTop: Spacing.three,
  },
});
