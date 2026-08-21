import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProfileForm } from '@/components/profile-form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, Colors, MaxContentWidth, OnTint, Spacing } from '@/constants/theme';
import { useGuest } from '@/hooks/use-guest';
import { useProfile } from '@/hooks/use-profile';
import { useSession } from '@/hooks/use-session';
import { registerForPush } from '@/lib/push';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export default function ProfilScreen() {
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const colors = Colors[mode];
  const { session, loading } = useSession();
  const { profile, loading: profileLoading, refresh } = useProfile(session?.user.id);
  const { forgetGuest } = useGuest();
  const [editing, setEditing] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);

  /**
   * Bascule une préférence de notification. Optimiste : l'interrupteur
   * répond au doigt, et revient en arrière si l'écriture échoue.
   */
  async function togglePreference(
    field: 'notify_region' | 'notify_registrations',
    value: boolean
  ) {
    if (!supabase || !session || !profile) return;
    const { error } = await supabase
      .from('profiles')
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq('id', session.user.id);
    if (!error) await refresh();
  }

  /** Enregistre l'appareil puis demande une notification de test. */
  async function handlePushTest() {
    if (!supabase || !session) return;
    setPushBusy(true);
    setPushMessage(null);
    const status = await registerForPush(session.user.id);
    if (status === 'unavailable') {
      setPushMessage(
        'Les notifications demandent l’app installée sur un téléphone (pas le navigateur).'
      );
    } else if (status === 'denied') {
      setPushMessage(
        'Notifications refusées. Tu peux les réactiver dans les réglages du téléphone.'
      );
    } else {
      const { error } = await supabase.functions.invoke('send-push', {
        body: { test: true },
      });
      setPushMessage(
        error
          ? 'Impossible d’envoyer la notification de test. Réessaie.'
          : 'Notification de test envoyée — elle arrive dans quelques secondes.'
      );
    }
    setPushBusy(false);
  }

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
    // Visiteur sans compte : l'authentification vit désormais dans le
    // parcours d'entrée, pas ici. Cet écran ne fait qu'y renvoyer.
    content = (
      <>
        <Ionicons name="person-circle-outline" size={64} color={colors.textSecondary} />
        <ThemedText type="subtitle" style={styles.centeredText}>
          Profil
        </ThemedText>
        <ThemedText style={styles.centeredText}>
          Tu navigues sans compte. Crée-en un pour t’inscrire aux tournois, rejoindre une équipe
          et suivre tes résultats.
        </ThemedText>
        <Pressable
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.tint, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={() => router.push('/(auth)/inscription')}>
          <ThemedText style={{ color: OnTint[mode], fontWeight: '600' }}>
            Créer un compte
          </ThemedText>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.backgroundElement, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={() => router.push('/(auth)/connexion')}>
          <ThemedText>Se connecter</ThemedText>
        </Pressable>
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
        <ThemedView style={[styles.prefCard, { backgroundColor: colors.backgroundElement }]}>
          <ThemedText type="smallBold">Notifications</ThemedText>
          <ThemedView style={styles.prefRow}>
            <ThemedText type="small" style={styles.prefLabel}>
              Tournois dans ma région
            </ThemedText>
            <Switch
              value={profile.notify_region}
              onValueChange={(value) => togglePreference('notify_region', value)}
              trackColor={{ true: colors.tint }}
            />
          </ThemedView>
          <ThemedView style={styles.prefRow}>
            <ThemedText type="small" style={styles.prefLabel}>
              Inscriptions sur mes tournois
            </ThemedText>
            <Switch
              value={profile.notify_registrations}
              onValueChange={(value) => togglePreference('notify_registrations', value)}
              trackColor={{ true: colors.tint }}
            />
          </ThemedView>
        </ThemedView>
        <Pressable
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.backgroundElement, opacity: pressed ? 0.8 : 1 },
          ]}
          disabled={pushBusy}
          onPress={handlePushTest}>
          {pushBusy ? (
            <ActivityIndicator color={colors.tint} />
          ) : (
            <ThemedText>Tester les notifications</ThemedText>
          )}
        </Pressable>
        {pushMessage ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.centeredText}>
            {pushMessage}
          </ThemedText>
        ) : null}
        <Pressable
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.backgroundElement, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={async () => {
            // Après un départ volontaire, l'écran d'accueil doit revenir :
            // sans cela, le drapeau invité renverrait droit aux onglets.
            await forgetGuest();
            await supabase?.auth.signOut();
          }}>
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
  prefCard: {
    alignSelf: 'stretch',
    borderRadius: Spacing.two,
    padding: Spacing.three,
    gap: Spacing.two,
    backgroundColor: 'transparent',
  },
  prefRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    backgroundColor: 'transparent',
    minHeight: 36,
  },
  prefLabel: {
    flex: 1,
  },
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
