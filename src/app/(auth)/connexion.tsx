import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useColorScheme,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthError, EmailField, PasswordField } from '@/components/auth-fields';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, MaxContentWidth, OnTint, Spacing } from '@/constants/theme';
import { translateAuthError } from '@/lib/auth-errors';
import { supabase } from '@/lib/supabase';

export default function ConnexionScreen() {
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const colors = Colors[mode];

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resent, setResent] = useState(false);

  async function handleSignIn() {
    if (!supabase || busy) return;
    setBusy(true);
    setError(null);
    setUnconfirmed(false);
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (authError) {
      setError(translateAuthError(authError.message));
      setUnconfirmed(authError.message.includes('Email not confirmed'));
      return;
    }
    // Pas de navigation manuelle : la garde du layout racine prend le relais
    // et route vers les onglets ou la création de profil.
  }

  async function resendConfirmation() {
    if (!supabase) return;
    await supabase.auth.resend({ type: 'signup', email });
    setResent(true);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Pressable
          onPress={() => router.back()}
          accessibilityLabel="Retour"
          style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </Pressable>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <ThemedText type="title" style={styles.title}>
              Connexion
            </ThemedText>

            <EmailField value={email} onChangeText={setEmail} editable={!busy} />
            <PasswordField value={password} onChangeText={setPassword} editable={!busy} />

            {error ? (
              <AuthError
                message={resent ? 'Email de confirmation renvoyé. Vérifie ta boîte mail.' : error}
                action={
                  unconfirmed && !resent
                    ? { label: 'Renvoyer l’email de confirmation', onPress: resendConfirmation }
                    : undefined
                }
              />
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={handleSignIn}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: colors.tint, opacity: pressed ? 0.8 : 1 },
              ]}>
              {busy ? (
                <ActivityIndicator color={OnTint[mode]} />
              ) : (
                <ThemedText type="smallBold" style={{ color: OnTint[mode] }}>
                  Se connecter
                </ThemedText>
              )}
            </Pressable>

            <View style={styles.footer}>
              <ThemedText type="small" themeColor="textSecondary">
                Pas encore de compte ?
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.replace('/(auth)/inscription')}
                style={styles.footerLink}>
                <ThemedText type="smallBold" style={{ color: colors.tint }}>
                  Créer un compte
                </ThemedText>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
    width: '100%',
    paddingHorizontal: Spacing.four,
  },
  flex: {
    flex: 1,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -Spacing.two,
    marginTop: Spacing.two,
  },
  content: {
    gap: Spacing.three,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.six,
  },
  title: {
    fontSize: 32,
    lineHeight: 40,
    marginBottom: Spacing.two,
  },
  button: {
    minHeight: 52,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    marginTop: Spacing.two,
  },
  footerLink: {
    minHeight: 44,
    justifyContent: 'center',
  },
});
