import { StyleSheet, useColorScheme, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import {
  Colors,
  GreenBackground,
  GreenColor,
  OnTint,
  Spacing,
  TintBackground,
} from '@/constants/theme';
import type { RegistrationRow } from '@/hooks/use-tournament-detail';
import { ordinalFr } from '@/lib/ordinal';

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
 *
 * La faction affichée est celle DÉCLARÉE pour ce tournoi (US-9.3), jamais la
 * faction favorite du profil : celle-ci disait « ce que j'aime jouer », pas
 * « ce que j'aligne aujourd'hui ». Rien ne s'affiche tant que rien n'est
 * déclaré — mieux vaut ne rien montrer que raconter une histoire fausse.
 */
export function PlayerRow({ registration, isMe, waitlistPosition, showCheckedIn }: Props) {
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const colors = Colors[mode];

  const pseudo = registration.profile?.pseudo ?? 'Joueur';
  const faction = registration.faction;
  const isWaitlist = waitlistPosition !== undefined;

  let badgeBackground: string = colors.backgroundSelected;
  let badgeColor: string = colors.textSecondary;
  if (isWaitlist) {
    badgeBackground = TintBackground[mode];
    badgeColor = colors.tint;
  } else if (isMe) {
    badgeBackground = colors.tint;
    badgeColor = OnTint[mode];
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
          <ThemedText style={[styles.chipText, { color: OnTint[mode] }]}>toi</ThemedText>
        </View>
      ) : null}

      {showCheckedIn && registration.status === 'checked_in' ? (
        <View style={[styles.chip, { backgroundColor: GreenBackground[mode] }]}>
          <ThemedText style={[styles.chipText, { color: GreenColor[mode] }]}>Présent</ThemedText>
        </View>
      ) : null}

      {/* Abandon : puce neutre, jamais rouge — c'est une information, pas une faute. */}
      {registration.status === 'dropped' ? (
        <View style={[styles.chip, { backgroundColor: colors.backgroundSelected }]}>
          <ThemedText style={[styles.chipText, { color: colors.textSecondary }]}>
            Abandon{registration.dropped_round ? ` · R${registration.dropped_round}` : ''}
          </ThemedText>
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
