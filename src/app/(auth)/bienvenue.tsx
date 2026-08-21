import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  Colors,
  MaxContentWidth,
  OnTint,
  Spacing,
  TintBackground,
  TintBorder,
} from '@/constants/theme';
import { useGuest } from '@/hooks/use-guest';
import { isSupabaseConfigured } from '@/lib/supabase';

/**
 * Premier écran au lancement. Trois chemins, de poids décroissant :
 * créer un compte, se connecter, consulter sans compte. Le mode invité
 * existe parce que l'annuaire, les tables et les classements sont publics
 * par conception — un spectateur doit pouvoir regarder sans s'inscrire.
 */
export default function BienvenueScreen() {
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const colors = Colors[mode];
  const { continueAsGuest } = useGuest();

  async function enterAsGuest() {
    await continueAsGuest();
    router.replace('/(tabs)');
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.identity}>
          <View
            style={[
              styles.badge,
              { backgroundColor: TintBackground[mode], borderColor: TintBorder[mode] },
            ]}>
            <Ionicons name="shield-half" size={96} color={colors.tint} />
          </View>
          <ThemedText type="title">EGIDE</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.tagline}>
            Tournois Warhammer Age of Sigmar
          </ThemedText>
        </View>

        {isSupabaseConfigured ? (
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/(auth)/inscription')}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: colors.tint, opacity: pressed ? 0.8 : 1 },
              ]}>
              <ThemedText type="smallBold" style={{ color: OnTint[mode] }}>
                Créer un compte
              </ThemedText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/(auth)/connexion')}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: colors.backgroundElement, opacity: pressed ? 0.8 : 1 },
              ]}>
              <ThemedText type="smallBold">Se connecter</ThemedText>
            </Pressable>
          </View>
        ) : (
          <ThemedText type="small" themeColor="textSecondary" style={styles.tagline}>
            Supabase n’est pas configuré : renseigne le fichier .env puis relance l’app.
          </ThemedText>
        )}

        <View style={styles.guest}>
          <Pressable accessibilityRole="button" onPress={enterAsGuest} style={styles.guestButton}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.guestLink}>
              Continuer sans compte
            </ThemedText>
          </Pressable>
          <ThemedText type="small" themeColor="textSecondary" style={styles.tagline}>
            Consulter les événements, tables et classements
          </ThemedText>
        </View>
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
    justifyContent: 'center',
    gap: Spacing.three,
  },
  identity: {
    alignItems: 'center',
    gap: Spacing.two,
    marginBottom: Spacing.six,
  },
  badge: {
    width: 144,
    height: 144,
    borderRadius: 72,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.three,
  },
  tagline: {
    textAlign: 'center',
  },
  actions: {
    gap: Spacing.three,
  },
  button: {
    minHeight: 52,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guest: {
    marginTop: Spacing.four,
    gap: Spacing.one,
  },
  guestButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestLink: {
    textDecorationLine: 'underline',
  },
});
