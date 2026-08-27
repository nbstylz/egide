import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  Colors,
  GreenColor,
  MaxContentWidth,
  OnTint,
  RedBackground,
  RedColor,
  Spacing,
  TintBackground,
  TintBorder,
} from '@/constants/theme';
import { useMyTeam, type TeamMember } from '@/hooks/use-my-team';
import { useSession } from '@/hooks/use-session';
import { useTournamentDetail } from '@/hooks/use-tournament-detail';
import { supabase } from '@/lib/supabase';

/**
 * Traduit un refus de la base en phrase compréhensible. Les fonctions SQL
 * renvoient un code suivi du pseudo concerné (`NOT_A_MEMBER:Morvath`) : dire
 * « un joueur ne convient pas » enverrait le capitaine chercher lequel.
 */
function readableError(message: string, teamSize: number): string {
  const [code, subject] = message.split(':');
  switch (code) {
    case 'PLAYER_ALREADY_REGISTERED':
      return `${subject} est déjà inscrit à ce tournoi. Il doit se retirer lui-même depuis la fiche du tournoi avant de rejoindre le roster.`;
    case 'NOT_A_MEMBER':
      return `${subject} ne fait pas partie de ton équipe.`;
    case 'ROSTER_SIZE':
      return `Ce tournoi se joue à ${teamSize} joueurs par équipe.`;
    case 'ROSTER_DUPLICATE':
      return 'Un joueur apparaît deux fois dans le roster.';
    case 'REGISTRATIONS_CLOSED':
      return 'Les inscriptions de ce tournoi sont closes.';
    case 'TEAM_ALREADY_REGISTERED':
      return 'Ton équipe est déjà inscrite à ce tournoi.';
    case 'NOT_CAPTAIN':
      return 'Seul le capitaine inscrit l’équipe.';
    default:
      return 'Impossible d’inscrire l’équipe. Vérifie ta connexion et réessaie.';
  }
}

