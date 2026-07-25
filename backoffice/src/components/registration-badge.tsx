import { RegistrationStatusLabels, type RegistrationStatus } from '../lib/tournaments';

/** Pastille du statut d'une inscription (inscrit, en attente, présent, désisté). */
export function RegistrationBadge({ status }: { status: RegistrationStatus }) {
  return <span className={`badge badge-reg-${status}`}>{RegistrationStatusLabels[status]}</span>;
}
