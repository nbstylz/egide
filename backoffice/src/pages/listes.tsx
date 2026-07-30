import { useEffect, useMemo, useState } from 'react';

import { Toast } from '../components/toast';
import type { TournamentWithCount } from '../hooks/use-my-tournaments';
import { useArmyLists, type ListEntry } from '../hooks/use-army-lists';
import { formatEventDateShort } from '../lib/tournaments';

type Filter = 'todo' | 'approved' | 'rejected' | 'missing' | 'all';

type Props = {
  tournament: TournamentWithCount | null;
  tournamentLoading: boolean;
  tournamentError: boolean;
  userId: string;
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

/** « 12 juil. 18:04 ». */
function shortDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusBadge(entry: ListEntry) {
  if (!entry.list) return <span className="badge badge-list-none">Non soumise</span>;
  if (entry.list.status === 'approved')
    return <span className="badge badge-list-validated">Validée</span>;
  if (entry.list.status === 'rejected')
    return <span className="badge badge-list-rejected">Refusée</span>;
  return <span className="badge badge-list-submitted">À relire</span>;
}

function matchesFilter(entry: ListEntry, filter: Filter) {
  if (filter === 'all') return true;
  if (filter === 'missing') return entry.list === null;
  if (filter === 'todo') return entry.list?.status === 'submitted';
  if (filter === 'approved') return entry.list?.status === 'approved';
  return entry.list?.status === 'rejected';
}

/**
 * Relecture des listes d'armées : un tableau pour la vue d'ensemble, un
 * panneau latéral pour relire à la file — la liste reste sous les yeux
 * pendant qu'on rédige un motif de refus.
 */
export function ListesPage({ tournament, tournamentLoading, tournamentError }: Props) {
  const { entries, loading, error, refresh, review, reopen } = useArmyLists(tournament?.id);

  const [filter, setFilter] = useState<Filter | null>(null);
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [comment, setComment] = useState('');
  const [commentError, setCommentError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const counts = useMemo(
    () => ({
      todo: entries.filter((e) => e.list?.status === 'submitted').length,
      approved: entries.filter((e) => e.list?.status === 'approved').length,
      rejected: entries.filter((e) => e.list?.status === 'rejected').length,
      missing: entries.filter((e) => e.list === null).length,
      all: entries.length,
    }),
    [entries]
  );

  // Filtre par défaut : « À relire » s'il y a du travail, sinon tout.
  const activeFilter: Filter = filter ?? (counts.todo > 0 ? 'todo' : 'all');
  useEffect(() => {
    if (filter === null && !loading && counts.todo > 0) setFilter('todo');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const query = normalize(search.trim());
  const sorted = useMemo(() => {
    const order = (entry: ListEntry) => {
      if (entry.list?.status === 'submitted') return 0;
      if (entry.list?.status === 'rejected') return 1;
      if (entry.list?.status === 'approved') return 2;
      return 3;
    };
    return [...entries].sort((a, b) => {
      const byStatus = order(a) - order(b);
      if (byStatus !== 0) return byStatus;
      // Les soumises les plus anciennes d'abord : une file FIFO.
      if (a.list && b.list) return a.list.submitted_at.localeCompare(b.list.submitted_at);
      return a.pseudo.localeCompare(b.pseudo, 'fr', { sensitivity: 'base' });
    });
  }, [entries]);

  const visible = sorted.filter(
    (entry) =>
      matchesFilter(entry, activeFilter) && (!query || normalize(entry.pseudo).includes(query))
  );

  // La file de relecture parcourt le filtre actif.
  const openEntry = openId ? (entries.find((e) => e.registrationId === openId) ?? null) : null;
  const queue = visible.filter((e) => e.list !== null);
  const openIndex = openEntry ? queue.findIndex((e) => e.registrationId === openId) : -1;

  const readOnly = tournament?.status !== 'open' && tournament?.status !== 'draft';

  function openPanel(entry: ListEntry) {
    if (!entry.list) return;
    setOpenId(entry.registrationId);
    setRejecting(false);
    setComment('');
    setCommentError(false);
  }

  function closePanel() {
    setOpenId(null);
    setRejecting(false);
    setComment('');
  }

  /** Après une décision : liste suivante « à relire », sinon fermeture. */
  function advance() {
    const next = queue.find(
      (e) => e.registrationId !== openId && e.list?.status === 'submitted'
    );
    if (next) openPanel(next);
    else closePanel();
  }

  async function approve(entry: ListEntry) {
    if (!entry.list || busy) return;
    setBusy(true);
    const result = await review(entry.list.id, true, null);
    setBusy(false);
    if (!result.ok) {
      setToast({
        message: 'Impossible d’enregistrer la décision. Vérifiez votre connexion.',
        variant: 'danger',
      });
      return;
    }
    const listId = entry.list.id;
    setToast({
      message: `Liste de ${entry.pseudo} validée.`,
      action: {
        label: 'Annuler',
        onPress: async () => {
          await reopen(listId);
        },
      },
    });
    advance();
  }

  async function reject(entry: ListEntry) {
    if (!entry.list || busy) return;
    if (comment.trim() === '') {
      setCommentError(true);
      return;
    }
    setBusy(true);
    const result = await review(entry.list.id, false, comment.trim());
    setBusy(false);
    if (!result.ok) {
      // Le motif saisi reste dans le champ : rien à retaper.
      setToast({
        message: 'Impossible d’enregistrer la décision. Vérifiez votre connexion.',
        variant: 'danger',
      });
      return;
    }
    setToast({
      message: `Liste de ${entry.pseudo} refusée. Le motif est visible dans l’application.`,
    });
    advance();
  }

  async function copyMissing() {
    const missing = entries.filter((e) => e.list === null).map((e) => e.pseudo);
    await navigator.clipboard.writeText(missing.join('\n'));
    setToast({
      message: `${missing.length} pseudo${missing.length > 1 ? 's' : ''} copié${missing.length > 1 ? 's' : ''}. Collez-les dans votre canal d’annonce pour relancer.`,
    });
  }

  // Fermeture au clavier.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') closePanel();
    }
    if (openId) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId]);

  if (tournamentLoading || loading) {
    return (
      <>
        <h1 className="page-title">Listes d’armées</h1>
        <div className="skeleton" style={{ height: 96, marginTop: 16 }} />
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="skeleton" style={{ height: 52, marginTop: 8 }} />
        ))}
      </>
    );
  }

  if (tournamentError || !tournament) {
    return (
      <div className="empty-state">
        <h2>Tournoi introuvable</h2>
        <p>Il n’existe pas, ou vous n’en êtes pas l’organisateur.</p>
      </div>
    );
  }

  if (tournament.status === 'draft') {
    return (
      <>
        <h1 className="page-title">Listes d’armées</h1>
        <div className="empty-state">
          <h2>Aucune liste à relire pour l’instant</h2>
          <p>
            Ouvrez les inscriptions : chaque inscription pourra ensuite soumettre sa liste depuis
            l’application mobile EGIDE.
          </p>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <h1 className="page-title">Listes d’armées</h1>
        <div className="empty-state">
          <h2>Impossible de charger les listes.</h2>
          <button className="btn btn-secondary" onClick={refresh}>
            Réessayer
          </button>
        </div>
      </>
    );
  }

  const submittedCount = counts.all - counts.missing;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Listes d’armées</h1>
          <p className="page-subtitle">
            {formatEventDateShort(tournament.event_date)} · {tournament.city}
          </p>
        </div>
        <button
          className="btn btn-secondary"
          disabled={counts.missing === 0}
          onClick={copyMissing}>
          Copier les pseudos sans liste
        </button>
      </div>

      {readOnly ? (
        <div className="banner banner-info">
          🔒 Le tournoi est lancé : les soumissions sont closes. Les listes restent consultables.
        </div>
      ) : null}

      <div className="checkin-summary">
        <div>
          <div className="checkin-count">
            {counts.approved} / {counts.all}{' '}
            <span className="checkin-count-label">listes validées</span>
          </div>
          <div className="listes-status-line">
            {counts.todo === 0 && counts.rejected === 0 && counts.missing === 0 && counts.all > 0 ? (
              <span className="listes-all-done">Toutes les listes sont validées</span>
            ) : (
              <>
                {counts.todo} à relire · {counts.rejected} refusée
                {counts.rejected > 1 ? 's' : ''} · {counts.missing} sans liste
              </>
            )}
          </div>
          <div className="mini-gauge">
            <div
              className={`mini-gauge-fill present${counts.approved === counts.all && counts.all > 0 ? ' full' : ''}`}
              style={{
                width: `${counts.all ? Math.round((counts.approved / counts.all) * 100) : 0}%`,
              }}
            />
          </div>
        </div>
        <div className="checkin-toolbar">
          <input
            className="input checkin-search"
            type="search"
            placeholder="Rechercher un pseudo"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="segmented">
            <button
              className={activeFilter === 'todo' ? 'active' : ''}
              onClick={() => setFilter('todo')}>
              À relire ({counts.todo})
            </button>
            <button
              className={activeFilter === 'approved' ? 'active' : ''}
              onClick={() => setFilter('approved')}>
              Validées ({counts.approved})
            </button>
            <button
              className={activeFilter === 'rejected' ? 'active' : ''}
              onClick={() => setFilter('rejected')}>
              Refusées ({counts.rejected})
            </button>
            <button
              className={activeFilter === 'missing' ? 'active' : ''}
              onClick={() => setFilter('missing')}>
              Sans liste ({counts.missing})
            </button>
            <button
              className={activeFilter === 'all' ? 'active' : ''}
              onClick={() => setFilter('all')}>
              Toutes ({counts.all})
            </button>
          </div>
        </div>
      </div>

      {counts.all === 0 ? (
        <div className="empty-state">
          <h2>Aucune inscription</h2>
          <p>Les listes apparaîtront ici dès les premières inscriptions.</p>
        </div>
      ) : submittedCount === 0 && activeFilter !== 'missing' ? (
        <div className="banner banner-info" style={{ marginTop: 16 }}>
          Aucune liste soumise pour l’instant. Utilisez « Copier les pseudos sans liste » pour
          relancer via votre canal d’annonce.
        </div>
      ) : null}

      {visible.length === 0 && counts.all > 0 && !query ? (
        <div className="empty-state">
          <h2>
            {activeFilter === 'todo' ? 'Aucune liste à relire. Tout est à jour.' : 'Rien ici.'}
          </h2>
          <button className="btn btn-secondary" onClick={() => setFilter('all')}>
            Voir toutes les listes
          </button>
        </div>
      ) : visible.length === 0 && query ? (
        <div className="empty-state">
          <h2>Aucun résultat</h2>
          <p>Aucun pseudo ne correspond à « {search.trim()} ».</p>
        </div>
      ) : (
        <table className="table" style={{ marginTop: 16 }}>
          <thead>
            <tr>
              <th>Joueur</th>
              <th className="hide-narrow" style={{ width: 180 }}>
                Faction
              </th>
              <th style={{ width: 130 }}>Statut</th>
              <th className="hide-narrow" style={{ width: 150 }}>
                Soumise le
              </th>
              <th className="cell-actions" style={{ width: 120 }} />
            </tr>
          </thead>
          <tbody>
            {visible.map((entry) => {
              const approved = entry.list?.status === 'approved';
              return (
                <tr
                  key={entry.registrationId}
                  className={`${entry.list ? '' : 'row-muted'}${approved ? ' listes-row-approved' : ''}`}
                  onClick={() => openPanel(entry)}
                  style={entry.list ? { cursor: 'pointer' } : undefined}>
                  <td>
                    <div className="reg-cell">
                      <span className="reg-avatar">{entry.pseudo.charAt(0).toUpperCase()}</span>
                      <span className="cell-name">{entry.pseudo}</span>
                    </div>
                  </td>
                  <td className="hide-narrow">{entry.list?.faction ?? '—'}</td>
                  <td>{statusBadge(entry)}</td>
                  <td className="hide-narrow">
                    {entry.list ? shortDate(entry.list.submitted_at) : '—'}
                  </td>
                  <td className="cell-actions">
                    {entry.list ? (
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={(event) => {
                          event.stopPropagation();
                          openPanel(entry);
                        }}>
                        {entry.list.status === 'submitted' ? 'Relire' : 'Voir'}
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Panneau de relecture */}
      {openEntry?.list ? (
        <>
          <div className="drawer-veil" onClick={closePanel} />
          <aside className="drawer" role="dialog" aria-label={`Liste de ${openEntry.pseudo}`}>
            <div className="drawer-head">
              <div className="drawer-head-texts">
                <div className="drawer-title">
                  {openEntry.pseudo} {statusBadge(openEntry)}
                </div>
                <div className="drawer-subtitle">
                  {openEntry.list.faction ? `${openEntry.list.faction} · ` : ''}soumise le{' '}
                  {shortDate(openEntry.list.submitted_at)}
                </div>
              </div>
              <div className="drawer-head-actions">
                {openIndex > 0 ? (
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => openPanel(queue[openIndex - 1])}>
                    ◀
                  </button>
                ) : null}
                {openIndex >= 0 && openIndex < queue.length - 1 ? (
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => openPanel(queue[openIndex + 1])}>
                    ▶
                  </button>
                ) : null}
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={closePanel}
                  aria-label="Fermer">
                  ✕
                </button>
              </div>
            </div>

            <div className="drawer-body">
              <pre className="drawer-list">{openEntry.list.content}</pre>
            </div>

            <div className="drawer-foot">
              {readOnly ? null : openEntry.list.status === 'submitted' ? (
                rejecting ? (
                  <div className="drawer-reject">
                    <label className="drawer-reject-label" htmlFor="reject-comment">
                      Motif du refus — visible par la personne concernée
                    </label>
                    <textarea
                      id="reject-comment"
                      className="input drawer-reject-input"
                      rows={3}
                      placeholder="Ex. : 2 020 points au lieu de 2 000 — retirez ou remplacez une unité."
                      value={comment}
                      onChange={(event) => {
                        setComment(event.target.value);
                        setCommentError(false);
                      }}
                    />
                    {commentError ? (
                      <div className="field-error">
                        Un motif est obligatoire : il sera affiché dans l’application pour
                        permettre la correction.
                      </div>
                    ) : null}
                    <div className="drawer-actions">
                      <button
                        className="btn btn-danger"
                        disabled={busy || comment.trim() === ''}
                        onClick={() => reject(openEntry)}>
                        Confirmer le refus
                      </button>
                      <button
                        className="btn btn-secondary"
                        disabled={busy}
                        onClick={() => setRejecting(false)}>
                        Annuler
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="drawer-actions">
                    <button
                      className="btn btn-primary"
                      style={{ flex: 2 }}
                      disabled={busy}
                      onClick={() => approve(openEntry)}>
                      Valider la liste
                    </button>
                    <button
                      className="btn btn-danger-outline"
                      style={{ flex: 1 }}
                      disabled={busy}
                      onClick={() => setRejecting(true)}>
                      Refuser
                    </button>
                  </div>
                )
              ) : openEntry.list.status === 'approved' ? (
                <div className="drawer-decided">
                  <span className="listes-approved-line">
                    ✓ Validée{openEntry.list.reviewed_at ? ` le ${shortDate(openEntry.list.reviewed_at)}` : ''}.
                    La liste est figée côté joueur.
                  </span>
                  <button
                    className="btn btn-sm btn-secondary"
                    disabled={busy}
                    onClick={async () => {
                      const result = await reopen(openEntry.list!.id);
                      if (!result.ok) {
                        setToast({
                          message: 'Impossible d’enregistrer la décision. Vérifiez votre connexion.',
                          variant: 'danger',
                        });
                      }
                    }}>
                    Repasser en relecture
                  </button>
                </div>
              ) : (
                <div className="drawer-decided">
                  <div className="drawer-rejected-box">
                    Motif envoyé : « {openEntry.list.organizer_comment} »
                  </div>
                  <span className="drawer-rejected-hint">
                    En attente d’une correction. La liste redevient modifiable dans l’application.
                  </span>
                </div>
              )}
            </div>
          </aside>
        </>
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
