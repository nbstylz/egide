import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { supabase } from '../lib/supabase';

import { CloseRoundModal, type CloseResult } from '../components/close-round-modal';
import { CompleteTournamentModal } from '../components/complete-tournament-modal';
import { DropPlayerModal } from '../components/drop-player-modal';
import { LaunchTournamentModal } from '../components/launch-tournament-modal';
import { Toast } from '../components/toast';
import type { TournamentWithCount } from '../hooks/use-my-tournaments';
import { useRegistrations, type Registration } from '../hooks/use-registrations';
import { useStandings } from '../hooks/use-standings';
import { useRounds, type Pairing } from '../hooks/use-rounds';
import {
  hasTactics,
  isDraftScored,
  tacticsVerdictFor,
  useScoreEntry,
  verdictFor,
  type Draft,
  type Side,
} from '../hooks/use-score-entry';
import { formatEventDateShort } from '../lib/tournaments';

type ScoreFilter = 'all' | 'todo' | 'done' | 'no-tactics';

const EmptyDraft: Draft = { a: '', b: '', ta: '', tb: '' };

type ToastState = {
  message: string;
  variant?: 'success' | 'danger';
  action?: { label: string; onPress: () => void };
};

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

const isRealTable = (p: Pairing) => p.player_b !== null;

