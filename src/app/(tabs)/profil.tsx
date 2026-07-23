import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthForm } from '@/components/auth-form';
import { ProfileForm } from '@/components/profile-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import { useProfile } from '@/hooks/use-profile';
import { useSession } from '@/hooks/use-session';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export default function ProfilScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { session, loading } = useSession();
  const { profile, loading: profileLoading, refresh } = useProfile(session?.user.id);
  const [editing, setEditing] = useState(false);

  let content;
  if (!isSupabaseConfigured) {
    content = (
      <ThemedText style={styles.centeredText}>
        Supabase n’est pas configuré : renseigne le fichier .env puis relance l’app.
      </ThemedText>
    );
  } else if (loading || (session && profileLoading)) {
    content = <ActivityIndicator color={colors.tint} />;
  } else if (!session) {
    content = (
      <>
        <ThemedText style={styles.centeredText}>
          Connecte-toi pour t’inscrire aux tournois et rejoindre une équipe.
        </ThemedText>
        <AuthForm />
      </>
    );
  } else if (!profile || editing) {
    // Pas encore de profil (première visite) ou modification en cours.
    content = (
      <>
        <ThemedText style={styles.centeredText}>
          {profile
            ? 'Modifie ton profil de joueur.'
            : 'Bienvenue ! Crée ton profil de joueur pour participer aux tournois.'}
        </ThemedText>
        <ProfileForm
          userId={session.user.id}
          initialProfile={profile}
          onSaved={() => {
            setEditing(false);
            refresh();
          }}
          onCancel={profile ? () => setEditing(false) : undefined}
        />
      </>
    );
  } else {
    content = (
      <>
        <ThemedText type="subtitle" style={styles.centeredText}>
          {profile.pseudo}
        </ThemedText>
        <ThemedView style={styles.infoList}>
          <ThemedText style={styles.centeredText}>
            <ThemedText style={{ color: colors.textSecondary }}>Email : </ThemedText>
            {session.user.email}
          </ThemedText>
          <ThemedText style={styles.centeredText}>
            <ThemedText style={{ color: colors.textSecondary }}>Région : </ThemedText>
            {profile.region ?? 'Non renseignée'}
          </ThemedText>
          <ThemedText style={styles.centeredText}>
            <ThemedText style={{ color: colors.textSecondary }}>Faction favorite : </ThemedText>
            {profile.faction_favorite ?? 'Non renseignée'}
          </ThemedText>
        </ThemedView>
        <Pressable
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.tint, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={() => setEditing(true)}>
          <ThemedText style={styles.buttonPrimaryText}>Modifier mon profil</ThemedText>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.backgroundElement, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={() => supabase?.auth.signOut()}>
          <ThemedText>Déconnexion</ThemedText>
        </Pressable>
      </>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.heroSection}>
          <Ionicons name="person-circle" size={64} color={colors.tint} />
          <ThemedText type="title" style={styles.centeredText}>
            Profil
          </ThemedText>
          {content}
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
    maxWidth: MaxContentWidth,
  },
  heroSection: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  centeredText: {
    textAlign: 'center',
  },
  infoList: {
    gap: Spacing.two,
    alignSelf: 'stretch',
  },
  button: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  buttonPrimaryText: {
    color: '#ffffff',
    fontWeight: '600',
  },
});
