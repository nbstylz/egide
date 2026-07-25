import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Modal } from '../components/modal';
import { StatusBadge } from '../components/status-badge';
import type { TournamentWithCount } from '../hooks/use-my-tournaments';
import { formatEventDateShort, StatusLabels } from '../lib/tournaments';

type SortKey = 'name' | 'event_date' | 'status';

type Props = {
  tournaments: TournamentWithCount[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
};

/** Les tournois « passés » (terminés/annulés) descendent en bas de liste. */
function isArchived(t: TournamentWithCount) {
  return t.status === 'completed' || t.status === 'cancelled';
}

export function TournoisPage({ tournaments, loading, error, onRetry }: Props) {
  const navigate = useNavigate();
  const [sortKey, setSortKey] = useState<SortKey>('event_date');
  const [sortAsc, setSortAsc] = useState(true);
  const [createModal, setCreateModal] = useState(false);

  const sorted = useMemo(() => {
    const copy = [...tournaments];
    copy.sort((a, b) => {
      // Les archivés toujours après les actifs, quel que soit le tri.
      if (isArchived(a) !== isArchived(b)) return isArchived(a) ? 1 : -1;
      let cmp = 0;
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name, 'fr');
      else if (sortKey === 'event_date') cmp = a.event_date.localeCompare(b.event_date);
      else cmp = StatusLabels[a.status].localeCompare(StatusLabels[b.status], 'fr');
      return sortAsc ? cmp : -cmp;
    });
    return copy;
  }, [tournaments, sortKey, sortAsc]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortAsc((v) => !v);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  function sortHeader(key: SortKey, label: string) {
    const active = key === sortKey;
    return (
      <th className={active ? 'sort-active' : ''} onClick={() => toggleSort(key)}>
        {label} {active ? (sortAsc ? '▲' : '▼') : ''}
      </th>
    );
  }

  let body;
  if (loading) {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 24 }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton" style={{ height: 52 }} />
        ))}
      </div>
    );
  } else if (error) {
    body = (
      <div className="empty-state">
        <p>Impossible de charger vos tournois.</p>
        <button className="btn btn-secondary" onClick={onRetry}>
          Réessayer
        </button>
      </div>
    );
  } else if (tournaments.length === 0) {
    body = (
      <div className="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM7 6H4a1 1 0 0 0-1 1c0 2 1.5 4 4 4M17 6h3a1 1 0 0 1 1 1c0 2-1.5 4-4 4" />
        </svg>
        <h2>Aucun tournoi pour l’instant</h2>
        <p>
          Créez votre premier tournoi depuis l’application mobile EGIDE : il apparaîtra ici,
          prêt à être géré.
        </p>
        <button className="btn btn-primary" onClick={() => setCreateModal(true)}>
          + Créer un tournoi
        </button>
      </div>
    );
  } else {
    body = (
      <table className="table">
        <thead>
          <tr>
            {sortHeader('name', 'Nom')}
            {sortHeader('event_date', 'Date')}
            <th className="hide-narrow" style={{ cursor: 'default' }}>
              Ville
            </th>
            {sortHeader('status', 'Statut')}
            <th className="hide-narrow" style={{ cursor: 'default' }}>
              Inscrits
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((tournament) => {
            const full = tournament.registered_count >= tournament.capacity;
            const percent = Math.min(
              100,
              Math.round((tournament.registered_count / tournament.capacity) * 100)
            );
            return (
              <tr
                key={tournament.id}
                className={isArchived(tournament) ? 'row-muted' : ''}
                onClick={() => navigate(`/tournois/${tournament.id}`)}>
                <td className="cell-name">
                  <Link
                    to={`/tournois/${tournament.id}`}
                    onClick={(event) => event.stopPropagation()}
                    title={tournament.name}>
                    {tournament.name}
                  </Link>
                </td>
                <td style={{ width: 140 }}>{formatEventDateShort(tournament.event_date)}</td>
                <td className="hide-narrow" style={{ width: 140 }}>
                  {tournament.city}
                </td>
                <td style={{ width: 160 }}>
                  <StatusBadge status={tournament.status} />
                </td>
                <td className="hide-narrow" style={{ width: 120 }}>
                  <div style={{ fontSize: 13 }}>
                    {tournament.registered_count} / {tournament.capacity}
                    {full ? ' · Complet' : ''}
                  </div>
                  <div className="mini-gauge">
                    <div
                      className={`mini-gauge-fill${full ? ' full' : ''}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Mes tournois</h1>
          {!loading && tournaments.length > 0 ? (
            <div className="page-subtitle">
              {tournaments.length} {tournaments.length > 1 ? 'tournois' : 'tournoi'}
            </div>
          ) : null}
        </div>
        {!loading && tournaments.length > 0 ? (
          <button className="btn btn-primary" onClick={() => setCreateModal(true)}>
            + Créer un tournoi
          </button>
        ) : null}
      </div>

      {body}

      {createModal ? (
        <Modal title="Bientôt disponible ici" onClose={() => setCreateModal(false)}>
          <p style={{ margin: 0 }}>
            La création de tournoi se fait pour l’instant depuis l’application mobile EGIDE
            (onglet Tournois). Elle arrivera prochainement dans cet espace.
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setCreateModal(false)}>
              Compris
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