/** Cellule joueur : initiale, pseudo et faction. */
function PlayerCell({
  player,
  won,
}: {
  player: { pseudo: string; faction_favorite: string | null };
  won?: boolean;
}) {
  return (
    <div className={`reg-cell${won ? ' player-win' : ''}`}>
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
    loading,
    error,
    refresh,
    setScenario,
    setScenarioForRound,
  } = useRounds(tournament?.id);
  const { standings, refresh: refreshStandings } = useStandings(tournament?.id);
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>('all');
  const [keptIds, setKeptIds] = useState<Set<string>>(new Set());
  const [launchOpen, setLaunchOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [dropTarget, setDropTarget] = useState<Registration | null>(null);
  const [completeOpen, setCompleteOpen] = useState(false);
  /** Tables rejouant un affrontement déjà disputé, après un repli assumé. */
  const [rematchTables, setRematchTables] = useState<number[]>([]);
  const [justGenerated, setJustGenerated] = useState<number | null>(null);
  const [projection, setProjection] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const autoFocusedRound = useRef<string | null>(null);
  /** Champ à atteindre après le prochain rendu (l'enregistrement recharge la liste). */
  const pendingFocus = useRef<{ id: string; side: Side } | null>(null);

  /**
   * Les tactiques ne servent qu'au 3e départage : on ne les impose pas.
   * Le choix est mémorisé par tournoi.
   */
  const tacticsKey = tournament ? `egide.tactics.${tournament.id}` : null;
  const [tacticsMode, setTacticsMode] = useState(false);
  useEffect(() => {
    if (!tacticsKey) return;
    setTacticsMode(localStorage.getItem(tacticsKey) === '1');
  }, [tacticsKey]);
  function toggleTacticsMode(next: boolean) {
    setTacticsMode(next);
    if (tacticsKey) localStorage.setItem(tacticsKey, next ? '1' : '0');
  }

  /**
   * Le scénario reste corrigeable sur toutes les rondes tant que le tournoi
   * n'est pas terminé : il est souvent annoncé après la génération.
   */
  const [scenarioDraft, setScenarioDraft] = useState('');
  const [scenarioSaved, setScenarioSaved] = useState(false);

  const lastRoundNumber = rounds.length > 0 ? rounds[rounds.length - 1].number : null;
  const selectedRound = rounds.find((r) => r.number === selectedNumber) ?? null;
  // Une ronde close est figée, qu'une autre l'ait suivie ou non.
  const editable =
    tournament?.status === 'in_progress' &&
    selectedNumber === lastRoundNumber &&
    selectedRound?.status !== 'completed';
  const scenarioEditable = tournament?.status === 'in_progress' && selectedRound !== null;

  /**
   * On repart du scénario enregistré au changement de ronde — et à ce
   * moment-là seulement. Réagir aussi au `scenario` effacerait le « Enregistré »
   * dans la foulée de chaque sauvegarde, puisque c'est elle qui le fait changer.
   */
  useEffect(() => {
    setScenarioDraft(selectedRound?.scenario ?? '');
    setScenarioSaved(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRound?.id]);

  async function commitScenario() {
    if (!selectedRound) return;
    if (scenarioDraft.trim() === (selectedRound.scenario ?? '')) return;
    const result = await setScenario(selectedRound.id, scenarioDraft);
    if (result.ok) {
      setScenarioSaved(true);
    } else {
      setScenarioDraft(selectedRound.scenario ?? '');
      setToast({ message: `Scénario non enregistré : ${result.message}`, variant: 'danger' });
    }
  }

  const {
    drafts,
    saved,
    busyIds,
    failedIds,
    touchedIds,
    setField,
    commit,
    restore,
    flush,
    markTouched,
    focusField,
    registerInput,
  } = useScoreEntry({
    pairings,
    editable,
    onSaved: (pairing, previous, next, wasFilled) => {
      if (wasFilled) {
        const tactiques = hasTactics(next) ? `, tactiques ${next.ta} · ${next.tb}` : '';
        setToast({
          message: `Table ${pairing.table_number} corrigée : ${next.a} – ${next.b}${tactiques}.`,
          action: { label: 'Annuler', onPress: () => restore(pairing, previous) },
        });
      }
      // Pas de rechargement ici : l'état confirmé suffit, et recharger
      // ferait clignoter le tableau en pleine saisie.
    },
    onFailed: (pairing, retry) => {
      setToast({
        message: `Score de la table ${pairing.table_number} non enregistré. Vérifiez votre connexion.`,
        variant: 'danger',
        action: { label: 'Réessayer', onPress: retry },
      });
    },
  });

  /** Une table est saisie quand ses deux scores sont confirmés côté serveur. */
  const isScored = (p: Pairing) => isDraftScored(saved[p.id]);
  /** Tactiques complètes : les deux joueurs renseignés. */
  const isTacticsDone = (p: Pairing) => hasTactics(saved[p.id]);
  const realTables = pairings.filter(isRealTable);
  const scoredTables = realTables.filter(isScored);
  const todoTables = realTables.filter((p) => !isScored(p));
  // Tables dont le score est saisi mais dont les tactiques manquent.
  const noTacticsTables = scoredTables.filter((p) => !isTacticsDone(p));
  const tacticsDoneTables = scoredTables.filter(isTacticsDone);
  const byePairing = pairings.find((p) => !isRealTable(p)) ?? null;

  // Au premier affichage d'une ronde modifiable, on se place sur la première
  // table sans score : l'organisateur peut saisir sans toucher la souris.
  useEffect(() => {
    if (!editable || !currentRound) return;
    if (autoFocusedRound.current === currentRound.id) return;
    // Tant que les scores connus ne sont pas chargés, toutes les tables
    // paraissent vides : on se poserait sur une table déjà saisie.
    if (pairings.length > 0 && Object.keys(saved).length === 0) return;
    const first = pairings.find((p) => isRealTable(p) && !isScored(p));
    if (first) {
      autoFocusedRound.current = currentRound.id;
      focusField(first.id, 'a');
    }
  }, [editable, currentRound, pairings, focusField]);

  // Repose le focus demandé une fois la liste rechargée.
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    focusField(target.id, target.side);
  });

  const filtered = useMemo(() => {
    const needle = normalize(search.trim());
    return pairings.filter((pairing) => {
      if (needle) {
        const haystack = normalize(
          `${pairing.player_a?.pseudo ?? ''} ${pairing.player_b?.pseudo ?? ''} ${pairing.table_number}`
        );
        if (!haystack.includes(needle)) return false;
      }
      if (scoreFilter === 'all') return true;
      // Le bye n'est ni à saisir ni saisi par l'organisateur.
      if (!isRealTable(pairing)) return scoreFilter === 'done';
      if (keptIds.has(pairing.id)) return true;
      if (scoreFilter === 'todo') return !isScored(pairing);
      if (scoreFilter === 'no-tactics') return isScored(pairing) && !isTacticsDone(pairing);
      return isScored(pairing);
    });
  }, [pairings, search, scoreFilter, keptIds, saved]);

  /**
   * Répartition des joueurs par nombre de victoires après cette ronde.
   * Sert à annoncer les groupes de score dans la confirmation de clôture.
   */
  const winGroups = useMemo(() => {
    const tally = new Map<string, number>();
    const add = (pseudo: string, value: number) =>
      tally.set(pseudo, (tally.get(pseudo) ?? 0) + value);
    for (const pairing of pairings) {
      const a = pairing.player_a?.pseudo;
      const b = pairing.player_b?.pseudo;
      if (!a) continue;
      if (!b) {
        add(a, 1);
        continue;
      }
      const scoreA = pairing.score_a ?? 0;
      const scoreB = pairing.score_b ?? 0;
      if (scoreA === scoreB) {
        add(a, 0.5);
        add(b, 0.5);
      } else if (scoreA > scoreB) {
        add(a, 1);
        add(b, 0);
      } else {
        add(a, 0);
        add(b, 1);
      }
    }
    const counts = new Map<number, number>();
    for (const wins of tally.values()) {
      counts.set(wins, (counts.get(wins) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([wins, count]) => ({ wins, count }))
      .sort((x, y) => y.wins - x.wins);
  }, [pairings]);

  function clearKept() {
    if (keptIds.size > 0) setKeptIds(new Set());
  }

  /**
   * Table suivante encore à saisir, en repartant du haut au besoin.
   * Le focus est demandé pour après le rendu : l'enregistrement recharge la
   * liste, ce qui effacerait un focus posé tout de suite.
   */
  function queueNextTodo(fromId: string) {
    const order = pairings.filter(isRealTable);
    const start = order.findIndex((p) => p.id === fromId);
    for (let step = 1; step <= order.length; step += 1) {
      const candidate = order[(start + step) % order.length];
      const draft = drafts[candidate.id];
      if (!draft || candidate.id === fromId) continue;

      // Les points d'abord ; en mode tactiques, on enchaîne aussi sur les
      // tables dont il ne manque plus que les tactiques.
      const pointsManquants = draft.a === '' || draft.b === '';
      const tactiquesManquantes = tacticsMode && (draft.ta === '' || draft.tb === '');
      if (!pointsManquants && !tactiquesManquantes) continue;

      const side: Side = pointsManquants ? 'a' : 'ta';
      pendingFocus.current = { id: candidate.id, side };
      focusField(candidate.id, side);
      return;
    }
    setToast({
      message: tacticsMode
        ? 'Toutes les tables sont saisies, tactiques comprises.'
        : 'Toutes les tables sont saisies.',
      variant: 'success',
    });
  }

  /**
   * On n'enregistre que si le focus quitte réellement la ligne. Le repère est
   * l'identifiant de l'appariement, et non le libellé : « table 1 » se
   * retrouvait dans « table 12 ».
   */
  function onFieldBlur(event: React.FocusEvent<HTMLInputElement>, pairing: Pairing) {
    markTouched(pairing.id);
    const next = event.relatedTarget as HTMLElement | null;
    if (next?.getAttribute('data-pairing') === pairing.id) return;
    commit(pairing);
  }

  /** Valide la ligne et enchaîne sur la table suivante à saisir. */
  function validateRow(pairing: Pairing) {
    markTouched(pairing.id);
    commit(pairing);
    if (scoreFilter !== 'all') {
      setKeptIds((current) => new Set(current).add(pairing.id));
    }
    queueNextTodo(pairing.id);
  }

  /** Échap : la ligne reprend les valeurs enregistrées. */
  function resetRow(pairing: Pairing) {
    setField(pairing.id, 'a', String(pairing.score_a ?? ''));
    setField(pairing.id, 'b', String(pairing.score_b ?? ''));
    setField(pairing.id, 'ta', String(pairing.tactics_a ?? ''));
    setField(pairing.id, 'tb', String(pairing.tactics_b ?? ''));
  }

  /** Flèches haut/bas : même colonne, ligne voisine. */
  function focusNeighbour(fromId: string, side: Side, direction: -1 | 1) {
    const order = pairings.filter(isRealTable);
    const index = order.findIndex((p) => p.id === fromId);
    const target = order[index + direction];
    if (target) focusField(target.id, side);
  }

  if (tournamentLoading || loading || regLoading) {
    return (
      <>
        <h1 className="page-title">Rondes &amp; scores</h1>
        <div className="skeleton" style={{ height: 96, marginTop: 24 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 24 }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="skeleton" style={{ height: 72 }} />
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
    const presentCount = registered.filter((r) => r.status === 'checked_in').length;
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
            <div className="stat-label">rondes prévues · {tournament.points_limit} points</div>
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
            absentNames={registered
              .filter((r) => r.status === 'registered')
              .map((r) => r.profile?.pseudo ?? 'Joueur')}
            cancelLabel="Annuler"
            onCancel={() => setLaunchOpen(false)}
            onLaunched={async (scenario: string) => {
              setLaunchOpen(false);
              onChanged();
              const applied = await setScenarioForRound(1, scenario);
              await Promise.all([refresh(), refreshRegistrations()]);
              setToast({
                message: `Tournoi lancé. Ronde 1 générée sur ${Math.floor(presentCount / 2)} tables.${
                  applied.ok ? '' : ' Le scénario n’a pas été enregistré : saisis-le sur la page.'
                }`,
                variant: applied.ok ? undefined : 'danger',
              });
            }}
          />
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

  /** Réponse directe quand la recherche ne laisse qu'un appariement. */
  function answerFor(pairing: Pairing): string {
    const needle = normalize(search.trim());
    const a = pairing.player_a?.pseudo ?? '';
    const b = pairing.player_b?.pseudo ?? '';
    if (!pairing.player_b) return `${a} a le bye cette ronde : pas de table.`;
    const asked = normalize(b).includes(needle) ? b : a;
    const other = asked === a ? b : a;
    return `${asked} joue à la table ${pairing.table_number}, contre ${other}.`;
  }

  const singleAnswer = search.trim() !== '' && filtered.length === 1 ? answerFor(filtered[0]) : null;
  const discarded = registered.filter((r) => r.status === 'registered');
  const allScored = todoTables.length === 0 && realTables.length > 0;
  const isLastRound = selectedNumber === tournament.rounds_count;
  const allRoundsPlayed =
    rounds.length >= tournament.rounds_count &&
    rounds.every((round) => round.status === 'completed');
  /** Joueurs encore en lice : les abandons ne sont plus appariés. */
  const inPlay = registered.filter((r) => r.status === 'checked_in');
  const droppedPlayers = registered.filter((r) => r.status === 'dropped');
  const playersLeft = inPlay.length;

  /** Table d'un joueur dans la ronde affichée, s'il en a une. */
  function pairingOf(playerId: string): Pairing | null {
    return (
      pairings.find((p) => p.player_a_id === playerId || p.player_b_id === playerId) ?? null
    );
  }
  const keptVisible = [...keptIds].filter((id) => realTables.some((p) => p.id === id)).length;

  /** Hint sous la recherche : ce que fera la touche Entrée. */
  let searchHint = '';
  if (search.trim() !== '' && filtered.length === 1) {
    const only = filtered[0];
    if (!isRealTable(only)) {
      searchHint = `${only.player_a?.pseudo} est exempt, aucun score à saisir`;
    } else if (editable) {
      searchHint = isScored(only)
        ? `Entrée pour corriger la table ${only.table_number}`
        : `Entrée pour saisir la table ${only.table_number}`;
    }
  } else if (search.trim() !== '' && filtered.length > 1) {
    searchHint = `${filtered.length} tables correspondent, précisez`;
  }

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
              const round = rounds.find((r) => r.number === number);
              const generated = Boolean(round);
              const closed = round?.status === 'completed';
              return (
                <button
                  key={number}
                  type="button"
                  className={[selectedNumber === number ? 'active' : '', closed ? 'done' : '']
                    .filter(Boolean)
                    .join(' ')}
                  disabled={!generated}
                  title={
                    generated
                      ? undefined
                      : 'Cette ronde sera générée à la fin de la ronde précédente.'
                  }
                  onClick={async () => {
                    await flush();
                    clearKept();
                    setSelectedNumber(number);
                  }}>
                  Ronde {number}
                  {closed ? ' ✓' : ''}
                </button>
              );
            })}
          </div>
        </div>

        {selectedRound ? (
          <div className="scenario-row">
            <label className="scenario-label" htmlFor="scenario">
              Scénario
            </label>
            {scenarioEditable ? (
              <>
                <input
                  id="scenario"
                  className="scenario-input"
                  type="text"
                  maxLength={80}
                  placeholder="Facultatif — ex. Focal Points"
                  value={scenarioDraft}
                  onChange={(event) => {
                    setScenarioDraft(event.target.value);
                    setScenarioSaved(false);
                  }}
                  onBlur={commitScenario}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                    if (event.key === 'Escape') {
                      setScenarioDraft(selectedRound.scenario ?? '');
                      event.currentTarget.blur();
                    }
                  }}
                />
                <span className="scenario-hint" aria-live="polite">
                  {scenarioSaved ? 'Enregistré' : 'Visible par les joueurs dans l’app'}
                </span>
              </>
            ) : (
              <span className="scenario-readonly">
                {selectedRound.scenario ?? 'Non renseigné'}
              </span>
            )}
          </div>
        ) : null}

        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-value">{realTables.length}</div>
            <div className="stat-label">tables</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{realTables.length * 2 + (byePairing ? 1 : 0)}</div>
            <div className="stat-label">joueurs appariés</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">
              {scoredTables.length} / {realTables.length}
            </div>
            <div className="stat-label">tables saisies</div>
            <div className="mini-gauge">
              <div
                className={`mini-gauge-fill${allScored ? ' full' : ''}`}
                style={{
                  width: `${realTables.length ? Math.round((scoredTables.length / realTables.length) * 100) : 0}%`,
                }}
              />
            </div>
            <div
              className="stat-label"
              aria-live="polite"
              style={allScored ? { color: 'var(--success)' } : undefined}>
              {allScored
                ? 'Toutes les tables sont saisies'
                : `${todoTables.length} table${todoTables.length > 1 ? 's' : ''} reste${todoTables.length > 1 ? 'nt' : ''} à saisir`}
            </div>
            {tacticsMode ? (
              <div className="stat-label">
                Tactiques : {tacticsDoneTables.length} / {realTables.length} tables
              </div>
            ) : null}
          </div>
        </div>

        <div className="checkin-toolbar">
          <div style={{ flex: 1, minWidth: 280 }}>
            <input
              ref={searchRef}
              type="search"
              autoComplete="off"
              className="input input-lg"
              style={{ width: '100%' }}
              placeholder="Rechercher un joueur ou un numéro de table"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setSearch('');
                if (event.key === 'Enter' && filtered.length === 1 && editable) {
                  const only = filtered[0];
                  if (isRealTable(only)) {
                    event.preventDefault();
                    focusField(only.id, 'a');
                  }
                }
              }}
            />
            {searchHint ? (
              <div className="field-hint" style={{ marginTop: 4 }}>
                {searchHint}
              </div>
            ) : null}
          </div>

          {editable ? (
            <div className="segmented" style={{ alignSelf: 'flex-start' }}>
              <button
                type="button"
                className={scoreFilter === 'all' ? 'active' : ''}
                onClick={() => {
                  setScoreFilter('all');
                  clearKept();
                }}>
                Toutes ({realTables.length})
              </button>
              <button
                type="button"
                className={scoreFilter === 'todo' ? 'active' : ''}
                onClick={() => {
                  setScoreFilter('todo');
                  clearKept();
                }}>
                À saisir ({todoTables.length})
              </button>
              <button
                type="button"
                className={scoreFilter === 'done' ? 'active' : ''}
                onClick={() => {
                  setScoreFilter('done');
                  clearKept();
                }}>
                Saisies ({scoredTables.length})
              </button>
              {tacticsMode ? (
                <button
                  type="button"
                  className={scoreFilter === 'no-tactics' ? 'active' : ''}
                  onClick={() => {
                    setScoreFilter('no-tactics');
                    clearKept();
                  }}>
                  Sans tactiques ({noTacticsTables.length})
                </button>
              ) : null}
            </div>
          ) : null}

          {editable ? (
            <label className="toolbar-toggle" title="Départage n° 3 du classement. Décochez pour saisir uniquement les points.">
              <input
                type="checkbox"
                checked={tacticsMode}
                onChange={(event) => toggleTacticsMode(event.target.checked)}
              />
              Saisir les tactiques
            </label>
          ) : null}

          <button className="btn btn-secondary" onClick={() => setProjection(true)}>
            Affichage projection
          </button>
        </div>
      </div>

      {singleAnswer ? <div className="pairing-answer">{singleAnswer}</div> : null}

      {!editable && tournament.status !== 'completed' && currentRound ? (
        <div className="banner banner-info" style={{ margin: '16px 0', maxWidth: 640 }}>
          🔒 Ronde {selectedNumber} clôturée : les scores ne sont plus modifiables. La ronde{' '}
          {(selectedNumber ?? 1) + 1} a été générée à partir de ces résultats.
        </div>
      ) : null}

      {justGenerated === selectedNumber && rematchTables.length === 0 ? (
        <div className="banner banner-info" style={{ margin: '16px 0', maxWidth: 640 }}>
          Ronde {selectedNumber} générée. Appariements par groupe de score, aucun match retour.{' '}
          <button
            className="rank-toggle"
            style={{ color: 'var(--accent)' }}
            onClick={() => setSelectedNumber((selectedNumber ?? 2) - 1)}>
            Revoir la ronde {(selectedNumber ?? 2) - 1} →
          </button>
        </div>
      ) : null}

      {rematchTables.length > 0 && justGenerated === selectedNumber ? (
        <div
          className="banner banner-info banner-info-danger"
          style={{ margin: '16px 0', maxWidth: 640 }}>
          {rematchTables.length} table{rematchTables.length > 1 ? 's' : ''} rejoue
          {rematchTables.length > 1 ? 'nt' : ''} un affrontement déjà disputé : aucun autre
          appariement n’était possible.
        </div>
      ) : null}

      {byePairing && search.trim() === '' && scoreFilter !== 'todo' ? (
        <div className="banner banner-info" style={{ margin: '16px 0', maxWidth: 640 }}>
          Nombre impair de présents : {byePairing.player_a?.pseudo} a le bye à la ronde{' '}
          {selectedNumber}. La victoire est déjà enregistrée : 15 – 5
          {tacticsMode ? `, avec ${byePairing.tactics_a ?? 3} tactiques` : ''}. Ce n’est pas une
          erreur : il n’y a aucun score à saisir sur cette ligne.
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
          ) : scoreFilter === 'todo' ? (
            <>
              <p>Toutes les tables ont un score.</p>
              <button className="btn btn-secondary" onClick={() => setScoreFilter('all')}>
                Voir toutes les tables
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
              <th style={{ width: 200 }}>Score</th>
              {tacticsMode ? <th style={{ width: 140 }}>Tactiques</th> : null}
            </tr>
          </thead>
          <tbody>
            {filtered.map((pairing) => {
              const bye = !isRealTable(pairing);
              const draft: Draft = drafts[pairing.id] ?? EmptyDraft;
              const verdict = verdictFor(pairing, draft, touchedIds.has(pairing.id));
              const tacVerdict = tacticsVerdictFor(pairing, draft, touchedIds.has(pairing.id));
              const scored = isScored(pairing);

              const rowClass = [
                bye ? 'pairing-row-bye' : '',
                !bye && scored ? 'score-row-done' : '',
                busyIds.has(pairing.id) ? 'score-row-busy' : '',
                failedIds.has(pairing.id) ? 'score-row-failed' : '',
              ]
                .filter(Boolean)
                .join(' ');

              const winner = verdict.kind === 'win' ? verdict.winner : null;

              return (
                <tr key={pairing.id} className={rowClass}>
                  <td>
                    {bye ? (
                      <span className="checkin-meta">—</span>
                    ) : (
                      <>
                        <span className="pairing-table-no">{pairing.table_number}</span>
                        {rematchTables.includes(pairing.table_number) ? (
                          <div className="badge badge-rematch">Match retour</div>
                        ) : null}
                      </>
                    )}
                  </td>
                  <td>
                    {pairing.player_a ? (
                      <PlayerCell player={pairing.player_a} won={winner === 'a'} />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {bye ? (
                      <span className="badge badge-bye">Exempt (bye)</span>
                    ) : (
                      <PlayerCell player={pairing.player_b!} won={winner === 'b'} />
                    )}
                  </td>
                  <td className="cell-score">
                    {bye ? (
                      <>
                        <span className="score-auto">
                          {pairing.score_a} – {pairing.score_b}
                        </span>
                        <div className="checkin-meta">Attribué automatiquement</div>
                      </>
                    ) : editable ? (
                      <>
                        <div className="score-inputs">
                          {(['a', 'b'] as const).map((side) => (
                            <span key={side} style={{ display: 'contents' }}>
                              {side === 'b' ? <span className="score-dash">–</span> : null}
                              <input
                                ref={(element) => registerInput(`${pairing.id}-${side}`, element)}
                                className={[
                                  'score-input',
                                  winner === side ? 'win' : '',
                                  verdict.kind === 'unusual' ? 'warn' : '',
                                  verdict.kind === 'missing' && verdict.side === side
                                    ? 'missing'
                                    : '',
                                ]
                                  .filter(Boolean)
                                  .join(' ')}
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={3}
                                autoComplete="off"
                                data-pairing={pairing.id}
                                aria-label={`Points de ${
                                  side === 'a'
                                    ? (pairing.player_a?.pseudo ?? 'joueur A')
                                    : (pairing.player_b?.pseudo ?? 'joueur B')
                                }, table ${pairing.table_number}`}
                                value={draft[side]}
                                onFocus={(event) => event.target.select()}
                                onChange={(event) => setField(pairing.id, side, event.target.value)}
                                onBlur={(event) => onFieldBlur(event, pairing)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    event.preventDefault();
                                    if (side === 'a') {
                                      focusField(pairing.id, 'b');
                                    } else if (tacticsMode && !event.shiftKey) {
                                      // Depuis les points B, on passe aux tactiques ;
                                      // Maj+Entrée les saute pour aller plus vite.
                                      focusField(pairing.id, 'ta');
                                    } else {
                                      validateRow(pairing);
                                    }
                                  }
                                  if (event.key === 'Escape') {
                                    event.preventDefault();
                                    resetRow(pairing);
                                    (event.target as HTMLInputElement).blur();
                                  }
                                  if (event.key === 'ArrowDown') {
                                    event.preventDefault();
                                    focusNeighbour(pairing.id, side, 1);
                                  }
                                  if (event.key === 'ArrowUp') {
                                    event.preventDefault();
                                    focusNeighbour(pairing.id, side, -1);
                                  }
                                }}
                              />
                            </span>
                          ))}
                        </div>
                        <div
                          className={`score-verdict${
                            verdict.kind === 'draw'
                              ? ' draw'
                              : verdict.kind === 'missing' || verdict.kind === 'unusual'
                                ? ' warn'
                                : ''
                          }`}>
                          {verdict.kind === 'win'
                            ? `Victoire ${verdict.pseudo}`
                            : verdict.kind === 'draw'
                              ? 'Égalité'
                              : verdict.kind === 'missing'
                                ? `Saisissez aussi les points de ${verdict.pseudo}.`
                                : verdict.kind === 'unusual'
                                  ? 'Score inhabituel (au-delà de 80). Vérifiez la feuille.'
                                  : ' '}
                        </div>
                      </>
                    ) : scored ? (
                      <>
                        <span className="score-auto">
                          {pairing.score_a} – {pairing.score_b}
                        </span>
                        <div className="checkin-meta">
                          {pairing.score_a === pairing.score_b
                            ? 'Égalité'
                            : `Victoire ${
                                (pairing.score_a ?? 0) > (pairing.score_b ?? 0)
                                  ? pairing.player_a?.pseudo
                                  : pairing.player_b?.pseudo
                              }`}
                        </div>
                      </>
                    ) : (
                      <span className="score-pending">— · —</span>
                    )}
                  </td>

                  {tacticsMode ? (
                    <td className="cell-tactics">
                      {bye ? (
                        <>
                          <span className="score-auto">{pairing.tactics_a ?? 3} · —</span>
                          <div className="checkin-meta">Attribué automatiquement</div>
                        </>
                      ) : editable ? (
                        <>
                          <div className="tac-inputs">
                            {(['ta', 'tb'] as const).map((side) => (
                              <span key={side} style={{ display: 'contents' }}>
                                {side === 'tb' ? <span className="tac-dot">·</span> : null}
                                <input
                                  ref={(element) =>
                                    registerInput(`${pairing.id}-${side}`, element)
                                  }
                                  className={[
                                    'tac-input',
                                    tacVerdict.kind === 'unusual' && tacVerdict.side === side
                                      ? 'warn'
                                      : '',
                                    tacVerdict.kind === 'missing' && tacVerdict.side === side
                                      ? 'missing'
                                      : '',
                                  ]
                                    .filter(Boolean)
                                    .join(' ')}
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  maxLength={1}
                                  placeholder="–"
                                  autoComplete="off"
                                  data-pairing={pairing.id}
                                  aria-label={`Tactiques de ${
                                    side === 'ta'
                                      ? (pairing.player_a?.pseudo ?? 'joueur A')
                                      : (pairing.player_b?.pseudo ?? 'joueur B')
                                  }, table ${pairing.table_number}`}
                                  value={draft[side]}
                                  onFocus={(event) => event.target.select()}
                                  onChange={(event) =>
                                    setField(pairing.id, side, event.target.value)
                                  }
                                  onBlur={(event) => onFieldBlur(event, pairing)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                      event.preventDefault();
                                      if (side === 'ta') focusField(pairing.id, 'tb');
                                      else validateRow(pairing);
                                    }
                                    if (event.key === 'Escape') {
                                      event.preventDefault();
                                      resetRow(pairing);
                                      (event.target as HTMLInputElement).blur();
                                    }
                                    if (event.key === 'ArrowDown') {
                                      event.preventDefault();
                                      focusNeighbour(pairing.id, side, 1);
                                    }
                                    if (event.key === 'ArrowUp') {
                                      event.preventDefault();
                                      focusNeighbour(pairing.id, side, -1);
                                    }
                                  }}
                                />
                              </span>
                            ))}
                          </div>
                          <div
                            className={`tac-verdict${
                              tacVerdict.kind === 'none' ? '' : ' warn'
                            }`}>
                            {tacVerdict.kind === 'missing'
                              ? `Saisissez aussi les tactiques de ${tacVerdict.pseudo}.`
                              : tacVerdict.kind === 'unusual'
                                ? 'Au-delà de 6 tactiques, vérifiez la feuille.'
                                : ' '}
                          </div>
                        </>
                      ) : pairing.tactics_a !== null && pairing.tactics_b !== null ? (
                        <span className="score-auto">
                          {pairing.tactics_a} · {pairing.tactics_b}
                        </span>
                      ) : (
                        <span className="score-pending">— · —</span>
                      )}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {keptVisible > 0 && scoreFilter !== 'all' ? (
        <button
          className="btn btn-secondary btn-sm"
          style={{ marginTop: 16 }}
          onClick={clearKept}>
          Masquer les {keptVisible} table{keptVisible > 1 ? 's' : ''} saisie
          {keptVisible > 1 ? 's' : ''}
        </button>
      ) : null}

      {editable ? (
        <div className="field-hint" style={{ marginTop: 16 }}>
          {tacticsMode
            ? 'Tab pour passer d’un champ à l’autre, Entrée pour valider et passer au champ suivant, Maj+Entrée depuis les points pour sauter les tactiques, Échap pour annuler la ligne.'
            : 'Tab pour passer d’un champ à l’autre, Entrée pour valider et passer à la table suivante, Échap pour annuler la ligne.'}
        </div>
      ) : null}

      {/* Clôture de la ronde */}
      {tournament.status !== 'completed' && editable ? (
        <div className="checkin-launch">
          <div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>
              {allScored
                ? isLastRound
                  ? 'Dernière ronde complète'
                  : `Ronde ${selectedNumber} complète`
                : `Ronde ${selectedNumber} en cours`}
            </div>
            {allScored ? (
              <>
                <p style={{ margin: '4px 0 0' }}>
                  {isLastRound
                    ? `Les ${realTables.length} tables de la ronde ${selectedNumber} ont un score. C’est la dernière ronde prévue : aucune ronde ne sera générée après la clôture.`
                    : `Les ${realTables.length} tables ont un score. Vous pouvez clôturer la ronde ${selectedNumber} et générer la ronde ${(selectedNumber ?? 1) + 1}.`}
                </p>
                <div className="field-hint" style={{ marginTop: 8 }}>
                  Un score reste modifiable tant que la ronde n’est pas clôturée.
                </div>
                {noTacticsTables.length > 0 ? (
                  <div className="field-hint" style={{ color: 'var(--danger)', marginTop: 8 }}>
                    Tactiques manquantes sur {noTacticsTables.length} table
                    {noTacticsTables.length > 1 ? 's' : ''} — 3e critère de départage.{' '}
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ marginLeft: 8 }}
                      onClick={() => {
                        toggleTacticsMode(true);
                        setScoreFilter('no-tactics');
                      }}>
                      Compléter les tactiques
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <p style={{ margin: '4px 0 0' }}>
                  {todoTables.length} table{todoTables.length > 1 ? 's' : ''} sur{' '}
                  {realTables.length} n’{todoTables.length > 1 ? 'ont' : 'a'} pas encore de score.
                </p>
                <div className="field-hint" style={{ marginTop: 8 }}>
                  La ronde ne peut être clôturée qu’une fois toutes les tables saisies.
                </div>
              </>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {!allScored && todoTables.length > 0 ? (
              <button
                className="btn btn-secondary"
                onClick={() => focusField(todoTables[0].id, 'a')}>
                Aller à la première table sans score
              </button>
            ) : null}
            <Link
              to={`/tournois/${tournament.id}/classement`}
              className="btn btn-secondary"
              style={{ textDecoration: 'none' }}>
              Voir le classement →
            </Link>
            <button
              className="btn btn-primary"
              disabled={!allScored || busyIds.size > 0 || failedIds.size > 0}
              title={
                !allScored
                  ? `Il reste ${todoTables.length} table(s) à saisir.`
                  : busyIds.size > 0
                    ? 'Enregistrement d’un score en cours…'
                    : failedIds.size > 0
                      ? 'Un score n’a pas été enregistré. Réessayez avant de clôturer.'
                      : undefined
              }
              onClick={async () => {
                await flush();
                setCloseOpen(true);
              }}>
              {isLastRound ? 'Clôturer la dernière ronde' : `Clôturer la ronde ${selectedNumber}`}
            </button>
          </div>
        </div>
      ) : null}

      {/* Toutes les rondes sont jouées : la clôture du tournoi viendra en US-3.9 */}
      {tournament.status === 'in_progress' && !editable && allRoundsPlayed ? (
        <div className="checkin-launch">
          <div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>Toutes les rondes sont jouées</div>
            <p style={{ margin: '4px 0 0' }}>
              Les {tournament.rounds_count} rondes du tournoi sont clôturées. Les scores sont
              figés et le classement est complet.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Link
              to={`/tournois/${tournament.id}/classement`}
              className="btn btn-primary"
              style={{ textDecoration: 'none' }}>
              Voir le classement final →
            </Link>
            <button className="btn btn-primary" onClick={() => setCompleteOpen(true)}>
              Clôturer le tournoi
            </button>
          </div>
        </div>
      ) : null}

      {/* Tournoi terminé : rappel du vainqueur et accès au podium */}
      {tournament.status === 'completed' ? (
        <div className="checkin-launch">
          <div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>Tournoi terminé</div>
            <p style={{ margin: '4px 0 0' }}>
              {tournament.rounds_count} ronde{tournament.rounds_count > 1 ? 's' : ''} jouée
              {tournament.rounds_count > 1 ? 's' : ''}, {standings.length} joueurs classés
              {droppedPlayers.length > 0
                ? `, ${droppedPlayers.length} abandon${droppedPlayers.length > 1 ? 's' : ''}`
                : ''}
              .{standings[0] ? ` Vainqueur : ${standings[0].pseudo}.` : ''}
            </p>
          </div>
          <Link
            to={`/tournois/${tournament.id}/classement`}
            className="btn btn-primary"
            style={{ textDecoration: 'none' }}>
            Voir le classement final →
          </Link>
        </div>
      ) : null}

      {/* Abandons : le geste vit ici, là où l'organisateur travaille le jour J */}
      {registered.length > 0 ? (
        <details className="details-section">
          <summary>
            Abandons et joueurs en lice ({playersLeft} en lice
            {droppedPlayers.length > 0
              ? ` · ${droppedPlayers.length} abandon${droppedPlayers.length > 1 ? 's' : ''}`
              : ''}
            )
          </summary>
          <p style={{ marginTop: 16 }}>
            Un joueur qui quitte le tournoi conserve les résultats déjà acquis. Il n’est plus
            apparié aux rondes suivantes et reste au classement, avec la mention « Abandon ».
          </p>
          <table className="table table-static">
            <thead>
              <tr>
                <th>Joueur</th>
                <th className="hide-narrow" style={{ width: 160 }}>
                  Table ronde {selectedNumber}
                </th>
                {tournament.status === 'in_progress' ? <th style={{ width: 120 }} /> : null}
              </tr>
            </thead>
            <tbody>
              {[...inPlay, ...droppedPlayers].map((registration) => {
                const table = pairingOf(registration.player_id);
                const isDropped = registration.status === 'dropped';
                return (
                  <tr key={registration.id} className={isDropped ? 'row-muted' : ''}>
                    <td>
                      <div className="reg-cell">
                        <span className="reg-avatar">
                          {(registration.profile?.pseudo ?? '?').charAt(0).toUpperCase()}
                        </span>
                        <span>
                          <span className="cell-name">{registration.profile?.pseudo}</span>
                          <br />
                          {isDropped ? (
                            <span className="badge badge-dropped">
                              Abandon
                              {registration.dropped_round ? ` · R${registration.dropped_round}` : ''}
                            </span>
                          ) : (
                            <span className="checkin-meta">
                              {registration.profile?.faction_favorite ?? '—'}
                            </span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="hide-narrow checkin-meta">
                      {table
                        ? table.player_b_id === null
                          ? 'Bye'
                          : `Table ${table.table_number}`
                        : '—'}
                    </td>
                    {tournament.status === 'in_progress' ? (
                      <td className="cell-actions">
                        {isDropped ? (
                          <button
                            className="btn btn-sm btn-secondary"
                            onClick={async () => {
                              if (!supabase) return;
                              await supabase.rpc('drop_player', {
                                p_registration_id: registration.id,
                                p_dropped: false,
                                p_forfeit: false,
                              });
                              await refreshRegistrations();
                              await refreshStandings();
                              setToast({
                                message: `${registration.profile?.pseudo} est réintégré.`,
                              });
                            }}>
                            Réintégrer
                          </button>
                        ) : (
                          <button
                            className="btn btn-sm btn-ghost-danger"
                            aria-label={`Déclarer l’abandon de ${registration.profile?.pseudo}`}
                            onClick={() => setDropTarget(registration)}>
                            Abandon
                          </button>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </details>
      ) : null}

      {dropTarget && selectedNumber ? (
        <DropPlayerModal
          registrationId={dropTarget.id}
          pseudo={dropTarget.profile?.pseudo ?? 'ce joueur'}
          roundNumber={selectedNumber}
          pairing={pairingOf(dropTarget.player_id)}
          playersLeft={playersLeft}
          onCancel={() => setDropTarget(null)}
          onDropped={async (forfeited, opponent, table) => {
            const pseudo = dropTarget.profile?.pseudo ?? 'Le joueur';
            setDropTarget(null);
            await Promise.all([refresh(), refreshRegistrations(), refreshStandings()]);
            setToast({
              message: forfeited
                ? `${pseudo} a abandonné. ${opponent} gagne la table ${table} par forfait, 15 – 5.`
                : `${pseudo} a abandonné. Il ne sera plus apparié. ${playersLeft - 1} joueurs encore en lice.`,
            });
          }}
        />
      ) : null}

      {completeOpen && tournament ? (
        <CompleteTournamentModal
          tournamentId={tournament.id}
          tournamentName={tournament.name}
          roundsCount={tournament.rounds_count}
          standings={standings}
          tieCount={0}
          missingTactics={noTacticsTables.length}
          onCancel={() => setCompleteOpen(false)}
          onReviewStandings={() => {
            setCompleteOpen(false);
            navigate(`/tournois/${tournament.id}/classement`);
          }}
          onCompleted={async () => {
            setCompleteOpen(false);
            onChanged();
            await refresh();
            navigate(`/tournois/${tournament.id}/classement`);
          }}
        />
      ) : null}

      {closeOpen && tournament && selectedNumber ? (
        <CloseRoundModal
          tournamentId={tournament.id}
          roundNumber={selectedNumber}
          roundsCount={tournament.rounds_count}
          pairings={pairings}
          groups={winGroups}
          playersLeft={playersLeft}
          onCancel={() => setCloseOpen(false)}
          onFixTactics={() => {
            setCloseOpen(false);
            toggleTacticsMode(true);
            setScoreFilter('no-tactics');
          }}
          onClosed={async (result: CloseResult, scenario: string) => {
            setCloseOpen(false);
            // Avant le refresh : la ronde existe déjà côté serveur.
            const applied = result.next_round_number
              ? await setScenarioForRound(result.next_round_number, scenario)
              : { ok: true, message: '' };
            await refresh();
            onChanged();
            setSearch('');
            setScoreFilter('all');
            clearKept();
            setRematchTables(result.rematch_tables ?? []);
            if (result.next_round_number) {
              setSelectedNumber(result.next_round_number);
              setJustGenerated(result.next_round_number);
              setToast({
                message: `Ronde ${selectedNumber} clôturée. Ronde ${result.next_round_number} générée sur ${result.tables_count} tables.${
                  result.bye_pseudo ? ` ${result.bye_pseudo} a le bye.` : ''
                }${applied.ok ? '' : ' Le scénario n’a pas été enregistré : saisis-le sur la page.'}`,
                action: { label: 'Afficher pour projection', onPress: () => setProjection(true) },
              });
            } else {
              setToast({
                message: `Ronde ${selectedNumber} clôturée. Toutes les rondes sont jouées.`,
              });
            }
          }}
        />
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
                {selectedRound?.scenario ? ` — ${selectedRound.scenario}` : ''}
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
            {realTables.map((pairing) => (
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
