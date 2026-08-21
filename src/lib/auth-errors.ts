/**
 * Traduit les erreurs Supabase Auth en français. Un message technique
 * anglais n'aide personne debout dans une salle de tournoi.
 */
export function translateAuthError(message: string): string {
  if (message.includes('Invalid login credentials')) {
    return 'Email ou mot de passe incorrect.';
  }
  if (message.includes('Password should be at least')) {
    return 'Le mot de passe doit contenir au moins 6 caractères.';
  }
  if (message.includes('User already registered')) {
    return 'Un compte existe déjà avec cet email.';
  }
  if (message.includes('Email not confirmed')) {
    return 'Ton email n’est pas encore confirmé.';
  }
  if (message.includes('valid email')) {
    return 'Adresse email invalide.';
  }
  if (message.includes('For security purposes') || message.includes('rate limit')) {
    return 'Trop de demandes pour le moment. Réessaie dans quelques minutes.';
  }
  if (message.includes('Network request failed') || message.includes('fetch')) {
    return 'Pas de connexion. Vérifie ton réseau et réessaie.';
  }
  return message;
}
