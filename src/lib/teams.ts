/**
 * Les fonctions SQL lèvent des codes courts plutôt que des phrases : la base
 * ne parle pas à l'utilisateur, c'est le rôle de l'écran.
 */
const Messages: Record<string, string> = {
  ALREADY_IN_TEAM: 'Tu fais déjà partie d’une équipe. Quitte-la d’abord.',
  NAME_TAKEN: 'Ce nom d’équipe est déjà pris.',
  INVALID_CODE: 'Ce code ne correspond à aucune équipe.',
  CAPTAIN_MUST_TRANSFER:
    'Transmets d’abord le capitanat à un autre membre, ou dissous l’équipe.',
};

export function teamErrorMessage(error: { message?: string } | null): string {
  const raw = error?.message ?? '';
  for (const [code, message] of Object.entries(Messages)) {
    if (raw.includes(code)) return message;
  }
  return raw || 'Une erreur est survenue. Réessaie.';
}
