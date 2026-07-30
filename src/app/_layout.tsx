import { DarkTheme, DefaultTheme, ThemeProvider, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';

SplashScreen.preventAutoHideAsync();

/**
 * Racine de l'app : une pile (Stack) qui contient les onglets, et au-dessus
 * les écrans poussés comme le formulaire de création de tournoi.
 */
export default function RootLayout() {
  const colorScheme = useColorScheme();

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
        <Stack.Screen name="equipes/creer" />
        <Stack.Screen name="equipes/[id]" />
      </Stack>
    </ThemeProvider>
  );
}
