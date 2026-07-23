import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, TextInput, useColorScheme } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';

type Props = {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  /** Incrément des boutons − / + (ex. 2 pour la capacité). */
  step?: number;
  disabled?: boolean;
};

/**
 * Contrôle numérique « − / valeur / + ». La valeur centrale est aussi
 * saisissable directement au clavier numérique.
 */
export function Stepper({ value, onChange, min, max, step = 1, disabled }: Props) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  function handleTextChange(text: string) {
    const parsed = parseInt(text.replace(/[^0-9]/g, ''), 10);
    // On laisse taper librement ; la borne est appliquée à la validation du formulaire.
    onChange(Number.isNaN(parsed) ? min : parsed);
  }

  const buttonStyle = ({ pressed }: { pressed: boolean }) => [
    styles.button,
    { backgroundColor: colors.backgroundElement, opacity: pressed ? 0.7 : 1 },
  ];

  return (
    <ThemedView style={styles.row}>
      <Pressable
        style={buttonStyle}
        disabled={disabled}
        onPress={() => onChange(clamp(value - step))}
        accessibilityLabel="Diminuer">
        <Ionicons name="remove" size={20} color={colors.text} />
      </Pressable>
      <TextInput
        style={[styles.value, { color: colors.text }]}
        value={String(value)}
        onChangeText={handleTextChange}
        keyboardType="number-pad"
        editable={!disabled}
      />
      <Pressable
        style={buttonStyle}
        disabled={disabled}
        onPress={() => onChange(clamp(value + step))}
        accessibilityLabel="Augmenter">
        <Ionicons name="add" size={20} color={colors.text} />
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    alignSelf: 'flex-start',
  },
  button: {
    width: 44,
    height: 44,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    minWidth: 64,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '600',
    paddingVertical: 0,
  },
});
