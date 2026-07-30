import { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, useColorScheme, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';
import { CodeLength, normalizeCode } from '@/lib/invite-code';

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Appelé dès que les 6 caractères sont saisis : pas de bouton à chercher. */
  onComplete: (code: string) => void;
  disabled?: boolean;
};

/**
 * Six cases pour un code dicté à voix haute. Un seul TextInput invisible
 * reçoit la frappe : les cases ne sont que l'affichage, ce qui évite la
 * gestion du focus case par case (et les collages qui n'atterrissent que
 * dans la première).
 */
export function JoinCodeInput({ value, onChange, onComplete, disabled }: Props) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  function handleChange(rawText: string) {
    // Le champ natif peut contenir plus que la valeur contrôlée (séparateurs
    // rejetés par la normalisation) : on repart toujours du texte brut.
    const clean = normalizeCode(rawText);
    onChange(clean);
    if (clean.length === CodeLength) {
      input.current?.blur();
      onComplete(clean);
    }
  }

  const cells = Array.from({ length: CodeLength }, (_, index) => index);

  return (
    <Pressable
      onPress={() => input.current?.focus()}
      accessibilityRole="button"
      accessibilityLabel="Saisir le code d’invitation">
      <View style={styles.cells}>
        {cells.map((index) => {
          const character = value[index] ?? '';
          const active = focused && index === Math.min(value.length, CodeLength - 1);
          return (
            <View
              key={index}
              style={[
                styles.cell,
                {
                  backgroundColor: colors.background,
                  borderColor: active ? colors.tint : colors.backgroundSelected,
                },
              ]}>
              <ThemedText style={styles.cellText}>{character}</ThemedText>
            </View>
          );
        })}
      </View>
      <TextInput
        ref={input}
        value={value}
        onChangeText={handleChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        editable={!disabled}
        // Pas de maxLength : les séparateurs tapés (« ABC-DEF ») restent dans
        // le champ natif tant que la normalisation ne change pas la valeur,
        // et mangeraient le quota — le dernier caractère serait perdu.
        // `normalizeCode` borne déjà la longueur.
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        // Le code mêle lettres et chiffres : clavier normal, pas numérique.
        keyboardType="default"
        style={styles.hiddenInput}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cells: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignSelf: 'stretch',
  },
  cell: {
    flex: 1,
    aspectRatio: 0.8,
    maxHeight: 56,
    borderRadius: Spacing.two,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
  },
  hiddenInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
    // Le curseur natif ne doit pas apparaître par-dessus les cases.
    color: 'transparent',
  },
});
