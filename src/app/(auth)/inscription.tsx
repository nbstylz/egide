import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
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

/** Délai avant de pouvoir redemander un email : Supabase limite les envois. */
const ResendDelay = 60;

export default function InscriptionScreen() {
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const colors = Colors[mode];

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  /** Bascule vers l'état « vérifie tes emails » quand signUp ne rend pas de session. */
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function handleSignUp() {
    if (!supabase || busy) return;
    setBusy(true);
    setError(null);
    setAlreadyRegistered(false);
    const { data, error: authError } = await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (authError) {
      setError(translateAuthError(authError.message));
      setAlreadyRegistered(authError.message.includes('User already registered'));
      return;
    }
    if (!data.session) {
      // Pas de session : Supabase attend la confirmation de l'email.
      setAwaitingConfirmation(true);
      setCooldown(ResendDelay);
    }
    // Avec session, la garde du layout racine enchaîne sur la création de profil.
  }

  /** Retente la connexion une fois le lien de confirmation ouvert. */
  async function retrySignIn() {
    if (!supabase || busy) return;
    setBusy(true);
    setError(null);
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (authError) {
      setError(
        authError.message.includes('Email not confirmed')
          ? 'Ton email n’est pas encore confirmé. Le lien peut mettre quelques minutes à arriver.'
          : translateAuthError(authError.message)
      );
    }
  }

  async function resend() {
    if (!supabase || cooldown > 0) return;
    const { error: authError } = await supabase.auth.resend({ type: 'signup', email });
    setError(authError ? translateAuthError(authError.message) : null);
    setCooldown(ResendDelay);
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <Pressable
          onPress={() => (awaitingConfirmation ? setAwaitingConfirmation(false) : router.back())}
          accessibilityLabel="Retour"
          style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </Pressable>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {awaitingConfirmation ? (
              <View style={styles.confirmation}>
                <Ionicons name="mail-unread-outline" size={64} color={colors.tint} />
                <ThemedText type="subtitle" style={styles.centered}>
                  Vérifie tes emails
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
                  Un lien de confirmation a été envoyé à{' '}
                  <ThemedText type="small">{email}</ThemedText>. Ouvre-le, puis reviens ici.
                </ThemedText>

                {error ? <AuthError message={error} /> : null}

                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={retrySignIn}
                  style={({ pressed }) => [
                    styles.button,
                    { backgroundColor: colors.tint, opacity: pressed ? 0.8 : 1 },
                  ]}>
                  {busy ? (
                    <ActivityIndicator color={OnTint[mode]} />
                  ) : (
                    <ThemedText type="smallBold" style={{ color: OnTint[mode] }}>
                      J’ai confirmé, me connecter
                    </ThemedText>
                  )}
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  disabled={cooldown > 0}
                  onPress={resend}
                  style={({ pressed }) => [
                    styles.button,
                    {
                      backgroundColor: colors.backgroundElement,
                      opacity: pressed || cooldown > 0 ? 0.7 : 1,
                    },
                  ]}>
                  <ThemedText type="smallBold">
                    {cooldown > 0 ? `Renvoyé — patiente ${cooldown} s` : 'Renvoyer l’email'}
                  </ThemedText>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => setAwaitingConfirmation(false)}
                  style={styles.footerLink}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Modifier l’adresse email
                  </ThemedText>
                </Pressable>
              </View>
            ) : (
              <>
                <ThemedText type="title" style={styles.title}>
                  Créer un compte
                </ThemedText>

                <EmailField value={email} onChangeText={setEmail} editable={!busy} />
                <PasswordField
                  value={password}
                  onChangeText={setPassword}
                  editable={!busy}
                  placeholder="Mot de passe (6 caractères min.)"
                />

                {error ? (
                  <AuthError
                    message={error}
                    action={
                      alreadyRegistered
                        ? {
                            label: 'Se connecter',
                            onPress: () => router.replace('/(auth)/connexion'),
                          }
                        : undefined
                    }
                  />
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={handleSignUp}
                  style={({ pressed }) => [
                    styles.button,
                    { backgroundColor: colors.tint, opacity: pressed ? 0.8 : 1 },
                  ]}>
                  {busy ? (
                    <ActivityIndicator color={OnTint[mode]} />
                  ) : (
                    <ThemedText type="smallBold" style={{ color: OnTint[mode] }}>
                      Créer mon compte
                    </ThemedText>
                  )}
                </Pressable>

                <View style={styles.footer}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Déjà un compte ?
                  </ThemedText>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.replace('/(auth)/connexion')}
                    style={styles.footerLink}>
                    <ThemedText type="smallBold" style={{ color: colors.tint }}>
                      Se connecter
                    </ThemedText>
                  </Pressable>
                </View>
              </>
            )}
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
  confirmation: {
    alignItems: 'center',
    gap: Spacing.three,
    paddingTop: Spacing.five,
  },
  centered: {
    textAlign: 'center',
  },
  button: {
    minHeight: 52,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
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
