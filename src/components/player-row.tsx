import { StyleSheet, useColorScheme, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';
import type { RegistrationRow } from '@/hooks/use-tournament-detail';
import { ordinalFr } from '@/lib/ordinal';

const GreenColor = { light: '#1E7C45', dark: '#63D489' };
const GreenBackground = { light: 'rgba(30,124,69,0.10)', dark: 'rgba(99,212,137,0.14)' };
const TintBackground = { light: 'rgba(156,122,31,0.10)', dark: 'rgba(212,175,55,0.14)' };

type Props = {
  registration: RegistrationRow;
  /** Vrai s'il s'agit du joueur connecté : la ligne est alors mise en avant. */
  isMe?: boolean;
  /** Rang dans la liste d'attente ; la pastille affiche alors « 3e ». */
  waitlistPosition?: number;
  /** Affiche la puce « Présent » (utile seulement le jour du tournoi). */
  showCheckedIn?: boolean;
};

/**
 * Une ligne de joueur : pastille (initiale ou rang), pseudo et faction.
 * Utilisée dans la fiche événement et dans l'écran complet des inscrits.
 */
export function PlayerRow({ registration, isMe, waitlistPosition, showCheckedIn }: Props) {
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const colors = Colors[mode];

  const pseudo = registration.profile?.pseudo ?? 'Joueur';
  const faction = registration.profile?.faction_favorite;
  const isWaitlist = waitlistPosition !== undefined;

  let badgeBackground: string = colors.backgroundSelected;
  let badgeColor: string = colors.textSecondary;
  if (isWaitlist) {
    badgeBackground = TintBackground[mode];
    badgeColor = colors.tint;
  } else if (isMe) {
    badgeBackground = colors.tint;
    badgeColor = '#ffffff';
  }

  return (
    <View style={[styles.row, isMe && { backgroundColor: colors.backgroundSelected }]}>
      <View style={[styles.avatar, { backgroundColor: badgeBackground }]}>
        <ThemedText style={[isWaitlist ? styles.avatarRank : styles.avatarInitial, { color: badgeColor }]}>
          {isWaitlist ? ordinalFr(waitlistPosition) : pseudo.charAt(0).toUpperCase()}
        </ThemedText>
      </View>

      <View style={styles.texts}>
        <ThemedText type={isMe ? 'smallBold' : 'small'} numberOfLines={1}>
          {pseudo}
        </ThemedText>
        {faction ? (
          <ThemedText themeColor="textSecondary" style={styles.faction} numberOfLines={1}>
            {faction}
          </ThemedText>
        ) : null}
      </View>

      {isMe ? (
        <View style={[styles.chip, { backgroundColor: colors.tint }]}>
          <ThemedText style={[styles.chipText, { color: '#ffffff' }]}>toi</ThemedText>
        </View>
      ) : null}

      {showCheckedIn && registration.status === 'checked_in' ? (
        <View style={[styles.chip, { backgroundColor: GreenBackground[mode] }]}>
          <ThemedText style={[styles.chipText, { color: GreenColor[mode] }]}>Présent</ThemedText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 48,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    marginHorizontal: -Spacing.two,
    borderRadius: Spacing.two,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  avatarRank: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  texts: {
    flex: 1,
  },
  faction: {
    fontSize: 12,
    lineHeight: 16,
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
});
