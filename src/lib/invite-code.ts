/**
 * Code d'invitation d'équipe : 6 caractères, souvent dictés à voix haute
 * dans le bruit d'une salle de jeu. L'alphabet exclut donc d'emblée les
 * glyphes qui se confondent — O et 0, I et 1, L — si bien qu'il n'y a
 * aucune ambiguïté à lever : tout caractère hors alphabet est ignoré.
 */

const Alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const CodeLength = 6;

/** Nettoie une saisie : majuscules, sans séparateur, alphabet seul. */
export function normalizeCode(text: string): string {
  return text
    .toUpperCase()
    .split('')
    .filter((character) => Alphabet.includes(character))
    .join('')
    .slice(0, CodeLength);
}

/** « ABC-DEF » : deux groupes de trois, plus faciles à dicter et à relire. */
export function formatCode(code: string): string {
  const clean = normalizeCode(code);
  if (clean.length <= 3) return clean;
  return `${clean.slice(0, 3)}-${clean.slice(3)}`;
}

/** Épelle le code pour la lecture vocale : « K, 7, P, 4, R, M ». */
export function spellCode(code: string): string {
  return normalizeCode(code).split('').join(', ');
}
