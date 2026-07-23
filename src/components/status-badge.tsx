import { StyleSheet, useColorScheme, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { StatusLabels, type TournamentStatus } from '@/lib/tournaments';

/** Couleurs des badges par statut : { texte, fond, bordure? } en clair et sombre. */
const BadgeColors: Record<
  TournamentStatus,
  { light: [string, string, string?]; dark: [string, string, string?] }
> = {
  draft: {
    light: ['#60646C', 'transparent', '#E0E1E6'],
    dark: ['#B0B4BA', 'transparent', '#2E3135'],
  },
  open: {
    light: ['#1E7C45', 'rgba(30,124,69,0.10)'],
    dark: ['#63D489', 'rgba(99,212,137,0.14)'],
  },
  in_progress: {
    light: ['#9C7A1F', 'rgba(156,122,31,0.10)'],
    dark: ['#D4AF37', 'rgba(212,175,55,0.14)'],
  },
  completed: {
    light: ['#60646C', '#E0E1E6'],
    dark: ['#B0B4BA', '#2E3135'],
  },
  cancelled: {
    light: ['#C13438', 'rgba(209,67,67,0.10)'],
    dark: ['#FF6369', 'rgba(255,99,105,0.14)'],
  },
};

/** Pastille de statut d'un tournoi (libellé français, lisible en clair et sombre). */
export function StatusBadge({ status }: { status: TournamentStatus }) {
  const scheme = useColorScheme();
  const [text, background, border] = BadgeColors[status][scheme === 'dark' ? 'dark' : 'light'];

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: background },
        border ? { borderWidth: 1, borderColor: border } : null,
      ]}>
      <ThemedText type="smallBold" style={[styles.label, { color: text }]}>
        {StatusLabels[status]}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
  },
});
