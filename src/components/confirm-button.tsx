import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useColorScheme } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';

const RedColor = { light: '#D14343', dark: '#FF6369' };
const RedBackground = { light: 'rgba(209,67,67,0.10)', dark: 'rgba(255,99,105,0.14)' };

type Props = {
  label: string;
  /** Libellé de la seconde pression, qui déclenche vraiment l'action. */
  confirmLabel: string;
  /** Conséquence énoncée : une confirmation sans conséquence n'est qu'un clic de plus. */
  consequence?: string;
  busy?: boolean;
  onConfirm: () => void;
};

/**
 * Bouton destructif à double pression, avec retour à l'état initial au bout
 * de cinq secondes. Même comportement sur mobile et sur web : une alerte
 * native ne fonctionnerait pas sur web et s'apprendrait deux fois.
 */
export function ConfirmButton({
  label,
  confirmLabel,
  consequence,
  busy = false,
  onConfirm,
}: Props) {
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const colors = Colors[mode];
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function handlePress() {
    if (busy) return;
    if (armed) {
      if (timer.current) clearTimeout(timer.current);
      setArmed(false);
      onConfirm();
      return;
    }
    setArmed(true);
    timer.current = setTimeout(() => setArmed(false), 5000);
  }

  return (
    <ThemedView style={styles.wrapper}>
      {armed && consequence ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.consequence}>
          {consequence}
        </ThemedText>
      ) : null}
      <Pressable
        onPress={handlePress}
        disabled={busy}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: armed ? RedBackground[mode] : colors.backgroundElement,
            opacity: pressed ? 0.8 : 1,
          },
        ]}>
        {busy ? (
          <ActivityIndicator color={RedColor[mode]} />
        ) : (
          <ThemedText style={{ color: RedColor[mode], fontWeight: armed ? '700' : '500' }}>
            {armed ? confirmLabel : label}
          </ThemedText>
        )}
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: 'stretch',
    gap: Spacing.one,
  },
  consequence: {
    textAlign: 'center',
  },
  button: {
    minHeight: 52,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
});
