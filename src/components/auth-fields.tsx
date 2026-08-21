import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, useColorScheme, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors, RedBackground, RedColor, Spacing, TintBorder } from '@/constants/theme';

type FieldProps = {
  value: string;
  onChangeText: (value: string) => void;
  editable?: boolean;
};

/** Champ email : jamais de majuscule automatique sur une adresse. */
export function EmailField({ value, onChangeText, editable = true }: FieldProps) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  return (
    <TextInput
      style={[
        styles.input,
        {
          backgroundColor: colors.backgroundElement,
          color: colors.text,
          borderColor: colors.backgroundSelected,
        },
      ]}
      placeholder="Email"
      placeholderTextColor={colors.textSecondary}
      value={value}
      onChangeText={onChangeText}
      autoCapitalize="none"
      autoComplete="email"
      keyboardType="email-address"
      autoCorrect={false}
      editable={editable}
    />
  );
}

/**
 * Champ mot de passe avec bascule afficher/masquer : indispensable pour
 * taper debout, téléphone en main.
 */
export function PasswordField({
  value,
  onChangeText,
  editable = true,
  placeholder = 'Mot de passe',
}: FieldProps & { placeholder?: string }) {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const [visible, setVisible] = useState(false);

  return (
    <View
      style={[
        styles.passwordRow,
        {
          backgroundColor: colors.backgroundElement,
          borderColor: colors.backgroundSelected,
        },
      ]}>
      <TextInput
        style={[styles.passwordInput, { color: colors.text }]}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
        editable={editable}
      />
      <Pressable
        onPress={() => setVisible((current) => !current)}
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        style={styles.eye}>
        <Ionicons
          name={visible ? 'eye-off-outline' : 'eye-outline'}
          size={20}
          color={colors.textSecondary}
        />
      </Pressable>
    </View>
  );
}

/** Bandeau d'erreur, avec une action facultative (renvoyer un email…). */
export function AuthError({
  message,
  action,
}: {
  message: string;
  action?: { label: string; onPress: () => void };
}) {
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: RedBackground[mode], borderColor: TintBorder[mode] },
      ]}>
      <ThemedText type="small" style={{ color: RedColor[mode] }}>
        {message}
      </ThemedText>
      {action ? (
        <Pressable onPress={action.onPress} accessibilityRole="button" style={styles.bannerAction}>
          <ThemedText type="smallBold" style={{ color: RedColor[mode] }}>
            {action.label}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderRadius: Spacing.two,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
    minHeight: 52,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Spacing.two,
    borderWidth: 1,
    paddingRight: Spacing.two,
    minHeight: 52,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  eye: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  banner: {
    borderRadius: Spacing.two,
    borderWidth: 1,
    padding: Spacing.two,
    gap: Spacing.one,
  },
  bannerAction: {
    minHeight: 44,
    justifyContent: 'center',
  },
});
