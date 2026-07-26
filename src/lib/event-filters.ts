import { endOfMonthIso, inDaysIso, parseFrenchDate, todayIso } from '@/lib/dates';
import type { TournamentWithCount } from '@/hooks/use-tournaments';

export type PeriodKey = 'upcoming' | 'this_month' | 'three_months' | 'custom';
export type TypeFilter = 'all' | 'individual' | 'team';

export type EventFilters = {
  /** Clés normalisées de régions (voir `regionKey`). */
  regions: string[];
  points: number[];
  type: TypeFilter;
  period: PeriodKey;
  /** Saisies « JJ/MM/AAAA » du mode « Dates précises ». */
  from: string;
  to: string;
};

export const EmptyFilters: EventFilters = {
  regions: [],
  points: [],
  type: 'all',
  period: 'upcoming',
  from: '',
  to: '',
};

/** Clé des événements dont la région n'est pas renseignée. */
export const NoRegionKey = '__sans_region__';

export const PeriodLabels: Record<PeriodKey, string> = {
  upcoming: 'À venir',
  this_month: 'Ce mois-ci',
  three_months: '3 prochains mois',
  custom: 'Dates précises',
};

export const TypeFilterLabels: Record<TypeFilter, string> = {
  all: 'Tous',
  individual: 'Individuel',
  team: 'Équipe',
};

/**
 * Clé de regroupement d'une région saisie librement : sans accent, sans casse,
 * apostrophes et tirets unifiés. « Auvergne-Rhône-Alpes » et
 * « auvergne rhone alpes » désignent ainsi la même région.
 */
export function regionKey(region: string | null | undefined): string {
  const trimmed = (region ?? '').trim();
  if (trimmed === '') return NoRegionKey;
  return trimmed
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ');
}

/** Bornes de date (ISO) imposées par la période choisie. */
function periodBounds(filters: EventFilters): { min?: string; max?: string; invalid: boolean } {
  switch (filters.period) {
    case 'this_month':
      return { min: todayIso(), max: endOfMonthIso(), invalid: false };
    case 'three_months':
      return { min: todayIso(), max: inDaysIso(90), invalid: false };
    case 'custom': {
      const from = filters.from ? parseFrenchDate(filters.from) : null;
      const to = filters.to ? parseFrenchDate(filters.to) : null;
      // Une saisie commencée mais incomplète est ignorée, pas fautive.
      const fromInvalid = filters.from.length === 10 && !from;
      const toInvalid = filters.to.length === 10 && !to;
      const orderInvalid = Boolean(from && to && to < from);
      return {
        min: from ?? undefined,
        max: to ?? undefined,
        invalid: fromInvalid || toInvalid || orderInvalid,
      };
    }
    default:
      return { invalid: false };
  }
}

/** Message d'erreur des champs de dates, ou null si tout va bien. */
export function dateErrors(filters: EventFilters): { from?: string; to?: string } {
  const errors: { from?: string; to?: string } = {};
  if (filters.period !== 'custom') return errors;

  const from = filters.from ? parseFrenchDate(filters.from) : null;
  const to = filters.to ? parseFrenchDate(filters.to) : null;
  if (filters.from.length === 10 && !from) errors.from = 'Date invalide (JJ/MM/AAAA).';
  if (filters.to.length === 10 && !to) errors.to = 'Date invalide (JJ/MM/AAAA).';
  if (from && to && to < from) errors.to = 'La date de fin doit être après la date de début.';
  return errors;
}

export function hasDateError(filters: EventFilters): boolean {
  return periodBounds(filters).invalid;
}

/** Nombre de catégories actives (sert à la pastille du bouton « Filtrer »). */
export function activeFilterCount(filters: EventFilters): number {
  let count = 0;
  if (filters.regions.length > 0) count += 1;
  if (filters.points.length > 0) count += 1;
  if (filters.type !== 'all') count += 1;
  if (filters.period !== 'upcoming') count += 1;
  return count;
}

type Category = 'regions' | 'points' | 'type' | 'period';

/**
 * Applique les filtres, en pouvant ignorer une catégorie : c'est ainsi qu'on
 * calcule les compteurs de chaque option (« facettes ») sans qu'une catégorie
 * se filtre elle-même.
 */
