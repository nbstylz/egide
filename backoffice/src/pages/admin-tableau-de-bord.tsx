import { Link } from 'react-router-dom';

import { AdminPageHeader } from '../components/admin-page-header';
import { useAdminDashboard, type AdminRecentAction } from '../hooks/use-admin';
import { formatDateNumeric } from '../lib/tournaments';

/** Libellés français des actions du journal, à un seul endroit. */
const ActionLabels: Record<string, string> = {
  grant_admin: 'Rôle d’administrateur accordé',
  revoke_admin: 'Rôle d’administrateur retiré',
  cancel_tournament: 'Tournoi annulé',
  disable_account: 'Compte désactivé',
  enable_account: 'Compte réactivé',
  rename_team: 'Équipe renommée',
  disband_team: 'Équipe dissoute',
};

export function AdminTableauDeBordPage() {
  const { stats, recent, loading, error, refresh } = useAdminDashboard();

  if (loading) {
    return (
      <>
        <AdminPageHeader title="Tableau de bord" subtitle="Chargement…" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 24 }}>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="skeleton" style={{ height: 88 }} />
          ))}
        </div>
      </>
    );
  }

  if (error || !stats) {
    return (
      <>
        <AdminPageHeader title="Tableau de bord" />
        <div className="empty-state">
          <p>Impossible de charger les chiffres de la plateforme.</p>
          <button className="btn btn-secondary" onClick={refresh}>
            Réessayer
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <AdminPageHeader
        title="Tableau de bord"
        subtitle="Chiffres de la plateforme, en lecture seule."
      />

      <div className="group-title" style={{ marginTop: 'var(--sp-4)' }}>
        Communauté
      </div>
      <div className="stats-row">
        <Stat
          value={stats.accounts_total}
          label={`compte${stats.accounts_total > 1 ? 's' : ''}`}
          hint={
            stats.accounts_30d > 0
              ? `dont ${stats.accounts_30d} sur 30 jours`
              : 'aucun nouveau sur 30 jours'
          }
          to="/admin/comptes"
        />
        <Stat
          value={stats.teams_total}
          label={`équipe${stats.teams_total > 1 ? 's' : ''}`}
          to="/admin/equipes"
        />
        <Stat
          value={stats.registrations_active}
          label="inscriptions actives"
          hint={`${stats.registrations_total} au total, désistements compris`}
        />
      </div>

      <div className="group-title" style={{ marginTop: 'var(--sp-5)' }}>
        Tournois
      </div>
      <div className="stats-row">
        <Stat
          value={stats.tournaments_total}
          label={`tournoi${stats.tournaments_total > 1 ? 's' : ''}`}
          hint={
            stats.tournaments_published_30d > 0
              ? `dont ${stats.tournaments_published_30d} publié${stats.tournaments_published_30d > 1 ? 's' : ''} sur 30 jours`
              : 'aucun publié sur 30 jours'
          }
          to="/admin/tournois"
        />
        <Stat value={stats.tournaments_open} label="inscriptions ouvertes" />
        <Stat value={stats.tournaments_in_progress} label="en cours" />
        <Stat value={stats.tournaments_completed} label={`terminé${stats.tournaments_completed > 1 ? 's' : ''}`} />
      </div>
      <p className="field-hint" style={{ marginTop: 'var(--sp-2)' }}>
        {stats.tournaments_draft} brouillon{stats.tournaments_draft > 1 ? 's' : ''} ·{' '}
        {stats.tournaments_cancelled} annulé{stats.tournaments_cancelled > 1 ? 's' : ''}.
        Un brouillon n’est visible que de son organisateur.
      </p>

      <div className="group-title" style={{ marginTop: 'var(--sp-5)' }}>
        Dernières mesures d’administration
      </div>
      {recent.length === 0 ? (
        <p className="field-hint">
          Aucune action d’administration n’a encore été prise sur la plateforme.
        </p>
      ) : (
        <ul className="admin-history">
          {recent.map((event, index) => (
            <RecentRow key={index} event={event} />
          ))}
        </ul>
      )}
      {stats.admin_actions_total > recent.length ? (
        <p className="field-hint" style={{ marginTop: 'var(--sp-2)' }}>
          {stats.admin_actions_total} action{stats.admin_actions_total > 1 ? 's' : ''} au total
          dans le journal.
        </p>
      ) : null}
    </>
  );
}

function Stat({
  value,
  label,
  hint,
  to,
}: {
  value: number;
  label: string;
  hint?: string;
  to?: string;
}) {
  const content = (
    <>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {hint ? <div className="stat-hint">{hint}</div> : null}
    </>
  );
  // Un chiffre qui mène à sa liste évite d'avoir à chercher où regarder.
  return to ? (
    <Link className="stat-card stat-card-link" to={to}>
      {content}
    </Link>
  ) : (
    <div className="stat-card">{content}</div>
  );
}

function RecentRow({ event }: { event: AdminRecentAction }) {
  return (
    <li>
      <strong>{ActionLabels[event.action] ?? event.action}</strong> le{' '}
      {formatDateNumeric(event.created_at)}
      {event.admin_pseudo ? ` par ${event.admin_pseudo}` : ''}
      {event.reason ? <div className="cell-sub">Motif : {event.reason}</div> : null}
    </li>
  );
}
