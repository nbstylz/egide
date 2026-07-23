import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  useColorScheme,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

/** Traduit les erreurs Supabase les plus courantes en français. */
function translateAuthError(message: string): string {
  if (message.includes('Invalid login credentials')) {
    return 'Email ou mot de passe incorrect.';
  }
  if (message.includes('Password should be at least')) {
    return 'Le mot de passe doit contenir au moins 6 caractères.';
  }
  if (message.includes('User already registered')) {
    return 'Un compte existe déjà avec cet email.';
  }
  if (message.includes('Email not confirmed')) {
    return 'Confirme d’abord ton email : un lien t’a été envoyé par mail.';
  }
  if (message.includes('valid email')) {
    return 'Adresse email invalide.';
  }
  return message;
}

export function AuthForm() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; isError: boolean } | null>(null);

  async function handleSignIn() {
    if (!supabase) return;
    setBusy(true);
    setFeedback(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setFeedback({ text: translateAuthError(error.message), isError: true });
    }
    setBusy(false);
  }

  async function handleSignUp() {
    if (!supabase) return;
    setBusy(true);
    setFeedback(null);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setFeedback({ text: translateAuthError(error.message), isError: true });
    } else if (!data.session) {
      // Session absente = Supabase attend la confirmation de l'email.
      setFeedback({
        text: 'Compte créé ! Vérifie ta boîte mail et clique sur le lien de confirmation, puis connecte-toi.',
        isError: false,
      });
    }
    setBusy(false);
  }

  const inputStyle = [
    styles.input,
    {
      backgroundColor: colors.backgroundElement,
      color: colors.text,
      borderColor: colors.backgroundSelected,
    },
  ];

  return (
    <ThemedView style={styles.form}>
      <TextInput
        style={inputStyle}
        placeholder="Email"
        placeholderTextColor={colors.textSecondary}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        editable={!busy}
      />
      <TextInput
        style={inputStyle}
        placeholder="Mot de passe (6 caractères min.)"
        placeholderTextColor={colors.textSecondary}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        editable={!busy}
      />

      {feedback && (
        <ThemedText
          type="small"
          style={[styles.feedback, { color: feedback.isError ? '#D14343' : colors.tint }]}>
          {feedback.text}
        </ThemedText>
      )}

      {busy ? (
        <ActivityIndicator color={colors.tint} />
      ) : (
        <>
          <Pressable
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: colors.tint, opacity: pressed ? 0.8 : 1 },
            ]}
            onPress={handleSignIn}>
            <ThemedText style={styles.buttonPrimaryText}>Se connecter</ThemedText>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.button,
              {
                backgroundColor: colors.backgroundElement,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
            onPress={handleSignUp}>
            <ThemedText>Créer un compte</ThemedText>
          </Pressable>
        </>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  form: {
    alignSelf: 'stretch',
    gap: Spacing.three,
  },
  input: {
    borderRadius: Spacing.two,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  feedback: {
    textAlign: 'center',
  },
  button: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  buttonPrimaryText: {
    color: '#ffffff',
    fontWeight: '600',
  },
});
