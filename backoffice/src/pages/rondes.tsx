import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { LaunchTournamentModal } from '../components/launch-tournament-modal';
import { Toast } from '../components/toast';
import type { TournamentWithCount } from '../hooks/use-my-tournaments';
import { useRegistrations } from '../hooks/use-registrations';
import { useRounds, type Pairing } from '../hooks/use-rounds';
import { formatEventDateShort } from '../lib/tournaments';

type Props = {
  tournament: TournamentWithCount | null;
  tournamentLoading: boolean;
  tournamentError: boolean;
  userId: string;
  onChanged: () => void;
};

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Cellule joueur : initiale, pseudo et faction. */
function PlayerCell({ player }: { player: { pseudo: string; faction_favorite: string | null } }) {
  return (
    <div className="reg-cell">
      <span className="reg-avatar">{player.pseudo.charAt(0).toUpperCase()}</span>
      <span>
        <span className="cell-name">{player.pseudo}</span>
        <br />
        <span className="checkin-meta">{player.faction_favorite ?? '—'}</span>
      </span>
    </div>
  );
}

export function RondesPage({
  tournament,
  tournamentLoading,
  tournamentError,
  userId,
  onChanged,
}: Props) {
  const { registered, loading: regLoading, refresh: refreshRegistrations } = useRegistrations(
    tournament?.id
  );
  const {
    rounds,
    pairings,
    currentRound,
    selectedNumber,
    setSelectedNumber,
    scored,
    loading,
    error,
    refresh,
  } = useRounds(tournament?.id);

  const [search, setSearch] = useState('');
  const [launchOpen, setLaunchOpen] = useState(false);
  const [projection, setProjection] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const presentCount = registered.filter((r) => r.status === 'checked_in').length;
  const absentNames = registered
    .filter((r) => r.status === 'registered')
    .map((r) => r.profile?.pseudo ?? 'Joueur');

  const filtered = useMemo(() => {
    const needle = normalize(search.trim());
    if (!needle) return pairings;
    return pairings.filter((p) => {
      const haystack = normalize(
        `${p.player_a?.pseudo ?? ''} ${p.player_b?.pseudo ?? ''} ${p.table_number}`
      );
      return haystack.includes(needle);
    });
  }, [pairings, search]);

  /** Phrase de réponse quand la recherche ne laisse qu'un appariement. */
  function answerFor(pairing: Pairing): string | null {
    const needle = normalize(search.trim());
    if (!needle) return null;
    const a = pairing.player_a?.pseudo ?? '';
    const b = pairing.player_b?.pseudo ?? '';
    if (!pairing.player_b) {
      return `${a} est exempt cette ronde (bye). Il ne joue pas.`;
    }
    // On nomme d'abord le joueur cherché.
    const asked = normalize(b).includes(needle) ? b : a;
    const other = asked === a ? b : a;
    return `${asked} joue à la table ${pairing.table_number}, contre ${other}.`;
  }

  if (tournamentLoading || loading || regLoading) {
    return (
      <>
        <h1 className="page-title">Rondes &amp; scores</h1>
        <div className="skeleton" style={{ height: 96, marginTop: 24 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 24 }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
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

  const header = (
    <div className="page-header">
      <div>
        <h1 className="page-title">Rondes &amp; scores</h1>
        <div className="page-subtitle">
          {formatEventDateShort(tournament.event_date)} · {tournament.city}
        </div>
      </div>
    </div>
  );

  if (tournament.status === 'draft') {
    return (
      <>
        {header}
        <div className="empty-state">
          <h2>Les rondes ne sont pas encore disponibles</h2>
          <p>
            Ce tournoi est en brouillon. Ouvrez les inscriptions, pointez les présents le jour J,
            puis lancez le tournoi pour générer la ronde 1.
          </p>
          <Link to={`/tournois/${tournament.id}`}>Retour au tournoi</Link>
        </div>
      </>
    );
  }

  if (tournament.status === 'cancelled') {
    return (
      <>
        {header}
        <div className="empty-state">
          <h2>Tournoi annulé</h2>
          <p>Ce tournoi a été annulé : aucune ronde ne sera générée.</p>
          <Link to={`/tournois/${tournament.id}`}>Retour au tournoi</Link>
        </div>
      </>
    );
  }

  // Avant lancement : la page propose de démarrer.
  if (tournament.status === 'open') {
    const fillPercent = registered.length
      ? Math.round((presentCount / registered.length) * 100)
      : 0;
    return (
      <>
        {header}
        <div className="empty-state">
          <h2>La ronde 1 n’est pas encore générée</h2>
          <p>
            Le tournoi démarre quand vous le lancez : les joueurs pointés présents seront appariés
            au hasard et les tables attribuées.
          </p>
        </div>
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-value">
              {presentCount} / {registered.length}
            </div>
            <div className="stat-label">joueurs pointés présents</div>
            <div className="mini-gauge">
              <div className="mini-gauge-fill present" style={{ width: `${fillPercent}%` }} />
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{tournament.rounds_count}</div>
            <div className="stat-label">
              rondes prévues · {tournament.points_limit} points
            </div>
          </div>
        </div>
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            className="btn btn-primary"
            style={{ alignSelf: 'flex-start', height: 48 }}
            disabled={presentCount < 2}
            onClick={() => setLaunchOpen(true)}>
            Lancer le tournoi
          </button>
          {presentCount < 2 ? (
            <div className="field-hint">Il faut au moins 2 joueurs pointés présents.</div>
          ) : null}
          <Link to={`/tournois/${tournament.id}/check-in`}>Aller au pointage →</Link>
        </div>

        {launchOpen ? (
          <LaunchTournamentModal
            tournamentId={tournament.id}
            presentCount={presentCount}
            absentNames={absentNames}
            cancelLabel="Annuler"
            onCancel={() => setLaunchOpen(false)}
            onLaunched={async () => {
              setLaunchOpen(false);
              onChanged();
              await Promise.all([refresh(), refreshRegistrations()]);
              setToast(
                `Tournoi lancé. Ronde 1 générée sur ${Math.floor(presentCount / 2)} tables.`
              );
            }}
          />
        ) : null}
        {toast ? <Toast message={toast} duration={6000} onDone={() => setToast(null)} /> : null}
      </>
    );
  }

  if (error) {
    return (
      <>
        {header}
        <div className="empty-state">
          <p>Impossible de charger les appariements.</p>
          <p>
            Vérifiez votre connexion : sans cette liste, impossible d’orienter les joueurs vers
            leur table.
          </p>
          <button className="btn btn-primary" onClick={refresh}>
            Réessayer
          </button>
        </div>
      </>
    );
  }

  const byePairing = pairings.find((p) => p.player_b === null) ?? null;
  const realTables = pairings.filter((p) => p.player_b !== null).length;
  const playersPaired = realTables * 2 + (byePairing ? 1 : 0);
  const singleAnswer = search.trim() !== '' && filtered.length === 1 ? answerFor(filtered[0]) : null;
  const discarded = registered.filter((r) => r.status === 'registered');

  return (
    <>
      {header}

      {tournament.status === 'completed' ? (
        <div className="banner banner-info" style={{ marginTop: 24, maxWidth: 640 }}>
          🔒 Ce tournoi est terminé : les rondes et les scores sont conservés en lecture seule.
        </div>
      ) : null}

      {/* Barre de rondes collante */}
      <div className="rounds-bar">
        <div className="rounds-tabs">
          <div className="segmented">
            {Array.from({ length: tournament.rounds_count }, (_, i) => i + 1).map((number) => {
              const generated = rounds.some((r) => r.number === number);
              return (
                <button
                  key={number}
                  type="button"
                  className={selectedNumber === number ? 'active' : ''}
                  disabled={!generated}
                  title={
                    generated
                      ? undefined
                      : 'Cette ronde sera générée à la fin de la ronde précédente.'
                  }
                  onClick={() => setSelectedNumber(number)}>
                  Ronde {number}
                </button>
              );
            })}
          </div>
        </div>

        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-value">{realTables}</div>
            <div className="stat-label">tables</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{playersPaired}</div>
            <div className="stat-label">joueurs appariés</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">
              {scored} / {pairings.length}
            </div>
            <div className="stat-label">scores saisis</div>
            <div className="mini-gauge">
              <div
                className="mini-gauge-fill"
                style={{
                  width: `${pairings.length ? Math.round((scored / pairings.length) * 100) : 0}%`,
                }}
              />
            </div>
          </div>
        </div>

        <div className="checkin-toolbar">
          <input
            type="search"
            autoComplete="off"
            className="input input-lg"
            placeholder="Rechercher un joueur ou un numéro de table"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setSearch('');
            }}
          />
          <button className="btn btn-secondary" onClick={() => setProjection(true)}>
            Affichage projection
          </button>
        </div>
      </div>

      {singleAnswer ? <div className="pairing-answer">{singleAnswer}</div> : null}

      {byePairing && search.trim() === '' ? (
        <div className="banner banner-info" style={{ margin: '16px 0', maxWidth: 640 }}>
          Nombre impair de présents : {byePairing.player_a?.pseudo} est exempt à la ronde{' '}
          {selectedNumber} (bye). Sa victoire est déjà enregistrée : 15 – 5. Ce n’est pas une
          erreur, aucun score n’est à saisir pour lui.
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="empty-state" style={{ padding: 24 }}>
          {search.trim() !== '' ? (
            <>
              <p>Aucun joueur ne correspond à « {search} ».</p>
              <button className="btn btn-secondary" onClick={() => setSearch('')}>
                Effacer la recherche
              </button>
            </>
          ) : (
            <>
              <p>Aucun appariement pour cette ronde.</p>
              <button className="btn btn-secondary" onClick={refresh}>
                Réessayer
              </button>
            </>
          )}
        </div>
      ) : (
        <table className="table table-static table-lg">
          <thead>
            <tr>
              <th style={{ width: 72 }}>Table</th>
              <th>Joueur A</th>
              <th>Joueur B</th>
              <th className="hide-narrow cell-actions" style={{ width: 120 }}>
                Score
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((pairing) => {
              const isBye = pairing.player_b === null;
              return (
                <tr key={pairing.id} className={isBye ? 'pairing-row-bye' : ''}>
                  <td>
                    {isBye ? (
                      <span className="checkin-meta">—</span>
                    ) : (
                      <span className="pairing-table-no">{pairing.table_number}</span>
                    )}
                  </td>
                  <td>{pairing.player_a ? <PlayerCell player={pairing.player_a} /> : '—'}</td>
                  <td>
                    {isBye ? (
                      <span className="badge badge-bye">Exempt (bye)</span>
                    ) : (
                      <PlayerCell player={pairing.player_b!} />
                    )}
                  </td>
                  <td className="hide-narrow cell-actions">
                    {pairing.score_a !== null && pairing.score_b !== null ? (
                      <>
                        <span className="score-auto">
                          {pairing.score_a} – {pairing.score_b}
                        </span>
                        {isBye ? (
                          <>
                            <br />
                            <span className="checkin-meta">Attribué automatiquement</span>
                          </>
                        ) : null}
                      </>
                    ) : (
                      <span className="score-pending">— · —</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Suite du tournoi : place réservée aux US suivantes */}
      {tournament.status !== 'completed' ? (
        <div className="checkin-launch">
          <div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>Ronde {selectedNumber} en cours</div>
            <p style={{ margin: '4px 0 0' }}>
              Quand les {realTables} table{realTables > 1 ? 's' : ''} auront un score, vous pourrez
              clôturer la ronde et générer la ronde {(selectedNumber ?? 1) + 1}.
            </p>
            <div className="field-hint" style={{ marginTop: 8 }}>
              La saisie des scores, le classement et les abandons arrivent dans une prochaine mise
              à jour.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="btn btn-secondary" disabled title="Disponible prochainement">
              Saisir les scores
            </button>
            <span className="badge-soon">Bientôt</span>
          </div>
        </div>
      ) : null}

      {discarded.length > 0 ? (
        <details className="details-section">
          <summary>Joueurs non pointés, écartés du tournoi ({discarded.length})</summary>
          <p style={{ marginTop: 16 }}>
            Ces joueurs n’ont pas été pointés présents avant le lancement. Ils ne participent à
            aucune ronde.
          </p>
          <table className="table table-static">
            <thead>
              <tr>
                <th>Joueur</th>
                <th className="hide-narrow" style={{ width: 200 }}>
                  Faction
                </th>
              </tr>
            </thead>
            <tbody>
              {discarded.map((registration) => (
                <tr key={registration.id}>
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

      {/* Affichage projection */}
      {projection ? (
        <div
          className="projection-overlay"
          role="dialog"
          aria-label="Affichage projection"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setProjection(false);
          }}>
          <div className="projection-head">
            <div>
              <div className="projection-title">{tournament.name}</div>
              <div className="projection-round">
                Ronde {selectedNumber} sur {tournament.rounds_count}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => window.print()}>
                Imprimer
              </button>
              <button className="btn btn-secondary" autoFocus onClick={() => setProjection(false)}>
                Fermer
              </button>
            </div>
          </div>
          <div className="projection-grid">
            {pairings
              .filter((p) => p.player_b !== null)
              .map((pairing) => (
                <div key={pairing.id} className="projection-item">
                  <span className="projection-table-no">{pairing.table_number}</span>
                  <span className="projection-player">
                    {pairing.player_a?.pseudo}{' '}
                    <span className="projection-versus">contre</span>{' '}
                    {pairing.player_b?.pseudo}
                  </span>
                </div>
              ))}
            {byePairing ? (
              <div className="projection-bye">
                Exempt (bye) : {byePairing.player_a?.pseudo} — victoire 15 – 5
              </div>
            ) : null}
          </div>
          <div className="projection-foot">
            Appariements générés le{' '}
            {currentRound
              ? new Date(currentRound.created_at).toLocaleString('fr-FR', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })
              : '—'}
          </div>
        </div>
      ) : null}

      {toast ? <Toast message={toast} duration={6000} onDone={() => setToast(null)} /> : null}
    </>
  );
}
