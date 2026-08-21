import { Pressable, ScrollView, StyleSheet, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProfileForm } from '@/components/profile-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import { useProfile } from '@/hooks/use-profile';
import { useSession } from '@/hooks/use-session';
import { supabase } from '@/lib/supabase';

/**
 * Étape obligatoire après la première connexion : un compte sans pseudo est
 * inutilisable en tournoi (appariements, classement). Pas de bouton retour
 * ni de « Passer » — mais une déconnexion de secours, pour ne jamais
 * enfermer quelqu'un qu'un bug de formulaire bloquerait.
 */
export default function CreerProfilScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { session } = useSession();
  const { refresh } = useProfile(session?.user.id);

  if (!session) return null;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText type="title" style={styles.title}>
            Bienvenue !
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.intro}>
            Encore une étape : ton profil, visible dans les listes d’inscrits et les classements.
          </ThemedText>

          <ProfileForm
            userId={session.user.id}
            initialProfile={null}
            onSaved={refresh}
            submitLabel="C’est parti"
          />

          <Pressable
            accessibilityRole="button"
            onPress={() => supabase?.auth.signOut()}
            style={styles.signOut}>
            <ThemedText type="small" themeColor="textSecondary">
              Se déconnecter
            </ThemedText>
          </Pressable>
        </ScrollView>
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
  content: {
    gap: Spacing.three,
    paddingTop: Spacing.five,
    paddingBottom: Spacing.six,
  },
  title: {
    fontSize: 32,
    lineHeight: 40,
  },
  intro: {
    marginBottom: Spacing.two,
  },
  signOut: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.four,
  },
});
