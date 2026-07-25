import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { Modal } from '../components/modal';
import { RegistrationBadge } from '../components/registration-badge';
import { Toast } from '../components/toast';
import type { TournamentWithCount } from '../hooks/use-my-tournaments';
import { useRegistrations, type Registration } from '../hooks/use-registrations';
import { ordinalFr } from '../lib/ordinal';
import { supabase } from '../lib/supabase';
import { formatDateNumeric, formatEventDateShort, RemovableStatuses } from '../lib/tournaments';

/** Au-delà de ce nombre de lignes, on propose une recherche (comme sur mobile). */
const SearchThreshold = 25;

type SortKey = 'pseudo' | 'faction' | 'created_at';

type Props = {
  tournament: TournamentWithCount | null;
  tournamentLoading: boolean;
  tournamentError: boolean;
  userId: string;
  /** Recharge le tournoi (compteur d'inscrits de la barre latérale). */
  onChanged: () => void;
};

/** Message du bandeau quand les retraits ne sont plus possibles. */
function readonlyMessage(status: string): string {
  if (status === 'in_progress') {
    return 'Le tournoi est en cours : la liste est figée. Les retraits du jour se feront depuis Check-in.';
  }
  if (status === 'completed') {
    return 'Ce tournoi est terminé : la liste des participants est conservée en lecture seule.';
  }
  return 'Ce tournoi a été annulé : la liste est conservée à titre d’historique.';
}

/** Cellule « joueur » : pastille avec l'initiale + pseudo. */
function PlayerCell({ registration }: { registration: Registration }) {
  const pseudo = registration.profile?.pseudo ?? 'Joueur';
  return (
    <div className="reg-cell">
      <span className="reg-avatar">{pseudo.charAt(0).toUpperCase()}</span>
      <span className="cell-name">{pseudo}</span>
    </div>
  );
}

