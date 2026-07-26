import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { Modal } from '../components/modal';
import { Toast } from '../components/toast';
import type { TournamentWithCount } from '../hooks/use-my-tournaments';
import { useRegistrations, type Registration } from '../hooks/use-registrations';
import { ordinalFr } from '../lib/ordinal';
import { supabase } from '../lib/supabase';
import {
  CheckInEditableStatuses,
  formatEventDate,
  formatEventDateShort,
} from '../lib/tournaments';

type ListFilter = 'all' | 'todo' | 'done';

type Props = {
  tournament: TournamentWithCount | null;
  tournamentLoading: boolean;
  tournamentError: boolean;
  userId: string;
  onChanged: () => void;
};

type ToastState = {
  message: string;
  variant?: 'success' | 'danger';
  action?: { label: string; onPress: () => void };
};

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Une ligne de pointage : toute la ligne est la cible. */
function CheckInRow({
  registration,
  present,
  busy,
  failed,
  readonly,
  onToggle,
}: {
  registration: Registration;
  present: boolean;
  busy: boolean;
  failed: boolean;
  readonly: boolean;
  onToggle: () => void;
}) {
  const pseudo = registration.profile?.pseudo ?? 'Joueur';
  const className = [
    'checkin-row',
    present ? 'present' : '',
    busy ? 'busy' : '',
    failed ? 'failed' : '',
    readonly ? 'readonly' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      <span className={`checkin-box${present ? ' checked' : ''}`}>{present ? '✓' : ''}</span>
      <span>
        <span className="checkin-name">{pseudo}</span>
        <br />
        <span className="checkin-meta">{registration.profile?.faction_favorite ?? '—'}</span>
      </span>
      <span className={`checkin-state${present ? ' present' : ''}`}>
        {present ? 'Présent' : 'À pointer'}
      </span>
    </>
  );

  if (readonly) {
    return <div className={className}>{content}</div>;
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={present}
      aria-label={`${pseudo}, ${present ? 'présent — dépointer' : 'absent — pointer'}`}
      className={className}
      onClick={onToggle}>
      {content}
    </button>
  );
}