export default function InscrireEquipeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const colors = Colors[mode];

  /** Retour vers la fiche même quand l'écran a été ouvert par lien direct. */
  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/evenements/[id]', params: { id: id ?? '' } });
  };

  const { session, loading: sessionLoading } = useSession();
  const { tournament, loading: tournamentLoading, engagedTeams, myTeamRegistration, isFull } =
    useTournamentDetail(id, session?.user.id);
  const { team, loading: teamLoading } = useMyTeam(session?.user.id);

  const [selected, setSelected] = useState<string[]>([]);
  const [seeded, setSeeded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tooMany, setTooMany] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  const teamSize = tournament?.team_size ?? 0;
  const loading = sessionLoading || tournamentLoading || teamLoading;
  const isCaptain = Boolean(team && session && team.captain_id === session.user.id);
  const alreadyRegistered = Boolean(myTeamRegistration);

  /**
   * Préremplissage : le roster déjà engagé, quand on vient le modifier. Il doit
   * attendre TOUS les chargements amont — session, tournoi, équipe — sinon il
   * se pose sur des données encore vides et n'est jamais rejoué (piège 4).
   */
  useEffect(() => {
    if (seeded || loading || !tournament) return;
    if (myTeamRegistration) {
      setSelected(myTeamRegistration.roster.map((r) => r.player_id));
    }
    setSeeded(true);
  }, [seeded, loading, tournament, myTeamRegistration]);

  /** Les joueurs déjà engagés sur ce tournoi ailleurs que dans mon roster. */
  const blockedBy = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of engagedTeams) {
      if (t.id === myTeamRegistration?.id) continue;
      for (const r of t.roster) map.set(r.player_id, 'Déjà engagé avec une autre équipe');
    }
    return map;
  }, [engagedTeams, myTeamRegistration]);

  function toggle(playerId: string) {
    setError(null);
    setSelected((current) => {
      if (current.includes(playerId)) {
        setTooMany(false);
        return current.filter((p) => p !== playerId);
      }
      if (current.length >= teamSize) {
        // Ne rien remplacer en douce : debout, un échange silencieux ne se voit
        // pas. On refuse et on dit pourquoi.
        setTooMany(true);
        return current;
      }
      setTooMany(false);
      return [...current, playerId];
    });
  }

  async function submit() {
    if (!supabase || !id || selected.length !== teamSize) return;
    setBusy(true);
    setError(null);
    const { error: dbError } = await supabase.rpc(
      alreadyRegistered ? 'update_team_roster' : 'register_team',
      { p_tournament_id: id, p_player_ids: selected }
    );
    setBusy(false);
    if (dbError) {
      setError(readableError(dbError.message, teamSize));
      return;
    }
    router.replace({ pathname: '/evenements/[id]', params: { id } });
  }

  /**
   * Retirer l'équipe entière. C'est une action destructrice qui touche
   * plusieurs personnes : elle vit dans le détail, jamais dans une liste, et
   * demande une seconde pression.
   */
  async function withdrawTeam() {
    if (!supabase || !id) return;
    if (!confirmingLeave) {
      setConfirmingLeave(true);
      setTimeout(() => setConfirmingLeave(false), 5000);
      return;
    }
    setConfirmingLeave(false);
    setBusy(true);
    setError(null);
    const { error: dbError } = await supabase.rpc('withdraw_team', { p_tournament_id: id });
    setBusy(false);
    if (dbError) {
      setError(readableError(dbError.message, teamSize));
      return;
    }
    router.replace({ pathname: '/evenements/[id]', params: { id } });
  }

  // ---------------------------------------------------------------------
  // États qui remplacent tout l'écran
  // ---------------------------------------------------------------------
  let content;
  if (loading) {
    content = (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.tint} />
      </View>
    );
  } else if (!tournament || tournament.type !== 'team') {
    content = (
      <EmptyState
        icon="alert-circle-outline"
        title="Ce tournoi ne se joue pas en équipe"
        body="Il n’y a pas de roster à composer ici."
        actionLabel="Retour au tournoi"
        onAction={leave}
      />
    );
  } else if (!team) {
    content = (
      <EmptyState
        icon="people-outline"
        title="Tu n’as pas encore d’équipe"
        body="Ce tournoi se joue en équipe. Rejoins une équipe avec le code de son capitaine, ou crée la tienne."
        actionLabel="Aller aux équipes"
        onAction={() => router.replace('/(tabs)/equipes')}
      />
    );
  } else if (!isCaptain) {
    content = (
      <EmptyState
        icon="shield-outline"
        title="Seul le capitaine inscrit l’équipe"
        body={`${team.members.find((m) => m.role === 'captain')?.profile?.pseudo ?? 'Le capitaine'} peut engager ${team.name} sur ce tournoi.`}
        actionLabel="Voir mon équipe"
        onAction={() => router.replace({ pathname: '/equipes/[id]', params: { id: team.id } })}
      />
    );
  } else if (tournament.status !== 'open') {
    content = (
      <EmptyState
        icon="lock-closed-outline"
        title="Les inscriptions sont closes"
        body="Ce tournoi n’accepte plus d’équipe."
        actionLabel="Retour au tournoi"
        onAction={leave}
      />
    );
  } else if (team.members.length < teamSize) {
    // L'état le plus probable : une équipe se remplit avant de s'engager.
    content = (
      <EmptyState
        icon="person-add-outline"
        title={`Ton équipe compte ${team.members.length} joueur${team.members.length > 1 ? 's' : ''} sur les ${teamSize} requis`}
        body="Invite un joueur avec le code d’invitation de ton équipe, puis reviens inscrire l’équipe."
        actionLabel="Voir mon équipe"
        onAction={() => router.replace({ pathname: '/equipes/[id]', params: { id: team.id } })}
      />
    );
  } else {
    const complete = selected.length === teamSize;
    const remaining = teamSize - selected.length;
    const waitlist = isFull && !alreadyRegistered;

    content = (
      <>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
            <View style={styles.cardHeader}>
              <Ionicons name="people-outline" size={16} color={colors.textSecondary} />
              <ThemedText type="small" themeColor="textSecondary">
                Mon équipe
              </ThemedText>
            </View>
            <ThemedText type="subtitle">{team.name}</ThemedText>
            {team.region ? (
              <ThemedText type="small" themeColor="textSecondary">
                {team.region}
              </ThemedText>
            ) : null}
          </View>

          {/* Jauge de composition : le compte d'abord, en gros. */}
          <View style={styles.gauge}>
            <View style={styles.gaugeHeader}>
              <ThemedText style={styles.gaugeCount}>
                {selected.length} joueur{selected.length > 1 ? 's' : ''} sur {teamSize}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Format : équipes de {teamSize}
              </ThemedText>
            </View>
            <View style={[styles.track, { backgroundColor: colors.backgroundSelected }]}>
              <View
                style={[
                  styles.fill,
                  {
                    backgroundColor: colors.tint,
                    width: `${Math.min(100, (selected.length / teamSize) * 100)}%`,
                  },
                ]}
              />
            </View>
            {tooMany ? (
              <ThemedText type="small" style={{ color: RedColor[mode] }}>
                Le roster est complet. Retire un joueur avant d’en ajouter un autre.
              </ThemedText>
            ) : complete ? (
              <View style={styles.completeRow}>
                <Ionicons name="checkmark-circle" size={16} color={GreenColor[mode]} />
                <ThemedText type="smallBold" style={{ color: GreenColor[mode] }}>
                  Roster complet.
                </ThemedText>
              </View>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                {selected.length === 0
                  ? `Choisis ${teamSize} joueurs parmi les ${team.members.length} membres de ton équipe.`
                  : `Encore ${remaining} joueur${remaining > 1 ? 's' : ''} à choisir.`}
              </ThemedText>
            )}
          </View>

          <View style={styles.list}>
            {team.members.map((member) => (
              <RosterPickRow
                key={member.id}
                member={member}
                selected={selected.includes(member.player_id)}
                position={selected.indexOf(member.player_id) + 1}
                blockedReason={blockedBy.get(member.player_id) ?? null}
                onPress={() => toggle(member.player_id)}
              />
            ))}
          </View>

          <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
            <View style={styles.cardHeader}>
              <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} />
              <ThemedText type="small" themeColor="textSecondary">
                Ce que ça engage
              </ThemedText>
            </View>
            <ThemedText type="small">
              Les {teamSize} joueurs choisis seront inscrits à ce tournoi.
            </ThemedText>
            <ThemedText type="small">
              Chacun devra déclarer sa faction, et sa liste d’armée si l’organisation la demande.
            </ThemedText>
            <ThemedText type="small">
              Toi seul peux modifier le roster, tant que les inscriptions sont ouvertes.
            </ThemedText>
          </View>

          <ThemedText type="small" themeColor="textSecondary">
            L’ordre de sélection fixe l’ordre du roster. Il sert d’appariement de départ
            face à l’équipe adverse.
          </ThemedText>
        </ScrollView>

        <View style={[styles.actionBar, { borderTopColor: colors.backgroundSelected }]}>
          {error ? (
            <View style={[styles.banner, { backgroundColor: RedBackground[mode] }]}>
              <ThemedText type="small" style={{ color: RedColor[mode] }}>
                {error}
              </ThemedText>
            </View>
          ) : null}
          {!complete ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
              Choisis encore {remaining} joueur{remaining > 1 ? 's' : ''} pour inscrire l’équipe.
            </ThemedText>
          ) : waitlist ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
              Complet. Les places libérées vont aux équipes dans l’ordre de la liste.
            </ThemedText>
          ) : null}
          <Pressable
            onPress={submit}
            disabled={!complete || busy}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.primaryButton,
              {
                backgroundColor: complete ? colors.tint : colors.backgroundSelected,
                opacity: pressed ? 0.8 : 1,
              },
            ]}>
            {busy ? (
              <ActivityIndicator color={complete ? OnTint[mode] : colors.textSecondary} />
            ) : (
              <ThemedText
                type="smallBold"
                style={{ color: complete ? OnTint[mode] : colors.textSecondary }}>
                {alreadyRegistered
                  ? 'Enregistrer le roster'
                  : waitlist
                    ? 'Mettre l’équipe en liste d’attente'
                    : `Inscrire l’équipe (${teamSize} joueurs)`}
              </ThemedText>
            )}
          </Pressable>
          {alreadyRegistered ? (
            <Pressable
              onPress={withdrawTeam}
              disabled={busy}
              accessibilityRole="button"
              style={styles.leaveButton}>
              <ThemedText type="smallBold" style={{ color: RedColor[mode] }}>
                {confirmingLeave
                  ? 'Confirmer le retrait de l’équipe'
                  : 'Retirer l’équipe du tournoi'}
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      </>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.headerRow}>
          <Pressable onPress={leave} style={styles.backButton} accessibilityLabel="Retour">
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>
          <View style={styles.headerTexts}>
            <ThemedText type="default" style={styles.headerTitle}>
              {alreadyRegistered ? 'Modifier le roster' : 'Inscrire mon équipe'}
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

/** Une ligne de choix du roster : case, pseudo, faction déclarée, ou raison du refus. */
function RosterPickRow({
  member,
  selected,
  position,
  blockedReason,
  onPress,
}: {
  member: TeamMember;
  selected: boolean;
  position: number;
  blockedReason: string | null;
  onPress: () => void;
}) {
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const colors = Colors[mode];
  const pseudo = member.profile?.pseudo ?? 'Joueur';
  const blocked = blockedReason !== null;

  return (
    <Pressable
      onPress={blocked ? undefined : onPress}
      disabled={blocked}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled: blocked }}
      accessibilityLabel={`${pseudo}, ${selected ? 'sélectionné dans le roster' : 'non sélectionné'}`}
      style={({ pressed }) => [
        styles.pickRow,
        {
          backgroundColor: selected ? TintBackground[mode] : colors.backgroundElement,
          borderColor: selected ? TintBorder[mode] : 'transparent',
          opacity: blocked ? 0.5 : pressed ? 0.8 : 1,
        },
      ]}>
      <View
        style={[
          styles.checkbox,
          selected
            ? { backgroundColor: colors.tint }
            : { borderWidth: 1, borderColor: colors.backgroundSelected },
        ]}>
        {selected ? <Ionicons name="checkmark" size={18} color={OnTint[mode]} /> : null}
      </View>
      <View style={styles.pickIdentity}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {pseudo}
        </ThemedText>
        {/* Jamais la faction favorite : elle dit ce qu'on aime jouer, pas ce
            qu'on aligne. Et le capitaine ne déclare pas pour ses joueurs. */}
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {blockedReason ?? 'Faction déclarée après l’inscription'}
        </ThemedText>
      </View>
      {selected ? (
        <View style={[styles.position, { backgroundColor: colors.tint }]}>
          <ThemedText type="smallBold" style={{ color: OnTint[mode] }}>
            {position}
          </ThemedText>
        </View>
      ) : null}
    </Pressable>
  );
}

