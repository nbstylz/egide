/**
 * Types et libellés de la table `tournaments`.
 * Copie volontaire de src/lib/tournaments.ts de l'app mobile : les deux
 * applications partagent la même base Supabase mais restent indépendantes.
 */

export type TournamentStatus = 'draft' | 'open' | 'in_progress' | 'completed' | 'cancelled';
export type TournamentType = 'individual' | 'team';

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

/** Statuts pour lesquels l'édition est encore autorisée. */
export const EditableStatuses: TournamentStatus[] = ['draft', 'open'];

/** Statuts pour lesquels l'annulation reste possible. */
export const CancellableStatuses: TournamentStatus[] = ['draft', 'open', 'in_progress'];

/**
 * Statuts pour lesquels l'organisateur peut retirer un inscrit. Une fois le
 * tournoi lancé, retirer quelqu'un fausserait les appariements déjà générés :
 * cela relèvera du check-in et de l'abandon.
 */
export const RemovableStatuses: TournamentStatus[] = ['draft', 'open'];

export type RegistrationStatus = 'registered' | 'waitlisted' | 'withdrawn' | 'checked_in';

/** Statuts d'inscription qui occupent réellement une place. */
export const ActiveRegistrationStatuses: RegistrationStatus[] = ['registered', 'checked_in'];

export const RegistrationStatusLabels: Record<RegistrationStatus, string> = {
  registered: 'Inscrit',
  waitlisted: 'Liste d’attente',
  withdrawn: 'Désisté',
  checked_in: 'Présent',
};

/** « 12/09/2026 » — format court pour les colonnes de tableau. */
export function formatDateNumeric(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** « Samedi 12 septembre 2026 » */
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

/** « Sam. 12 sept. 2026 » */
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
