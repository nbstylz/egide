import { Pressable, StyleSheet, useColorScheme, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';

type Option = {
  value: string;
  label: string;
  disabled?: boolean;
  /** Petit badge affiché à côté du libellé (ex. « Bientôt »). */
  badge?: string;
};

type Props = {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
};

/** Sélecteur segmenté fait maison (2-3 options), façon iOS. */
export function SegmentedControl({ options, value, onChange }: Props) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <View style={[styles.track, { backgroundColor: colors.backgroundElement }]}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            disabled={option.disabled}
            onPress={() => onChange(option.value)}
            style={[styles.segment, active && { backgroundColor: colors.background }]}>
            <ThemedText
              type={active ? 'smallBold' : 'small'}
              style={option.disabled ? { color: colors.textSecondary, opacity: 0.5 } : null}>
              {option.label}
            </ThemedText>
            {option.badge ? (
              <View style={[styles.badge, { backgroundColor: colors.backgroundSelected }]}>
                <ThemedText themeColor="textSecondary" style={styles.badgeText}>
                  {option.badge}
                </ThemedText>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: Spacing.two,
    padding: Spacing.half,
    alignSelf: 'stretch',
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.two,
    borderRadius: 6,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: Spacing.one,
    paddingVertical: 1,
  },
  badgeText: {
    fontSize: 10,
    lineHeight: 14,
  },
});
