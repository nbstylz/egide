import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

/**
 * En-tête d'écran à contenu : titre 32 px aligné à gauche + sous-titre gris.
 * Remplace le « hero » centré sur les écrans qui affichent des listes.
 */
export function ScreenHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <ThemedView style={styles.header}>
      <ThemedText type="title" style={styles.title}>
        {title}
      </ThemedText>
      {subtitle ? (
        <ThemedText type="small" themeColor="textSecondary">
          {subtitle}
        </ThemedText>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  header: {
    alignSelf: 'stretch',
    gap: Spacing.one,
    marginBottom: Spacing.three,
  },
  title: {
    fontSize: 32,
    lineHeight: 40,
  },
});
