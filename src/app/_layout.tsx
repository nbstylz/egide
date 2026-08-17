// SDK 54 : expo-router ne réexporte plus les thèmes de navigation.
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform, useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { configureNotificationHandler } from '@/lib/push';

SplashScreen.preventAutoHideAsync();
configureNotificationHandler();

/**
 * Racine de l'app : une pile (Stack) qui contient les onglets, et au-dessus
 * les écrans poussés comme le formulaire de création de tournoi.
 */
export default function RootLayout() {
  const colorScheme = useColorScheme();

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

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <Stack screenOptions={{ headerShown: false }}>
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
