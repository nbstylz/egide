import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, useColorScheme, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';
import type { TeamMember } from '@/hooks/use-my-team';

type Props = {
  member: TeamMember;
  /** Souligne la ligne du joueur connecté. */
  isMe: boolean;
  /** Le capitaine peut ouvrir les actions sur chaque autre membre. */
  onPress?: () => void;
};

/** Une ligne du roster : initiale, pseudo, faction, rôle. */
export function MemberRow({ member, isMe, onPress }: Props) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const pseudo = member.profile?.pseudo ?? 'Joueur';
  const captain = member.role === 'captain';

  const content = (
    <>
      <View style={[styles.avatar, { backgroundColor: colors.backgroundSelected }]}>
        <ThemedText type="smallBold">{pseudo.slice(0, 1).toUpperCase()}</ThemedText>
      </View>
      <View style={styles.identity}>
        <View style={styles.nameLine}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {pseudo}
          </ThemedText>
          {isMe ? (
            <ThemedText type="small" themeColor="textSecondary">
              (toi)
            </ThemedText>
          ) : null}
        </View>
        {member.profile?.faction_favorite ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {member.profile.faction_favorite}
          </ThemedText>
        ) : null}
      </View>
      {captain ? (
        <View style={[styles.roleBadge, { backgroundColor: colors.backgroundSelected }]}>
          <Ionicons name="shield-checkmark" size={12} color={colors.tint} />
          <ThemedText type="small" style={{ color: colors.tint }}>
            Capitaine
          </ThemedText>
        </View>
      ) : null}
      {onPress ? (
        <Ionicons name="ellipsis-horizontal" size={20} color={colors.textSecondary} />
      ) : null}
    </>
  );

  if (!onPress) {
    return <View style={[styles.row, { backgroundColor: colors.backgroundElement }]}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Actions sur ${pseudo}`}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.backgroundSelected : colors.backgroundElement },
      ]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.two,
    minHeight: 64,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: {
    flex: 1,
    gap: 1,
  },
  nameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
});
