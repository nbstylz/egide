import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Colors, MaxContentWidth, Spacing } from '@/constants/theme';

type SectionScreenProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  upcoming: string[];
};

/**
 * Écran de section provisoire : présente un pilier de l'app (Événements,
 * Tournois, Équipes, Profil) et la liste des fonctionnalités à venir.
 * Chaque écran sera remplacé par sa vraie implémentation au fil des phases.
 */
export function SectionScreen({ icon, title, subtitle, upcoming }: SectionScreenProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.heroSection}>
          <Ionicons name={icon} size={64} color={colors.tint} />
          <ThemedText type="title" style={styles.title}>
            {title}
          </ThemedText>
          <ThemedText type="default" style={styles.subtitle}>
            {subtitle}
          </ThemedText>
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="small" style={styles.cardHeader}>
            Bientôt disponible
          </ThemedText>
          {upcoming.map((item) => (
            <ThemedView key={item} style={styles.row}>
              <Ionicons name="hourglass-outline" size={16} color={colors.textSecondary} />
              <ThemedText type="small" style={styles.rowText}>
                {item}
              </ThemedText>
            </ThemedView>
          ))}
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
    maxWidth: MaxContentWidth,
  },
  heroSection: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
  },
  card: {
    gap: Spacing.three,
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    borderRadius: Spacing.four,
  },
  cardHeader: {
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: 'transparent',
  },
  rowText: {
    flex: 1,
  },
});
