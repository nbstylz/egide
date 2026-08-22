/**
 * Factions Warhammer Age of Sigmar, groupées par Grande Alliance.
 *
 * Même remède que pour les régions, et pour la même raison : la faction était
 * saisie librement. « Nighthaunt », « nighthaunt », « NH » et « Les
 * Nighthaunts » désignent la même armée sans jamais se rencontrer dans un
 * regroupement. Une statistique par faction bâtie sur du texte libre est
 * fausse d'une manière que rien ne signale à l'utilisateur — il voit deux
 * lignes pour une seule armée et conclut à un bug.
 *
 * Les noms sont en anglais : c'est sous cette forme qu'ils figurent sur les
 * battletomes et qu'ils circulent en tournoi, y compris francophone. C'est
 * l'exception assumée à la règle du français, comme « bye » ou « Grand
 * Alliance ».
 *
 * À faire vérifier par le porteur, expert AoS : cette liste suit la 4e
 * édition. Elle évoluera à chaque sortie de battletome — d'où le regroupement
 * par alliance, qui rend les ajouts évidents.
 */

export const FactionsByAlliance = {
  Order: [
    'Cities of Sigmar',
    'Daughters of Khaine',
    'Fyreslayers',
    'Idoneth Deepkin',
    'Kharadron Overlords',
    'Lumineth Realm-lords',
    'Seraphon',
    'Stormcast Eternals',
    'Sylvaneth',
  ],
  Chaos: [
    'Blades of Khorne',
    'Disciples of Tzeentch',
    'Hedonites of Slaanesh',
    'Maggotkin of Nurgle',
    'Skaven',
    'Slaves to Darkness',
    'Beasts of Chaos',
  ],
  Death: [
    'Flesh-eater Courts',
    'Nighthaunt',
    'Ossiarch Bonereapers',
    'Soulblight Gravelords',
  ],
  Destruction: [
    'Gloomspite Gitz',
    'Ogor Mawtribes',
    'Orruk Warclans',
    'Sons of Behemat',
  ],
} as const;

/** Libellés français des Grandes Alliances, pour les en-têtes du sélecteur. */
export const AllianceLabels: Record<keyof typeof FactionsByAlliance, string> = {
  Order: 'Ordre',
  Chaos: 'Chaos',
  Death: 'Mort',
  Destruction: 'Destruction',
};

export const Factions = [
  ...FactionsByAlliance.Order,
  ...FactionsByAlliance.Chaos,
  ...FactionsByAlliance.Death,
  ...FactionsByAlliance.Destruction,
] as const;

export type Faction = (typeof Factions)[number];

/** Compare sans accent, casse ni ponctuation, pour la recherche et l'appariement. */
export function normalizeFaction(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Retrouve la faction officielle derrière une saisie libre héritée
 * (« nighthaunt », « Les Nighthaunts » → « Nighthaunt »).
 *
 * Renvoie null si rien ne correspond : mieux vaut demander que deviner. Une
 * mauvaise correspondance serait invisible et fausserait durablement des
 * statistiques — le doute doit remonter à l'utilisateur, pas être arbitré ici.
 */
export function matchFaction(value: string | null | undefined): Faction | null {
  if (!value) return null;
  const needle = normalizeFaction(value);
  if (!needle) return null;

  const exact = Factions.find((faction) => normalizeFaction(faction) === needle);
  if (exact) return exact;

  // Saisie approximative : tous les mots significatifs doivent se retrouver
  // dans le nom officiel, quel que soit leur ordre. « courts eater flesh »
  // trouve « Flesh-eater Courts » ; « chaos » seul ne trouve rien, car il
  // apparaît dans plusieurs noms et l'ambiguïté doit rester visible.
  const words = needle.split(' ').filter((word) => word.length > 3);
  if (words.length === 0) return null;
  const candidates = Factions.filter((faction) => {
    const haystack = normalizeFaction(faction);
    return words.every((word) => haystack.includes(word));
  });
  return candidates.length === 1 ? candidates[0] : null;
}
