import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { StatusBadge } from '../components/status-badge';
import { AdminPageHeader } from '../components/admin-page-header';
import { useAllTournaments, type AdminTournament } from '../hooks/use-admin';
import {
  formatDateNumeric,
  formatEventDateShort,
  StatusLabels,
  type TournamentStatus,
} from '../lib/tournaments';

type SortKey = 'name' | 'organizer' | 'event_date' | 'status' | 'created_at';

/** Ordre d'affichage des filtres : le cycle de vie d'un tournoi. */
const StatusOrder: TournamentStatus[] = [
  'draft',
  'open',
  'in_progress',
  'completed',
  'cancelled',
];

/** Insensible à la casse et aux accents (« Hérault » se trouve en tapant « herault »). */
function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Nombre de lignes rendues d'un coup ; le reste vient au bouton. */
const PageSize = 50;

export function AdminTournoisPage({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const { tournaments, loading, error, refresh, truncated } = useAllTournaments();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TournamentStatus | 'all'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('event_date');
  const [sortAsc, setSortAsc] = useState(false);
  const [shown, setShown] = useState(PageSize);

  // Les compteurs des filtres portent sur l'ensemble, jamais sur le résultat
  // filtré : sinon « Brouillon (12) » deviendrait « Brouillon (12 sur 12) ».
  const counts = useMemo(() => {
    const map = new Map<TournamentStatus, number>();
    for (const tournament of tournaments) {
      map.set(tournament.status, (map.get(tournament.status) ?? 0) + 1);
    }
    return map;
  }, [tournaments]);

  const filtered = useMemo(() => {
    const needle = normalize(search.trim());
    const result = tournaments.filter((tournament) => {
      if (statusFilter !== 'all' && tournament.status !== statusFilter) return false;
      if (!needle) return true;
      const haystack = [
        tournament.name,
        tournament.city,
        tournament.region,
        tournament.organizer_pseudo,
      ]
        .filter(Boolean)
        .map((value) => normalize(value as string))
        .join(' ');
      return haystack.includes(needle);
    });

    result.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') cmp = a.name.localeCompare(b.name, 'fr');
      else if (sortKey === 'organizer')
        cmp = (a.organizer_pseudo ?? '').localeCompare(b.organizer_pseudo ?? '', 'fr');
      else if (sortKey === 'event_date') cmp = a.event_date.localeCompare(b.event_date);
      else if (sortKey === 'created_at') cmp = a.created_at.localeCompare(b.created_at);
      else cmp = StatusLabels[a.status].localeCompare(StatusLabels[b.status], 'fr');
      return sortAsc ? cmp : -cmp;
    });
    return result;
  }, [tournaments, search, statusFilter, sortKey, sortAsc]);

  // Aucune relégation des tournois terminés en bas de liste, contrairement à
  // « Mes tournois » : filtrer sur « Annulé » donnerait une page entièrement
  // reléguée. En supervision, le tri est le tri.

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortAsc((value) => !value);
    } else {
      setSortKey(key);
      setSortAsc(key === 'name' || key === 'organizer');
    }
    setShown(PageSize);
  }

  function sortHeader(key: SortKey, label: string, extraClass = '') {
    const active = key === sortKey;
    return (
      <th
        className={`${active ? 'sort-active' : ''} ${extraClass}`.trim()}
        aria-sort={active ? (sortAsc ? 'ascending' : 'descending') : 'none'}>
        <button type="button" onClick={() => toggleSort(key)}>
          {label} {active ? (sortAsc ? '▲' : '▼') : ''}
        </button>
      </th>
    );
  }

  function resetFilters() {
    setSearch('');
    setStatusFilter('all');
    setShown(PageSize);
  }

  const visible = filtered.slice(0, shown);
  const hasFilter = search.trim() !== '' || statusFilter !== 'all';

  let subtitle: string;
  if (loading) subtitle = 'Chargement…';
  else if (hasFilter)
    subtitle = `${filtered.length} tournoi${filtered.length > 1 ? 's' : ''} affiché${
      filtered.length > 1 ? 's' : ''
    } sur ${tournaments.length}`;
  else {
    const drafts = counts.get('draft') ?? 0;
    const running = counts.get('in_progress') ?? 0;
    subtitle = [
      `${tournaments.length} tournoi${tournaments.length > 1 ? 's' : ''}`,
      drafts > 0 ? `${drafts} brouillon${drafts > 1 ? 's' : ''}` : null,
      running > 0 ? `${running} en cours` : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }

  let body;
  if (loading) {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 24 }}>
        {Array.from({ length: 10 }, (_, index) => (
          <div key={index} className="skeleton" style={{ height: 52 }} />
        ))}
      </div>
    );
  } else if (error) {
    body = (
      <div className="empty-state">
        <p>Impossible de charger les tournois.</p>
        <button className="btn btn-secondary" onClick={refresh}>
          Réessayer
        </button>
      </div>
    );
  } else if (tournaments.length === 0) {
    body = (
      <div className="empty-state">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5">
          <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM7 6H4a1 1 0 0 0-1 1c0 2 1.5 4 4 4M17 6h3a1 1 0 0 1 1 1c0 2-1.5 4-4 4" />
        </svg>
        <h2>Aucun tournoi sur la plateforme</h2>
        <p>Les tournois créés par les organisateurs apparaîtront ici.</p>
      </div>
    );
  } else if (filtered.length === 0) {
    // Trois causes possibles, trois messages : l'admin doit savoir quoi défaire.
    const term = search.trim();
    const statusLabel = statusFilter !== 'all' ? StatusLabels[statusFilter] : '';
    body = (
      <div className="empty-state">
        {term && statusLabel ? (
          <>
            <p>
              Aucun tournoi ne correspond à «&nbsp;{term}&nbsp;» avec le statut «&nbsp;
              {statusLabel}&nbsp;».
            </p>
            <button className="btn btn-secondary" onClick={resetFilters}>
              Réinitialiser les filtres
            </button>
          </>
        ) : term ? (
          <>
            <p>Aucun tournoi ne correspond à «&nbsp;{term}&nbsp;».</p>
            <button className="btn btn-secondary" onClick={() => setSearch('')}>
              Effacer la recherche
            </button>
          </>
        ) : (
          <>
            <p>Aucun tournoi au statut «&nbsp;{statusLabel}&nbsp;».</p>
            <button className="btn btn-secondary" onClick={() => setStatusFilter('all')}>
              Voir tous les statuts
            </button>
          </>
        )}
      </div>
    );
  } else {
    body = (
      <>
        <table className="table">
          <thead>
            <tr>
              {sortHeader('name', 'Nom')}
              {sortHeader('organizer', 'Organisateur', 'hide-narrow')}
              {sortHeader('event_date', 'Date')}
              {sortHeader('status', 'Statut')}
              <th className="hide-narrow" style={{ width: 120, cursor: 'default' }}>
                Inscrits
              </th>
              {sortHeader('created_at', 'Créé le', 'hide-narrow')}
            </tr>
          </thead>
          <tbody>
            {visible.map((tournament) => (
              <Row key={tournament.id} tournament={tournament} userId={userId} onOpen={navigate} />
            ))}
          </tbody>
        </table>

        {filtered.length > visible.length ? (
          <button
            className="btn btn-secondary"
            style={{ width: '100%', marginTop: 16 }}
            onClick={() => setShown((value) => value + PageSize)}>
            Afficher {Math.min(PageSize, filtered.length - visible.length)} de plus
          </button>
        ) : null}
      </>
    );
  }

  return (
    <>
      <AdminPageHeader title="Tous les tournois" subtitle={subtitle} />

      {!loading && !error && tournaments.length > 0 ? (
        <div className="admin-toolbar">
          <input
            className="input search-input"
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setShown(PageSize);
            }}
            placeholder="Rechercher un tournoi, une ville ou un organisateur"
            aria-label="Rechercher un tournoi, une ville ou un organisateur"
          />
          <div className="chips">
            <button
              type="button"
              className={statusFilter === 'all' ? 'active' : ''}
              onClick={() => {
                setStatusFilter('all');
                setShown(PageSize);
              }}>
              Tous ({tournaments.length})
            </button>
            {StatusOrder.filter((status) => (counts.get(status) ?? 0) > 0).map((status) => (
              <button
                key={status}
                type="button"
                className={statusFilter === status ? 'active' : ''}
                onClick={() => {
                  setStatusFilter(status);
                  setShown(PageSize);
                }}>
                {StatusLabels[status]} ({counts.get(status)})
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Ne jamais tronquer en silence : l'admin conclurait qu'un tournoi n'existe pas. */}
      {truncated ? (
        <p className="admin-truncated">
          Les {tournaments.length} tournois les plus récents sont affichés. Affinez la recherche
          pour aller au-delà.
        </p>
      ) : null}

      {body}
    </>
  );
}

function Row({
  tournament,
  userId,
  onOpen,
}: {
  tournament: AdminTournament;
  userId: string;
  onOpen: (path: string) => void;
}) {
  const target = `/admin/tournois/${tournament.id}`;
  const full = tournament.registered_count >= tournament.capacity;
  const percent = Math.min(
    100,
    Math.round((tournament.registered_count / tournament.capacity) * 100)
  );
  const owner = tournament.organizer_id === userId ? 'Vous' : tournament.organizer_pseudo;

  return (
    <tr onClick={() => onOpen(target)}>
      <td className="cell-name">
        <Link to={target} onClick={(event) => event.stopPropagation()} title={tournament.name}>
          {tournament.name}
        </Link>
        {/* En écran étroit, l'organisateur se replie ici : c'est le signal
            « ce n'est pas chez toi », il ne doit jamais disparaître. */}
        <div className="cell-sub">
          {tournament.city}
          {tournament.region ? ` · ${tournament.region}` : ''}
          <span className="show-narrow"> · par {owner ?? 'organisateur inconnu'}</span>
        </div>
      </td>
      <td className="hide-narrow" style={{ width: 200 }}>
        {owner ?? <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>Organisateur inconnu</span>}
      </td>
      <td style={{ width: 140 }}>{formatEventDateShort(tournament.event_date)}</td>
      <td style={{ width: 160 }}>
        <StatusBadge status={tournament.status} />
      </td>
      <td className="hide-narrow" style={{ width: 120 }}>
        <div style={{ fontSize: 13 }}>
          {tournament.registered_count} / {tournament.capacity}
          {full ? ' · Complet' : ''}
        </div>
        <div className="mini-gauge">
          <div className={`mini-gauge-fill${full ? ' full' : ''}`} style={{ width: `${percent}%` }} />
        </div>
      </td>
      <td className="hide-narrow" style={{ width: 110, fontSize: 13, color: 'var(--text-secondary)' }}>
        {formatDateNumeric(tournament.created_at)}
      </td>
    </tr>
  );
}
