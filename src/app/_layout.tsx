// SDK 54 : expo-router ne réexporte plus les thèmes de navigation.
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { Redirect, Stack, router, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform, useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { useGuest } from '@/hooks/use-guest';
import { useProfile } from '@/hooks/use-profile';
import { useSession } from '@/hooks/use-session';
import { configureNotificationHandler } from '@/lib/push';

SplashScreen.preventAutoHideAsync();
configureNotificationHandler();

/**
 * Racine de l'app : une pile (Stack) qui contient le parcours d'entrée, les
 * onglets, et au-dessus les écrans poussés comme la fiche d'un événement.
 */
export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { session, loading: sessionLoading } = useSession();
  const { profile, loading: profileLoading } = useProfile(session?.user.id);
  const { isGuest, loading: guestLoading } = useGuest();
  const segments = useSegments();

  // Un tap sur une notification ouvre l'écran qu'elle annonce : chaque
  // message embarque son `url` (ex. la page des tables de la ronde).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = response.notification.request.content.data?.url;
      if (typeof url === 'string' && url.startsWith('/')) {
        router.push(url as never);
      }
    });
    return () => subscription.remove();
  }, []);

  const booting = sessionLoading || guestLoading || (session && profileLoading);
  const inAuthGroup = segments[0] === '(auth)';
  // Les fiches d'événement, tables et classements sont publics : un lien
  // profond ne doit jamais être détourné vers l'écran d'accueil.
  const onPublicRoute = segments[0] === 'evenements' || segments[0] === 'equipes';

  // Tant que l'app décide de sa route, on ne rend que le splash : sans cela,
  // un utilisateur déjà connecté verrait passer l'écran d'accueil.
  let redirect = null;
  if (!booting) {
    if (!session && !isGuest && !inAuthGroup && !onPublicRoute) {
      redirect = <Redirect href="/(auth)/bienvenue" />;
    } else if (session && !profile && segments[1] !== 'creer-profil') {
      // Un compte sans pseudo est inutilisable en tournoi.
      redirect = <Redirect href="/(auth)/creer-profil" />;
    } else if (session && profile && inAuthGroup) {
      redirect = <Redirect href="/(tabs)" />;
    }
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      {redirect}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="tournois/creer" />
        <Stack.Screen name="evenements/[id]" />
        <Stack.Screen name="evenements/[id]/inscrits" />
        <Stack.Screen name="evenements/[id]/tables" />
        <Stack.Screen name="evenements/[id]/classement" />
        <Stack.Screen name="evenements/[id]/liste" />
        <Stack.Screen name="equipes/creer" />
        <Stack.Screen name="equipes/[id]" />
      </Stack>
    </ThemeProvider>
  );
}
