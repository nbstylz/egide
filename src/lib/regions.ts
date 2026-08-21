/**
 * Régions françaises officielles. Saisies librement, elles ne se recoupaient
 * pas d'un organisateur à l'autre — « Rhone alpes Auvergne » et
 * « Auvergne-Rhône-Alpes » désignaient le même endroit sans jamais se
 * rencontrer dans les filtres. Une liste fermée règle le problème à la source.
 */
export const Regions = [
  'Auvergne-Rhône-Alpes',
  'Bourgogne-Franche-Comté',
  'Bretagne',
  'Centre-Val de Loire',
  'Corse',
  'Grand Est',
  'Hauts-de-France',
  'Île-de-France',
  'Normandie',
  'Nouvelle-Aquitaine',
  'Occitanie',
  'Pays de la Loire',
  "Provence-Alpes-Côte d'Azur",
  'Guadeloupe',
  'Guyane',
  'Martinique',
  'La Réunion',
  'Mayotte',
] as const;

export type Region = (typeof Regions)[number];

/** Compare sans accent ni casse, pour la recherche dans le sélecteur. */
export function normalizeRegion(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Retrouve la région officielle correspondant à une valeur libre héritée
 * de l'ancienne saisie (« Rhone alpes Auvergne » → « Auvergne-Rhône-Alpes »).
 * Renvoie null si rien ne correspond : mieux vaut demander que deviner.
 */
export function matchRegion(value: string | null | undefined): Region | null {
  if (!value) return null;
  const needle = normalizeRegion(value);
  const exact = Regions.find((region) => normalizeRegion(region) === needle);
  if (exact) return exact;
  // Ancienne saisie approximative : on compare les mots, sans leur ordre.
  const words = needle.split(' ').filter((word) => word.length > 3);
  if (words.length === 0) return null;
  return (
    Regions.find((region) => {
      const haystack = normalizeRegion(region);
      return words.every((word) => haystack.includes(word));
    }) ?? null
  );
}
