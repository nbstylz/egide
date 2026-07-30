/** Types et libellés partagés autour de la table `tournaments`. */

export type TournamentStatus = 'draft' | 'open' | 'in_progress' | 'completed' | 'cancelled';
export type TournamentType = 'individual' | 'team';

/** Une ligne de la table `tournaments` dans Supabase. */
export type Tournament = {
  id: string;
  organizer_id: string;
  name: string;
  city: string;
  region: string | null;
  event_date: string; // format ISO « AAAA-MM-JJ »
  points_limit: number;
  rounds_count: number;
  capacity: number;
  type: TournamentType;
  status: TournamentStatus;
  created_at: string;
  updated_at: string;
};

export type RegistrationStatus =
  | 'registered'
  | 'waitlisted'
  | 'withdrawn'
  | 'checked_in'
  | 'dropped';

/** Une ligne de la table `registrations` dans Supabase. */
export type Registration = {
  id: string;
  tournament_id: string;
  player_id: string;
  status: RegistrationStatus;
  /** Ronde à laquelle le joueur a abandonné, si `status` vaut `dropped`. */
  dropped_round: number | null;
  created_at: string;
  updated_at: string;
};

/**
 * Statuts qui occupent réellement une place dans le tournoi. Un joueur qui a
 * abandonné garde la sienne : il reste inscrit et classé — sans lui, le
 * compteur d'inscrits baisserait en plein tournoi.
 */
export const ActiveRegistrationStatuses: RegistrationStatus[] = [
  'registered',
  'checked_in',
  'dropped',
];

/** Libellés français des statuts, affichés dans les badges. */
export const StatusLabels: Record<TournamentStatus, string> = {
  draft: 'Brouillon',
  open: 'Inscriptions ouvertes',
  in_progress: 'En cours',
  completed: 'Terminé',
  cancelled: 'Annulé',
};

export const TypeLabels: Record<TournamentType, string> = {
  individual: 'Individuel',
  team: 'Équipe',
};

/** « Samedi 12 septembre 2026 » à partir d'une date ISO « AAAA-MM-JJ ». */
export function formatEventDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  const formatted = date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

/** « Sam. 12 sept. 2026 » : version courte pour les cartes de liste. */
export function formatEventDateShort(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  const formatted = date.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}