export function applyFilters(
  events: TournamentWithCount[],
  filters: EventFilters,
  except?: Category
): TournamentWithCount[] {
  const bounds = periodBounds(filters);

  return events.filter((event) => {
    if (except !== 'regions' && filters.regions.length > 0) {
      if (!filters.regions.includes(regionKey(event.region))) return false;
    }
    if (except !== 'points' && filters.points.length > 0) {
      if (!filters.points.includes(event.points_limit)) return false;
    }
    if (except !== 'type' && filters.type !== 'all') {
      if (event.type !== filters.type) return false;
    }
    if (except !== 'period' && !bounds.invalid) {
      if (bounds.min && event.event_date < bounds.min) return false;
      if (bounds.max && event.event_date > bounds.max) return false;
    }
    return true;
  });
}

export type RegionOption = { key: string; label: string; count: number };

/**
 * Régions réellement présentes dans les événements, avec leur nombre de
 * résultats une fois les autres filtres appliqués. Le libellé retenu est la
 * graphie la plus fréquente ; « Non précisée » ferme la marche.
 */
export function regionOptions(
  events: TournamentWithCount[],
  filters: EventFilters
): RegionOption[] {
  const spellings = new Map<string, Map<string, number>>();
  for (const event of events) {
    const key = regionKey(event.region);
    const label = key === NoRegionKey ? 'Non précisée' : (event.region ?? '').trim();
    const byLabel = spellings.get(key) ?? new Map<string, number>();
    byLabel.set(label, (byLabel.get(label) ?? 0) + 1);
    spellings.set(key, byLabel);
  }

  const matching = applyFilters(events, filters, 'regions');
  const counts = new Map<string, number>();
  for (const event of matching) {
    const key = regionKey(event.region);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const options: RegionOption[] = [];
  for (const [key, byLabel] of spellings) {
    // Graphie la plus fréquente ; à égalité, la première par ordre alphabétique.
    const label = [...byLabel.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr')
    )[0][0];
    options.push({ key, label, count: counts.get(key) ?? 0 });
  }

  options.sort((a, b) => {
    if (a.key === NoRegionKey) return 1;
    if (b.key === NoRegionKey) return -1;
    return b.count - a.count || a.label.localeCompare(b.label, 'fr');
  });
  return options;
}

export type PointsOption = { value: number; count: number };

/** Formats en points présents, avec leur nombre de résultats. */
export function pointsOptions(
  events: TournamentWithCount[],
  filters: EventFilters
): PointsOption[] {
  const values = [...new Set(events.map((event) => event.points_limit))].sort((a, b) => a - b);
  const matching = applyFilters(events, filters, 'points');
  return values.map((value) => ({
    value,
    count: matching.filter((event) => event.points_limit === value).length,
  }));
}

/** Nombre de résultats pour chaque valeur du filtre « type ». */
export function typeCounts(events: TournamentWithCount[], filters: EventFilters) {
  const matching = applyFilters(events, filters, 'type');
  return {
    all: matching.length,
    individual: matching.filter((event) => event.type === 'individual').length,
    team: matching.filter((event) => event.type === 'team').length,
  };
}

/** Libellés des filtres actifs, pour les chips et l'état vide filtré. */
export function activeFilterChips(
  events: TournamentWithCount[],
  filters: EventFilters
): { label: string; remove: (current: EventFilters) => EventFilters }[] {
  const chips: { label: string; remove: (current: EventFilters) => EventFilters }[] = [];
  const regions = regionOptions(events, filters);

  for (const key of filters.regions) {
    const label = regions.find((option) => option.key === key)?.label ?? 'Région';
    chips.push({
      label,
      remove: (current) => ({ ...current, regions: current.regions.filter((r) => r !== key) }),
    });
  }
  for (const value of filters.points) {
    chips.push({
      label: `${value} pts`,
      remove: (current) => ({ ...current, points: current.points.filter((p) => p !== value) }),
    });
  }
  if (filters.type !== 'all') {
    chips.push({
      label: TypeFilterLabels[filters.type],
      remove: (current) => ({ ...current, type: 'all' }),
    });
  }
  if (filters.period !== 'upcoming') {
    chips.push({
      label: PeriodLabels[filters.period],
      remove: (current) => ({ ...current, period: 'upcoming', from: '', to: '' }),
    });
  }
  return chips;
}