export function CheckInPage({
  tournament,
  tournamentLoading,
  tournamentError,
  userId,
  onChanged,
}: Props) {
  const { registered, waitlisted, loading, error, refresh } = useRegistrations(tournament?.id);

  const [search, setSearch] = useState('');
  const [listFilter, setListFilter] = useState<ListFilter>('all');
  // État local du pointage : la ligne bascule tout de suite, sans attendre
  // le réseau (salle bondée, wifi saturé).
  const [presence, setPresence] = useState<Record<string, boolean>>({});
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  /** Lignes maintenues visibles malgré le filtre, le temps de voir le résultat. */
  const [keptIds, setKeptIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<ToastState | null>(null);
  const [bulkModal, setBulkModal] = useState<'present' | 'reset' | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Synchronise l'état local avec les données chargées.
  useEffect(() => {
    setPresence(
      Object.fromEntries(registered.map((r) => [r.id, r.status === 'checked_in']))
    );
  }, [registered]);

  const editable = tournament ? CheckInEditableStatuses.includes(tournament.status) : false;

  const presentCount = registered.filter((r) => presence[r.id]).length;
  const todoCount = registered.length - presentCount;

  const filtered = useMemo(() => {
    const needle = normalize(search.trim());
    return registered.filter((r) => {
      if (needle) {
        const haystack = normalize(
          `${r.profile?.pseudo ?? ''} ${r.profile?.faction_favorite ?? ''}`
        );
        if (!haystack.includes(needle)) return false;
      }
      if (listFilter === 'todo') return !presence[r.id] || keptIds.has(r.id);
      if (listFilter === 'done') return presence[r.id] || keptIds.has(r.id);
      return true;
    });
  }, [registered, search, listFilter, presence, keptIds]);

  function clearKept() {
    if (keptIds.size > 0) setKeptIds(new Set());
  }

  /**
   * Pointe (ou dépointe) un joueur. La valeur cible est explicite : les
   * actions différées du message de confirmation (« Annuler », « Réessayer »)
   * ne doivent pas dépendre de l'état au moment où elles ont été créées.
   */
  async function toggle(registration: Registration, desired: boolean) {
    if (!supabase || busyIds.has(registration.id)) return;
    const next = desired;
    const pseudo = registration.profile?.pseudo ?? 'Ce joueur';

    // Bascule immédiate, puis appel réseau.
    setPresence((current) => ({ ...current, [registration.id]: next }));
    setBusyIds((current) => new Set(current).add(registration.id));
    setFailedIds((current) => {
      const copy = new Set(current);
      copy.delete(registration.id);
      return copy;
    });
    if (listFilter !== 'all') {
      setKeptIds((current) => new Set(current).add(registration.id));
    }

    const { error: dbError } = await supabase.rpc('set_check_in', {
      p_registration_id: registration.id,
      p_present: next,
    });

    setBusyIds((current) => {
      const copy = new Set(current);
      copy.delete(registration.id);
      return copy;
    });

    if (dbError) {
      // Retour arrière visible : un joueur qu'on croit pointé et qui ne l'est
      // pas, c'est un appariement raté.
      setPresence((current) => ({ ...current, [registration.id]: !next }));
      setFailedIds((current) => new Set(current).add(registration.id));
      setTimeout(() => {
        setFailedIds((current) => {
          const copy = new Set(current);
          copy.delete(registration.id);
          return copy;
        });
      }, 4000);
      setToast({
        message: `Impossible de pointer ${pseudo}. Vérifiez votre connexion.`,
        variant: 'danger',
        action: { label: 'Réessayer', onPress: () => toggle(registration, next) },
      });
      return;
    }

    setToast({
      message: next
        ? `${pseudo} est pointé présent.`
        : `${pseudo} repasse au statut Inscrit.`,
      action: { label: 'Annuler', onPress: () => toggle(registration, !next) },
    });

    // Prêt pour le joueur suivant, sans toucher la souris.
    if (next && search.trim() !== '') {
      setSearch('');
      searchRef.current?.focus();
    }
  }

  async function applyBulk(present: boolean) {
    if (!supabase || !tournament) return;
    setBulkBusy(true);
    const { data, error: dbError } = await supabase.rpc('set_check_in_all', {
      p_tournament_id: tournament.id,
      p_present: present,
    });
    setBulkBusy(false);
    setBulkModal(null);

    if (dbError) {
      setToast({
        message: 'Impossible d’appliquer l’action groupée. Vérifiez votre connexion.',
        variant: 'danger',
      });
      return;
    }

    await refresh();
    onChanged();
    const count = typeof data === 'number' ? data : 0;
    setToast({
      message: present
        ? `${count} joueur${count > 1 ? 's' : ''} marqué${count > 1 ? 's' : ''} présent${count > 1 ? 's' : ''}.`
        : `Pointage réinitialisé pour ${count} joueur${count > 1 ? 's' : ''}.`,
      action: { label: 'Annuler', onPress: () => applyBulk(!present) },
    });
  }

  if (tournamentLoading || loading) {
    return (
      <>
        <h1 className="page-title">Check-in</h1>
        <div className="skeleton" style={{ height: 96, marginTop: 24 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 24 }}>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="skeleton" style={{ height: 64 }} />
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

  if (tournament.status === 'draft') {
    return (
      <div className="empty-state">
        <h2>Le pointage n’est pas encore ouvert</h2>
        <p>
          Ce tournoi est en brouillon. Ouvrez les inscriptions pour que des joueurs puissent
          s’inscrire, puis revenez pointer le jour J.
        </p>
        <Link to={`/tournois/${tournament.id}`}>Retour au tournoi</Link>
      </div>
    );
  }

  if (tournament.status === 'cancelled') {
    return (
      <div className="empty-state">
        <h2>Tournoi annulé</h2>
        <p>Ce tournoi a été annulé, il n’y a pas de pointage à effectuer.</p>
        <Link to={`/tournois/${tournament.id}`}>Retour au tournoi</Link>
      </div>
    );
  }

  if (error) {
    return (
      <>
        <h1 className="page-title">Check-in</h1>
        <div className="empty-state">
          <p>Impossible de charger la liste des joueurs.</p>
          <p>Vérifiez votre connexion : sans cette liste, le pointage est impossible.</p>
          <button className="btn btn-primary" onClick={refresh}>
            Réessayer
          </button>
        </div>
      </>
    );
  }

  if (registered.length === 0) {
    return (
      <>
        <h1 className="page-title">Check-in</h1>
        <div className="empty-state">
          <h2>Aucun joueur à pointer</h2>
          <p>
            Personne n’est inscrit à ce tournoi pour l’instant. Les inscriptions se font depuis
            l’application mobile EGIDE.
          </p>
          <Link to={`/tournois/${tournament.id}/inscrits`}>Voir les inscrits →</Link>
        </div>
      </>
    );
  }

  const isFuture = tournament.event_date > new Date().toISOString().slice(0, 10);
  const fillPercent = Math.round((presentCount / registered.length) * 100);
  const hiddenKept = keptIds.size;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Check-in</h1>
          <div className="page-subtitle">
            {formatEventDateShort(tournament.event_date)} · {tournament.city}
          </div>
        </div>
      </div>

      {!editable ? (
        <div className="banner banner-info" style={{ marginTop: 24, maxWidth: 640 }}>
          🔒{' '}
          {tournament.status === 'in_progress'
            ? 'Le tournoi est lancé : les appariements sont générés, le pointage est figé. Les abandons en cours de tournoi se gèrent depuis Rondes & scores.'
            : 'Ce tournoi est terminé : le pointage est conservé à titre d’historique.'}
        </div>
      ) : isFuture ? (
        <div className="banner banner-info" style={{ marginTop: 24, maxWidth: 640 }}>
          Le tournoi a lieu le {formatEventDate(tournament.event_date).toLowerCase()}. Vous pouvez
          pointer dès maintenant : le pointage est conservé.
        </div>
      ) : null}

      {/* Synthèse collante */}
      <div className="checkin-summary">
        <div aria-live="polite">
          <span className="checkin-count">
            {presentCount} / {registered.length}
          </span>{' '}
          <span style={{ color: 'var(--text-secondary)' }}>présents</span>
          <div
            className="stat-label"
            style={todoCount === 0 ? { color: 'var(--success)' } : undefined}>
            {todoCount === 0
              ? 'Tous les inscrits sont pointés'
              : `${todoCount} joueur${todoCount > 1 ? 's' : ''} pas encore pointé${todoCount > 1 ? 's' : ''}`}
          </div>
        </div>
        <div className="mini-gauge" style={{ maxWidth: 'none', marginTop: 8 }}>
          <div className="mini-gauge-fill present" style={{ width: `${fillPercent}%` }} />
        </div>

        <div className="checkin-toolbar">
          <div style={{ flex: 1, minWidth: 280 }}>
            <input
              ref={searchRef}
              type="search"
              autoComplete="off"
              autoFocus
              className="input checkin-search"
              placeholder="Rechercher un joueur"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                clearKept();
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setSearch('');
                // Entrée ne pointe que s'il n'y a aucune ambiguïté.
                if (event.key === 'Enter' && editable && filtered.length === 1) {
                  toggle(filtered[0], !presence[filtered[0].id]);
                }
              }}
            />
            {search.trim() !== '' && editable ? (
              <div className="field-hint" style={{ marginTop: 4 }}>
                {filtered.length === 1
                  ? `Appuyez sur Entrée pour pointer ${filtered[0].profile?.pseudo}`
                  : filtered.length > 1
                    ? `${filtered.length} joueurs correspondent, précisez le nom`
                    : ''}
              </div>
            ) : null}
          </div>
          <div className="segmented" style={{ alignSelf: 'flex-start' }}>
            <button
              type="button"
              className={listFilter === 'all' ? 'active' : ''}
              onClick={() => {
                setListFilter('all');
                clearKept();
              }}>
              Tous ({registered.length})
            </button>
            <button
              type="button"
              className={listFilter === 'todo' ? 'active' : ''}
              onClick={() => {
                setListFilter('todo');
                clearKept();
              }}>
              À pointer ({todoCount})
            </button>
            <button
              type="button"
              className={listFilter === 'done' ? 'active' : ''}
              onClick={() => {
                setListFilter('done');
                clearKept();
              }}>
              Présents ({presentCount})
            </button>
          </div>
        </div>
      </div>

      {/* Liste */}
      {filtered.length === 0 ? (
        <div className="empty-state" style={{ padding: 24 }}>
          {search.trim() !== '' ? (
            <>
              <p>Aucun joueur ne correspond à « {search} ».</p>
              <button className="btn btn-secondary" onClick={() => setSearch('')}>
                Effacer la recherche
              </button>
            </>
          ) : listFilter === 'todo' ? (
            <>
              <p>Tous les inscrits sont pointés.</p>
              <button className="btn btn-secondary" onClick={() => setListFilter('all')}>
                Voir tous les joueurs
              </button>
            </>
          ) : (
            <p>Aucun joueur pointé pour l’instant.</p>
          )}
        </div>
      ) : (
        <div className="checkin-list">
          {filtered.map((registration) => (
            <CheckInRow
              key={registration.id}
              registration={registration}
              present={Boolean(presence[registration.id])}
              busy={busyIds.has(registration.id)}
              failed={failedIds.has(registration.id)}
              readonly={!editable}
              onToggle={() => toggle(registration, !presence[registration.id])}
            />
          ))}
          {hiddenKept > 0 && listFilter !== 'all' ? (
            <button
              className="btn btn-secondary btn-sm"
              style={{ margin: 'var(--sp-3) 0' }}
              onClick={clearKept}>
              Masquer les {hiddenKept} joueur{hiddenKept > 1 ? 's' : ''} pointé
              {hiddenKept > 1 ? 's' : ''}
            </button>
          ) : null}
        </div>
      )}

      {/* Amorce du lancement (US-3.2) */}
      {editable && presentCount > 0 ? (
        <div className="checkin-launch">
          <div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>Pointage terminé ?</div>
            <p style={{ margin: '4px 0 0' }}>
              {presentCount} joueur{presentCount > 1 ? 's' : ''} présent
              {presentCount > 1 ? 's' : ''} ser{presentCount > 1 ? 'ont' : 'a'} apparié
              {presentCount > 1 ? 's' : ''} à la ronde 1.
              {todoCount > 0
                ? ` ${todoCount} joueur${todoCount > 1 ? 's' : ''} non pointé${todoCount > 1 ? 's' : ''} ser${todoCount > 1 ? 'ont' : 'a'} écarté${todoCount > 1 ? 's' : ''} du tournoi.`
                : ''}
            </p>
            {presentCount % 2 === 1 ? (
              <div className="field-hint" style={{ marginTop: 8 }}>
                Nombre impair de présents : un joueur aura un bye à chaque ronde.
              </div>
            ) : null}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="btn btn-primary" disabled title="Disponible prochainement">
              Lancer le tournoi
            </button>
            <span className="badge-soon">Bientôt</span>
          </div>
        </div>
      ) : null}

      {/* Liste d'attente, en lecture seule */}
      {waitlisted.length > 0 ? (
        <details className="details-section">
          <summary>Liste d’attente ({waitlisted.length})</summary>
          <div className="banner banner-info" style={{ margin: '16px 0', maxWidth: 640 }}>
            Un joueur en attente ne peut pas être pointé tant qu’une place n’est pas libérée.
            Retirez d’abord un absent depuis la page Inscrits : le premier de cette liste prendra
            automatiquement sa place et apparaîtra ici, prêt à être pointé.{' '}
            <Link to={`/tournois/${tournament.id}/inscrits`}>Gérer les inscrits →</Link>
          </div>
          <table className="table table-static">
            <thead>
              <tr>
                <th style={{ width: 72 }}>Position</th>
                <th>Joueur</th>
                <th className="hide-narrow" style={{ width: 200 }}>
                  Faction
                </th>
              </tr>
            </thead>
            <tbody>
              {waitlisted.map((registration, index) => (
                <tr key={registration.id}>
                  <td>
                    <span className="waitlist-rank">{ordinalFr(index + 1)}</span>
                  </td>
                  <td>
                    <div className="reg-cell">
                      <span className="reg-avatar">
                        {(registration.profile?.pseudo ?? '?').charAt(0).toUpperCase()}
                      </span>
                      <span className="cell-name">{registration.profile?.pseudo}</span>
                    </div>
                  </td>
                  <td className="hide-narrow">{registration.profile?.faction_favorite ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}

      {/* Actions groupées, volontairement loin de la zone de pointage */}
      {editable ? (
        <details className="details-section">
          <summary>Actions groupées</summary>
          <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
            <button
              className="btn btn-secondary"
              disabled={todoCount === 0}
              onClick={() => setBulkModal('present')}>
              Tout marquer présent
            </button>
            {presentCount > 0 ? (
              <button className="btn btn-danger-outline" onClick={() => setBulkModal('reset')}>
                Réinitialiser le pointage
              </button>
            ) : null}
          </div>
        </details>
      ) : null}

      {bulkModal === 'present' ? (
        <Modal
          title={`Marquer les ${todoCount} joueurs restants comme présents ?`}
          onClose={() => setBulkModal(null)}>
          <p style={{ margin: 0 }}>
            Les {presentCount} joueur{presentCount > 1 ? 's' : ''} déjà pointé
            {presentCount > 1 ? 's' : ''} ne change{presentCount > 1 ? 'nt' : ''} pas. Vous pourrez
            dépointer individuellement les absents ensuite.
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setBulkModal(null)}>
              Annuler
            </button>
            <button className="btn btn-primary" disabled={bulkBusy} onClick={() => applyBulk(true)}>
              {bulkBusy ? 'Application…' : `Marquer ${todoCount} présents`}
            </button>
          </div>
        </Modal>
      ) : null}

      {bulkModal === 'reset' ? (
        <Modal title="Réinitialiser le pointage ?" onClose={() => setBulkModal(null)}>
          <p style={{ margin: 0 }}>
            Les {presentCount} joueur{presentCount > 1 ? 's' : ''} pointé
            {presentCount > 1 ? 's' : ''} repassero{presentCount > 1 ? 'nt' : 'nt'} au statut
            « Inscrit ». Cette action ne supprime aucune inscription.
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setBulkModal(null)}>
              Annuler
            </button>
            <button className="btn btn-danger" disabled={bulkBusy} onClick={() => applyBulk(false)}>
              {bulkBusy ? 'Réinitialisation…' : 'Réinitialiser'}
            </button>
          </div>
        </Modal>
      ) : null}

      {toast ? (
        <Toast
          message={toast.message}
          variant={toast.variant}
          action={toast.action}
          duration={6000}
          onDone={() => setToast(null)}
        />
      ) : null}
    </>
  );
}
