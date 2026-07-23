import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useColorScheme, View } from 'react-native';
import type { ReactNode } from 'react';

import { Colors } from '@/constants/theme';

/**
 * Ligne d'information avec icône alignée sur une colonne fixe de 18 px,
 * pour un alignement vertical propre entre plusieurs lignes.
 */
export function MetaRow({
  icon,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  children: ReactNode;
}) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  return (
    <View style={styles.row}>
      <View style={styles.icon}>
        <Ionicons name={icon} size={14} color={colors.textSecondary} />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    width: 18,
    alignItems: 'flex-start',
  },
});
