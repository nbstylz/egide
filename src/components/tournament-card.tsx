import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, useColorScheme, View } from 'react-native';

import { MetaRow } from '@/components/meta-row';
import { StatusBadge } from '@/components/status-badge';
import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';
import { formatEventDateShort, TypeLabels } from '@/lib/tournaments';
import type { TournamentWithCount } from '@/hooks/use-tournaments';

/** Vert « urgence positive » (peu de places restantes). */
const GreenColor = { light: '#1E7C45', dark: '#63D489' };
/** Rouge des badges « Complet ». */
const RedColor = { light: '#C13438', dark: '#FF6369' };
const RedBackground = { light: 'rgba(209,67,67,0.10)', dark: 'rgba(255,99,105,0.14)' };

/**
 * Carte « Mes tournois » : nom + badge de statut, date/ville, inscrits, chevron.
 * Les tournois terminés ou annulés sont atténués.
 */
export function MyTournamentCard({
  tournament,
  onPress,
}: {
  tournament: TournamentWithCount;
  onPress?: () => void;
}) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const muted = tournament.status === 'completed' || tournament.status === 'cancelled';
  const full = tournament.registered_count >= tournament.capacity;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: pressed ? colors.backgroundSelected : colors.backgroundElement },
      ]}>
      <View style={styles.cardBody}>
        <View style={styles.titleRow}>
          <ThemedText
            type="default"
            numberOfLines={1}
            style={[styles.cardTitle, muted && { color: colors.textSecondary }]}>
            {tournament.name}
          </ThemedText>
          <StatusBadge status={tournament.status} />
        </View>
        <MetaRow icon="calendar-outline">
          <ThemedText type="small" themeColor="textSecondary">
            {formatEventDateShort(tournament.event_date)} · {tournament.city}
          </ThemedText>
        </MetaRow>
        <MetaRow icon="people-outline">
          {full ? (
            <ThemedText type="smallBold">Complet · {tournament.capacity} joueurs</ThemedText>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              {tournament.registered_count} / {tournament.capacity} inscrits
            </ThemedText>
          )}
        </MetaRow>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
    </Pressable>
  );
}

/**
 * Carte « Événement » de l'annuaire public : nom + badge de type,
 * date en gras, format, places restantes (vert quand il en reste peu,
 * badge rouge « Complet » quand il n'y en a plus).
 */
export function EventCard({
  tournament,
  onPress,
}: {
  tournament: TournamentWithCount;
  onPress?: () => void;
}) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const mode = scheme === 'dark' ? 'dark' : 'light';

  const remaining = tournament.capacity - tournament.registered_count;
  const full = remaining <= 0;
  const scarce = !full && (remaining <= 4 || remaining <= tournament.capacity * 0.2);

  let placesContent;
  if (full) {
    placesContent = (
      <View style={[styles.fullBadge, { backgroundColor: RedBackground[mode] }]}>
        <ThemedText type="smallBold" style={[styles.fullBadgeText, { color: RedColor[mode] }]}>
          Complet
        </ThemedText>
      </View>
    );
  } else if (scarce) {
    placesContent = (
      <ThemedText type="smallBold" style={{ color: GreenColor[mode] }}>
        Plus que {remaining} {remaining > 1 ? 'places' : 'place'}
      </ThemedText>
    );
  } else {
    placesContent = (
      <ThemedText type="smallBold">
        {remaining} places restantes
      </ThemedText>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: pressed ? colors.backgroundSelected : colors.backgroundElement },
      ]}>
      <View style={styles.cardBody}>
        <View style={styles.titleRow}>
          <ThemedText
            type="default"
            numberOfLines={2}
            style={[styles.cardTitle, full && { fontWeight: '500' }]}>
            {tournament.name}
          </ThemedText>
          <View style={[styles.typeBadge, { backgroundColor: colors.backgroundSelected }]}>
            <ThemedText themeColor="textSecondary" style={styles.typeBadgeText}>
              {TypeLabels[tournament.type]}
            </ThemedText>
          </View>
        </View>
        <MetaRow icon="calendar-outline">
          <ThemedText type="small">
            <ThemedText type="smallBold">{formatEventDateShort(tournament.event_date)}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {'  ·  '}
              {tournament.city}
              {tournament.region ? `, ${tournament.region}` : ''}
            </ThemedText>
          </ThemedText>
        </MetaRow>
        <MetaRow icon="flag-outline">
          <ThemedText type="small" themeColor="textSecondary">
            {tournament.points_limit} pts · {tournament.rounds_count} rondes
          </ThemedText>
        </MetaRow>
        <View style={styles.placesRow}>
          <MetaRow icon="people-outline">{placesContent}</MetaRow>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  cardBody: {
    flex: 1,
    gap: Spacing.one,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  cardTitle: {
    flex: 1,
    fontWeight: '700',
  },
  placesRow: {
    marginTop: Spacing.one,
  },
  typeBadge: {
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },
  typeBadgeText: {
    fontSize: 12,
    lineHeight: 16,
  },
  fullBadge: {
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    alignSelf: 'flex-start',
  },
  fullBadgeText: {
    fontSize: 12,
    lineHeight: 16,
  },
});
