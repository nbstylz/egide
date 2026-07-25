import { StatusLabels, type TournamentStatus } from '../lib/tournaments';

/** Pastille de statut (mêmes couleurs que l'app mobile). */
export function StatusBadge({ status }: { status: TournamentStatus }) {
  return <span className={`badge badge-${status}`}>{StatusLabels[status]}</span>;
}
