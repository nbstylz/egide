import { Stack } from 'expo-router';

/** Pile du parcours d'entrée : accueil, connexion, inscription, profil. */
export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="bienvenue" />
      <Stack.Screen name="connexion" />
      <Stack.Screen name="inscription" />
      {/* Étape obligatoire : pas de geste de retour pour la contourner. */}
      <Stack.Screen name="creer-profil" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