/** Un état vide riche : on dit ce qui manque, et on offre le geste suivant. */
function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
}) {
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const colors = Colors[mode];
  return (
    <View style={styles.centered}>
      <Ionicons name={icon} size={48} color={colors.textSecondary} />
      <ThemedText type="subtitle" style={styles.centeredText}>
        {title}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
        {body}
      </ThemedText>
      <Pressable
        onPress={onAction}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.primaryButton,
          { backgroundColor: colors.tint, opacity: pressed ? 0.8 : 1 },
        ]}>
        <ThemedText type="smallBold" style={{ color: OnTint[mode] }}>
          {actionLabel}
        </ThemedText>
      </Pressable>
    </View>
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
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  centeredText: { textAlign: 'center' },
  card: { borderRadius: Spacing.two, padding: Spacing.three, gap: Spacing.one },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  gauge: { gap: Spacing.one },
  gaugeHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  gaugeCount: { fontSize: 22, fontWeight: '700' },
  track: { height: 6, borderRadius: 999, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 999 },
  completeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.half },
  list: { gap: Spacing.two },
  pickRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Spacing.two,
    borderWidth: 1,
  },
  checkbox: { width: 28, height: 28, borderRadius: Spacing.two, alignItems: 'center', justifyContent: 'center' },
  pickIdentity: { flex: 1 },
  position: { width: 24, height: 24, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  actionBar: {
    borderTopWidth: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
    gap: Spacing.two,
  },
  banner: { borderRadius: Spacing.two, padding: Spacing.two },
  leaveButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  primaryButton: {
    minHeight: 52,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.three,
  },
});