export function InscritsPage({
  tournament,
  tournamentLoading,
  tournamentError,
  userId,
  onChanged,
}: Props) {
  const { registered, waitlisted, withdrawn, loading, error, refresh } = useRegistrations(
    tournament?.id
  );

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('pseudo');
  const [sortAsc, setSortAsc] = useState(true);
  const [toRemove, setToRemove] = useState<Registration | null>(null);
  const [busy, setBusy] = useState(false);
  const [removeError, setRemoveError] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [promotedId, setPromotedId] = useState<string | null>(null);

  // Les positions sont calculées avant tout filtrage : chercher un nom ne doit
  // pas changer le rang affiché.
  const positions = useMemo(() => {
    const map = new Map<string, number>();
    waitlisted.forEach((registration, index) => map.set(registration.id, index + 1));
    return map;
  }, [waitlisted]);

  const normalize = (value: string) =>
    value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  const matches = useMemo(() => {
    const needle = normalize(search.trim());
    return (registration: Registration) => {
      if (!needle) return true;
      const haystack = [
        registration.profile?.pseudo,
        registration.profile?.faction_favorite,
        registration.profile?.region,
      ]
        .filter(Boolean)
        .map((value) => normalize(value as string))
        .join(' ');
      return haystack.includes(needle);
    };
  }, [search]);

  const sortedRegistered = useMemo(() => {
    const copy = registered.filter(matches);
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'pseudo') {
        cmp = (a.profile?.pseudo ?? '').localeCompare(b.profile?.pseudo ?? '', 'fr', {
          sensitivity: 'base',
        });
      } else if (sortKey === 'faction') {
        cmp = (a.profile?.faction_favorite ?? '').localeCompare(
          b.profile?.faction_favorite ?? '',
          'fr',
          { sensitivity: 'base' }
        );
      } else {
        cmp = a.created_at.localeCompare(b.created_at);
      }
      return sortAsc ? cmp : -cmp;
    });
    return copy;
  }, [registered, matches, sortKey, sortAsc]);

  const filteredWaitlist = waitlisted.filter(matches);
  const filteredWithdrawn = withdrawn.filter(matches);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortAsc((v) => !v);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  }

  function sortHeader(key: SortKey, label: string, width?: number) {
    const active = key === sortKey;
    return (
      <th
        className={active ? 'sort-active' : ''}
        style={{ width, cursor: 'pointer' }}
        onClick={() => toggleSort(key)}>
        {label} {active ? (sortAsc ? '▲' : '▼') : ''}
      </th>
    );
  }

  async function handleRemove() {
    if (!supabase || !toRemove) return;
    const removedName = toRemove.profile?.pseudo ?? 'Ce joueur';
    // Le premier de la file prendra la place : on le retient avant l'appel.
    const promoted = waitlisted[0] ?? null;

    setBusy(true);
    setRemoveError(false);
    const { error: dbError } = await supabase.rpc('remove_registration', {
      p_registration_id: toRemove.id,
    });
    setBusy(false);

    if (dbError) {
      setRemoveError(true);
      return;
    }

    setToRemove(null);
    await refresh();
    onChanged();

    if (promoted) {
      const promotedName = promoted.profile?.pseudo ?? 'Le premier de la liste';
      setToast(`${removedName} a été retiré. ${promotedName} passe de la liste d’attente aux inscrits.`);
      // Surligne la ligne promue le temps du toast.
      setPromotedId(promoted.id);
      setTimeout(() => setPromotedId(null), 4000);
    } else {
      setToast(`${removedName} a été retiré du tournoi.`);
    }
  }

  if (tournamentLoading || loading) {
    return (
      <>
        <h1 className="page-title">Inscrits</h1>
        <div className="stats-row">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton stat-card" style={{ height: 88 }} />
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 24 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton" style={{ height: 52 }} />
          ))}
        </div>
      </>
    );
  }

  if (tournamentError || !tournament || tournament.organizer_id !== userId) {
    return (
      <div className="empty-state">
        <h2>Tournoi introuvable</h2>
        <p>Il n’existe pas, ou vous n’en êtes pas l’organisateur.</p>
        <Link to="/tournois" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
          Retour à mes tournois
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <>
        <h1 className="page-title">Inscrits</h1>
        <div className="empty-state">
          <p>Impossible de charger les inscrits.</p>
          <button className="btn btn-secondary" onClick={refresh}>
            Réessayer
          </button>
        </div>
      </>
    );
  }

  const canRemove = RemovableStatuses.includes(tournament.status);
  const showStatusColumn = !canRemove;
  const total = registered.length + waitlisted.length + withdrawn.length;
  const remaining = tournament.capacity - registered.length;
  const isFull = registered.length >= tournament.capacity;
  const fillPercent = Math.min(
    100,
    Math.round((registered.length / tournament.capacity) * 100)
  );
  const noResults =
    search.trim() !== '' &&
    sortedRegistered.length === 0 &&
    filteredWaitlist.length === 0 &&
    filteredWithdrawn.length === 0;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Inscrits</h1>
          <div className="page-subtitle">{formatEventDateShort(tournament.event_date)}</div>
        </div>
        {total > SearchThreshold ? (
          <input
            className="input search-input"
            placeholder="Rechercher un joueur"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        ) : null}
      </div>

      {!canRemove ? (
        <div
          className={`banner banner-info${tournament.status === 'cancelled' ? ' banner-info-danger' : ''}`}
          style={{ marginTop: 24, maxWidth: 560 }}>
          🔒 {readonlyMessage(tournament.status)}
        </div>
      ) : null}

      {/* Résumé chiffré */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value">
            {registered.length} / {tournament.capacity}
          </div>
          <div className="stat-label">Inscrits</div>
          <div className="mini-gauge">
            <div
              className={`mini-gauge-fill${isFull ? ' full' : ''}`}
              style={{ width: `${fillPercent}%` }}
            />
          </div>
          <div className="stat-label">
            {isFull ? 'Complet' : `${remaining} place${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''}`}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{waitlisted.length}</div>
          <div className="stat-label">En liste d’attente</div>
        </div>
        {withdrawn.length > 0 ? (
          <div className="stat-card">
            <div className="stat-value">{withdrawn.length}</div>
            <div className="stat-label">Désistements</div>
          </div>
        ) : null}
      </div>

      {noResults ? (
        <div className="empty-state" style={{ padding: 24 }}>
          <p>Aucun joueur ne correspond à « {search} ».</p>
          <button className="btn btn-secondary" onClick={() => setSearch('')}>
            Effacer la recherche
          </button>
        </div>
      ) : total === 0 ? (
        <div className="empty-state">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <h2>Aucun inscrit pour l’instant</h2>
          <p>
            {tournament.status === 'open'
              ? 'Les joueurs peuvent s’inscrire depuis l’application mobile EGIDE. Ils apparaîtront ici.'
              : tournament.status === 'draft'
                ? 'Ce tournoi est en brouillon : ouvrez les inscriptions pour que les joueurs puissent s’y inscrire.'
                : 'Aucun joueur n’était inscrit à ce tournoi.'}
          </p>
        </div>
      ) : (
        <>
          {/* Inscrits */}
          {sortedRegistered.length > 0 ? (
            <>
              <h2 className="section-title">Inscrits ({registered.length})</h2>
              <table className="table table-static">
                <thead>
                  <tr>
                    {sortHeader('pseudo', 'Joueur')}
                    <th className="hide-narrow" style={{ width: 200 }}>
                      Faction
                    </th>
                    <th className="hide-narrow" style={{ width: 140 }}>
                      Région
                    </th>
                    {sortHeader('created_at', 'Inscrit le', 120)}
                    {showStatusColumn ? <th style={{ width: 110 }}>Statut</th> : null}
                    {canRemove ? <th style={{ width: 96 }} /> : null}
                  </tr>
                </thead>
                <tbody>
                  {sortedRegistered.map((registration) => (
                    <tr
                      key={registration.id}
                      className={registration.id === promotedId ? 'row-highlight' : ''}>
                      <td>
                        <PlayerCell registration={registration} />
                      </td>
                      <td className="hide-narrow">
                        {registration.profile?.faction_favorite ?? '—'}
                      </td>
                      <td className="hide-narrow">{registration.profile?.region ?? '—'}</td>
                      <td className="hide-narrow" style={{ fontSize: 13 }}>
                        {formatDateNumeric(registration.created_at)}
                      </td>
                      {showStatusColumn ? (
                        <td>
                          <RegistrationBadge status={registration.status} />
                        </td>
                      ) : null}
                      {canRemove ? (
                        <td className="cell-actions">
                          <button
                            className="btn btn-sm btn-ghost-danger"
                            aria-label={`Retirer ${registration.profile?.pseudo ?? 'ce joueur'} du tournoi`}
                            onClick={() => {
                              setRemoveError(false);
                              setToRemove(registration);
                            }}>
                            Retirer
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}

          {/* Liste d'attente */}
          {waitlisted.length > 0 || isFull ? (
            <>
              <h2 className="section-title">Liste d’attente ({waitlisted.length})</h2>
              {waitlisted.length === 0 ? (
                <p className="field-hint" style={{ marginTop: 8 }}>
                  Personne en liste d’attente pour l’instant.
                </p>
              ) : (
                <>
                  {canRemove ? (
                    <div className="banner banner-info" style={{ marginTop: 16, maxWidth: 560 }}>
                      Les joueurs entrent dans l’ordre d’arrivée. Si vous retirez un inscrit, le
                      premier de cette liste prend sa place automatiquement.
                    </div>
                  ) : null}
                  <table className="table table-static">
                    <thead>
                      <tr>
                        <th style={{ width: 72 }}>Position</th>
                        <th>Joueur</th>
                        <th className="hide-narrow" style={{ width: 200 }}>
                          Faction
                        </th>
                        <th className="hide-narrow" style={{ width: 140 }}>
                          Région
                        </th>
                        <th className="hide-narrow" style={{ width: 140 }}>
                          En attente depuis
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredWaitlist.map((registration) => (
                        <tr key={registration.id}>
                          <td>
                            <span className="waitlist-rank">
                              {ordinalFr(positions.get(registration.id) ?? 1)}
                            </span>
                          </td>
                          <td>
                            <PlayerCell registration={registration} />
                          </td>
                          <td className="hide-narrow">
                            {registration.profile?.faction_favorite ?? '—'}
                          </td>
                          <td className="hide-narrow">{registration.profile?.region ?? '—'}</td>
                          <td className="hide-narrow" style={{ fontSize: 13 }}>
                            {formatDateNumeric(registration.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </>
          ) : null}

          {/* Désistements */}
          {filteredWithdrawn.length > 0 ? (
            <details className="details-section">
              <summary>Désistements ({withdrawn.length})</summary>
              <table className="table table-static">
                <thead>
                  <tr>
                    <th>Joueur</th>
                    <th className="hide-narrow" style={{ width: 200 }}>
                      Faction
                    </th>
                    <th className="hide-narrow" style={{ width: 140 }}>
                      Région
                    </th>
                    <th className="hide-narrow" style={{ width: 120 }}>
                      Inscrit le
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWithdrawn.map((registration) => (
                    <tr key={registration.id} className="row-muted">
                      <td>
                        <PlayerCell registration={registration} />
                      </td>
                      <td className="hide-narrow">
                        {registration.profile?.faction_favorite ?? '—'}
                      </td>
                      <td className="hide-narrow">{registration.profile?.region ?? '—'}</td>
                      <td className="hide-narrow" style={{ fontSize: 13 }}>
                        {formatDateNumeric(registration.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          ) : null}
        </>
      )}

      {toRemove ? (
        <Modal
          title={`Retirer « ${toRemove.profile?.pseudo ?? 'ce joueur'} » du tournoi ?`}
          onClose={() => setToRemove(null)}>
          <p style={{ margin: 0 }}>
            Ce joueur perdra sa place. Il pourra se réinscrire tant que les inscriptions sont
            ouvertes.
            {waitlisted.length === 0 ? ' Une place se libérera immédiatement.' : ''}
          </p>
          {waitlisted.length > 0 ? (
            <div className="banner banner-info">
              <strong>{waitlisted[0].profile?.pseudo ?? 'Le premier de la liste'}</strong> (1er de
              la liste d’attente) sera inscrit automatiquement à sa place.
            </div>
          ) : null}
          {removeError ? (
            <div className="banner banner-danger">
              Impossible de retirer ce joueur. Vérifiez votre connexion et réessayez.
            </div>
          ) : null}
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setToRemove(null)}>
              Conserver le joueur
            </button>
            <button className="btn btn-danger" disabled={busy} onClick={handleRemove}>
              {busy ? 'Retrait…' : 'Retirer du tournoi'}
            </button>
          </div>
        </Modal>
      ) : null}

      {toast ? <Toast message={toast} onDone={() => setToast(null)} /> : null}
    </>
  );
}
