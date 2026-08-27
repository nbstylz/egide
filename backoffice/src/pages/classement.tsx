import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import type { TournamentWithCount } from '../hooks/use-my-tournaments';
import { useRounds } from '../hooks/use-rounds';
import {
  criterionValue,
  decisiveCriterion,
  TieBreakers,
  useStandings,
  type Standing,
  type TieBreakerKey,
} from '../hooks/use-standings';
import { useTeamStandings } from '../hooks/use-team-standings';
import { formatEventDateShort } from '../lib/tournaments';
import { downloadCsv, slugForFile } from '../lib/export';

type Props = {
  tournament: TournamentWithCount | null;
  tournamentLoading: boolean;
  tournamentError: boolean;
  userId: string;
  /**
   * Supervision. Le classement est une page de lecture : rien à neutraliser,
   * seule la garde « es-tu l'organisateur ? » s'assouplit.
   */
  adminView?: boolean;
};

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Nombre à une décimale, sans zéro inutile : 1,5 mais 2. */
function num(value: number): string {
  return Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

/** Phrase qui explique pourquoi un joueur est derrière celui du dessus. */
function conclusionFor(key: TieBreakerKey, above: Standing, below: Standing): string {
  const a = criterionValue(above, key);
  const b = criterionValue(below, key);
  const ecart = a !== null && b !== null ? Math.abs(a - b) : 0;
  switch (key) {
    case 'wins':
      return `${above.pseudo} a ${num(ecart)} victoire${ecart > 1 ? 's' : ''} de plus.`;
    case 'points':
      return `${above.pseudo} a marqué ${ecart} point${ecart > 1 ? 's' : ''} de plus.`;
    case 'tactics':
      return `${above.pseudo} a marqué ${ecart} tactique${ecart > 1 ? 's' : ''} de plus.`;
    case 'diff':
      return `${above.pseudo} a un différentiel supérieur de ${ecart} point${ecart > 1 ? 's' : ''}.`;
    case 'sos':
      return `${above.pseudo} a rencontré des adversaires plus forts (${num(b ?? 0)} contre ${num(a ?? 0)}).`;
    default:
      return 'Les cinq premiers critères sont identiques. L’ordre a été fixé par un tirage au sort stable : il ne change pas d’un affichage à l’autre.';
  }
}

export function ClassementPage({
  tournament,
  tournamentLoading,
  tournamentError,
  userId,
  adminView,
}: Props) {
  const { standings, loading, error, refresh } = useStandings(tournament?.id);
  // Deux échelles, une seule page : un tournoi par équipes a un vainqueur
  // d'équipe ET un meilleur joueur. Effacer le second serait injuste envers
  // qui fait cinq victoires sur cinq dans une équipe médiocre.
  const isTeamTournament = tournament?.type === 'team';
  const { standings: teamStandings } = useTeamStandings(tournament?.id, isTeamTournament);
  const [tab, setTab] = useState('teams');
  const { rounds, pairings } = useRounds(tournament?.id);

  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  /** Indice du joueur auquel on se compare dans le dépliant. */
  const [compareIndex, setCompareIndex] = useState<number | null>(null);
  const [projection, setProjection] = useState(false);
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  /** Critère décisif de chaque joueur face à celui juste au-dessus. */
  const decisive = useMemo(() => {
    const map = new Map<string, TieBreakerKey>();
    standings.forEach((standing, index) => {
      if (index === 0) return;
      map.set(standing.player_id, decisiveCriterion(standings[index - 1], standing));
    });
    return map;
  }, [standings]);

  const tieCount = useMemo(
    () => [...decisive.values()].filter((key) => key !== 'wins').length,
    [decisive]
  );

  const missingTactics = useMemo(
    () =>
      pairings.filter(
        (p) =>
          p.player_b !== null &&
          p.score_a !== null &&
          (p.tactics_a === null || p.tactics_b === null)
      ).length,
    [pairings]
  );

  if (tournamentLoading || loading) {
    return (
      <>
        <h1 className="page-title">Classement</h1>
        <div className="skeleton" style={{ height: 96, marginTop: 24 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 24 }}>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="skeleton" style={{ height: 72 }} />
          ))}
        </div>
      </>
    );
  }

  if (tournamentError || !tournament || (!adminView && tournament.organizer_id !== userId)) {
    return (
      <div className="empty-state">
        <h2>Tournoi introuvable</h2>
        <p>Il n’existe pas, ou vous n’en êtes pas l’organisateur.</p>
        <Link
          to={adminView ? '/admin/tournois' : '/tournois'}
          className="btn btn-secondary"
          style={{ textDecoration: 'none' }}>
          {adminView ? 'Retour à tous les tournois' : 'Retour à mes tournois'}
        </Link>
      </div>
    );
  }

  // Les liens internes restent dans le territoire courant.
  const base = `${adminView ? '/admin' : ''}/tournois/${tournament.id}`;

  const header = (
    <div className="page-header">
      <div>
        <h1 className="page-title">Classement</h1>
        <div className="page-subtitle">
          {formatEventDateShort(tournament.event_date)} · {tournament.city}
        </div>
        <div className="tiebreak-summary">
          Départage : victoires, puis points marqués, puis tactiques, puis différentiel, puis
          force des adversaires.
        </div>
      </div>
    </div>
  );

  if (tournament.status === 'draft') {
    return (
      <>
        {header}
        <div className="empty-state">
          <h2>Le classement n’existe pas encore</h2>
          <p>
            Il apparaîtra dès la première ronde jouée. Commencez par ouvrir les inscriptions.
          </p>
          <Link to={`${base}`}>Retour au tournoi</Link>
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
          <p>Aucun classement n’est établi.</p>
          <Link to={`${base}`}>Retour au tournoi</Link>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        {header}
        <div className="empty-state">
          <p>Impossible de charger le classement.</p>
          <p>Vérifiez votre connexion.</p>
          <button className="btn btn-primary" onClick={refresh}>
            Réessayer
          </button>
        </div>
      </>
    );
  }

  if (standings.length === 0) {
    return (
      <>
        {header}
        <div className="empty-state">
          <h2>Aucune ronde jouée</h2>
          <p>Le classement se construira à partir des résultats de la ronde 1.</p>
          <Link to={`${base}/rondes`}>Aller aux rondes →</Link>
        </div>
      </>
    );
  }

  const finished = tournament.status === 'completed';
  const droppedCount = standings.filter((s) => s.dropped).length;
  const roundsPlayed = rounds.length;
  const pending = pairings.filter((p) => p.player_b !== null && p.score_a === null).length;

  const needle = normalize(search.trim());
  const matchId =
    needle !== ''
      ? (standings.find((s) => normalize(s.pseudo).includes(needle))?.player_id ?? null)
      : null;

  /** Exporte le classement courant en CSV (ouvrable dans Excel / Sheets). */
  function exportCsv() {
    if (!tournament) return;
    const headers = [
      'Rang', 'Joueur', 'Faction', 'Victoires (nul=0,5)', 'V', 'N', 'D',
      'Points marqués', 'Points encaissés', 'Différentiel', 'Tactiques',
      'Force des adversaires', 'Abandon',
    ];
    const rows = standings.map((s) => [
      s.rank,
      s.pseudo,
      s.faction ?? '',
      num(s.win_score),
      s.wins,
      s.draws,
      s.losses,
      s.points_for,
      s.points_against,
      s.point_diff,
      s.tactics,
      num(s.opponents_wins),
      s.dropped ? (s.dropped_round ? `Ronde ${s.dropped_round}` : 'Oui') : '',
    ]);
    downloadCsv(
      `classement-${slugForFile(tournament.name)}-${tournament.event_date}.csv`,
      headers,
      rows
    );
  }

  /** Le bloc « pourquoi suis-je Nᵉ ? ». */
  function renderExplain(standing: Standing, index: number) {
    // Par défaut on se compare à celui juste au-dessus : c'est lui qu'on veut
    // dépasser. Le bouton permet ensuite de regarder celui juste en dessous.
    const otherIndex = compareIndex ?? (index === 0 ? 1 : index - 1);
    const other = standings[otherIndex];
    if (!other) return null;
    const above = otherIndex < index ? other : standing;
    const below = otherIndex < index ? standing : other;
    const key = decisiveCriterion(above, below);
    const nextBelow = standings[index + 1];

    return (
      <tr className="rank-explain" key={`${standing.player_id}-explain`}>
        <td colSpan={10}>
          <h3>
            {index === 0
              ? `Pourquoi ${standing.pseudo} est 1er`
              : `Pourquoi ${standing.pseudo} est ${standing.rank}e`}
          </h3>
          <p style={{ marginTop: 0 }}>
            Comparaison avec <strong>{other.pseudo}</strong> ({other.rank}e) :
          </p>
          {TieBreakers.map((criterion, position) => {
            const mine = criterionValue(standing, criterion.key);
            const theirs = criterionValue(other, criterion.key);
            const isDecisive = criterion.key === key;
            const reached = position <= TieBreakers.findIndex((c) => c.key === key);
            let mention = 'non départageant';
            if (isDecisive) {
              mention = `${above.pseudo} devant`;
            } else if (reached) {
              mention = 'à égalité';
            }
            const notEntered =
              criterion.key === 'tactics' && standing.tactics === 0 && missingTactics > 0;
            return (
              <div
                key={criterion.key}
                className={`explain-row${isDecisive ? ' decisive' : ''}`}>
                <span>{position + 1}</span>
                <span>{criterion.label}</span>
                <span className="rank-num">
                  {criterion.key === 'random' ? '—' : num(mine ?? 0)}
                </span>
                <span className="rank-num">
                  {criterion.key === 'random' ? '—' : num(theirs ?? 0)}
                </span>
                <span style={notEntered ? { color: 'var(--danger)' } : undefined}>
                  {notEntered ? 'non saisi — critère ignoré' : mention}
                </span>
              </div>
            );
          })}
          <div className="explain-conclusion">
            {key === 'wins' && index > 0
              ? `Le classement se joue sur les victoires, sans départage. ${conclusionFor(key, above, below)}`
              : `Le départage s’est joué au critère ${
                  TieBreakers.findIndex((c) => c.key === key) + 1
                } : ${conclusionFor(key, above, below)}`}
          </div>
          {nextBelow && otherIndex !== index + 1 ? (
            <button
              className="btn btn-secondary btn-sm"
              style={{ marginTop: 12 }}
              onClick={() => setCompareIndex(index + 1)}>
              Comparer avec le {nextBelow.rank}e
            </button>
          ) : index > 0 && otherIndex === index + 1 ? (
            <button
              className="btn btn-secondary btn-sm"
              style={{ marginTop: 12 }}
              onClick={() => setCompareIndex(index - 1)}>
              Comparer avec le {standings[index - 1].rank}e
            </button>
          ) : null}
        </td>
      </tr>
    );
  }

  return (
    <>
      {header}

      {finished ? (
        <div className="banner banner-info" style={{ marginTop: 24, maxWidth: 640 }}>
          Classement final — {tournament.name}, {roundsPlayed} ronde
          {roundsPlayed > 1 ? 's' : ''}.
        </div>
      ) : pending > 0 ? (
        <div className="banner banner-info banner-info-danger" style={{ marginTop: 24, maxWidth: 640 }}>
          Classement provisoire : {pending} table{pending > 1 ? 's' : ''} n’
          {pending > 1 ? 'ont' : 'a'} pas encore de score. L’ordre va changer.
        </div>
      ) : (
        <div className="banner banner-info" style={{ marginTop: 24, maxWidth: 640 }}>
          Classement après la ronde {roundsPlayed} sur {tournament.rounds_count}.
        </div>
      )}

      {droppedCount > 0 ? (
        <div className="banner banner-info" style={{ marginTop: 16, maxWidth: 640 }}>
          {droppedCount > 1
            ? `${droppedCount} joueurs ont abandonné en cours de tournoi. Leurs résultats acquis restent comptabilisés ; ils n’ont pas été appariés aux rondes suivantes.`
            : 'Un joueur a abandonné en cours de tournoi. Ses résultats acquis restent comptabilisés ; il n’a pas été apparié aux rondes suivantes.'}
        </div>
      ) : null}

      {missingTactics > 0 ? (
        <div className="banner banner-info" style={{ marginTop: 16, maxWidth: 640 }}>
          Les tactiques ne sont pas saisies pour {missingTactics} table
          {missingTactics > 1 ? 's' : ''}. Le 3e critère de départage ne peut pas s’appliquer
          partout.{' '}
          <Link to={`${base}/rondes`}>Compléter dans Rondes &amp; scores →</Link>
        </div>
      ) : null}

      {/* Podium, seulement une fois le tournoi terminé */}
      {finished && standings.length > 0 ? (
        <>
        <h2 className="section-title">Podium</h2>
        <div className="stats-row" style={{ marginTop: 16 }}>
          {standings.slice(0, 3).map((standing) => (
            <div
              key={standing.player_id}
              className={`podium-card${standing.rank === 1 ? ' first' : ''}`}>
              <div
                className="pairing-table-no"
                style={standing.rank === 1 ? { fontSize: 32 } : undefined}>
                {standing.rank}
              </div>
              <div style={{ fontSize: 17, fontWeight: 700 }}>{standing.pseudo}</div>
              <div className="checkin-meta">{standing.faction ?? '—'}</div>
              <div className="stat-label">
                {num(standing.win_score)} V · {standing.points_for} pts
              </div>
            </div>
          ))}
        </div>
        </>
      ) : null}

      <div className="rounds-bar">
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-value">{standings.length}</div>
            <div className="stat-label">joueurs classés</div>
            {droppedCount > 0 ? (
              <div className="stat-label">
                dont {droppedCount} abandon{droppedCount > 1 ? 's' : ''}
              </div>
            ) : null}
          </div>
          <div className="stat-card">
            <div className="stat-value">
              {roundsPlayed} / {tournament.rounds_count}
            </div>
            <div className="stat-label">rondes jouées</div>
            <div className="mini-gauge">
              <div
                className="mini-gauge-fill"
                style={{
                  width: `${Math.round((roundsPlayed / tournament.rounds_count) * 100)}%`,
                }}
              />
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{tieCount || '—'}</div>
            <div className="stat-label">égalités départagées</div>
          </div>
        </div>

        <div className="checkin-toolbar">
          <input
            type="search"
            autoComplete="off"
            className="input input-lg"
            style={{ flex: 1 }}
            placeholder="Rechercher un joueur"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              const found = standings.find((s) =>
                normalize(s.pseudo).includes(normalize(event.target.value.trim()))
              );
              if (found && event.target.value.trim() !== '') {
                rowRefs.current.get(found.player_id)?.scrollIntoView({ block: 'center' });
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setSearch('');
            }}
          />
          <button className="btn btn-secondary" onClick={exportCsv}>
            Exporter CSV
          </button>
          <button className="btn btn-secondary" onClick={() => setProjection(true)}>
            Projection / PDF
          </button>
        </div>
      </div>

      {isTeamTournament ? (
        <div className="segmented" style={{ marginBottom: 16, maxWidth: 320 }}>
          <button className={tab === 'teams' ? 'active' : ''} onClick={() => setTab('teams')}>
            Équipes
          </button>
          <button className={tab === 'players' ? 'active' : ''} onClick={() => setTab('players')}>
            Individuel
          </button>
        </div>
      ) : null}

      {isTeamTournament && tab === 'teams' ? (
        teamStandings.length === 0 ? (
          <div className="empty-state">
            <h2>Le classement des équipes apparaîtra après la première rencontre terminée</h2>
            <p>
              Une rencontre n’est comptée que lorsque toutes ses tables sont saisies : annoncer un
              vainqueur sur deux tables sur trois serait raconter une histoire fausse.
            </p>
          </div>
        ) : (
          <table className="table table-static table-lg">
            <thead>
              <tr>
                <th style={{ width: 64 }}>Rang</th>
                <th>Équipe</th>
                <th style={{ width: 72 }} title="Rencontres gagnées, un nul comptant pour une demi">
                  Renc.
                </th>
                <th className="hide-narrow" style={{ width: 92 }}>
                  Bilan
                </th>
                <th className="hide-narrow" style={{ width: 80 }} title="Matchs individuels gagnés">
                  Matchs
                </th>
                <th style={{ width: 64 }} title="Points de partie cumulés">
                  Pts
                </th>
                <th className="hide-narrow" style={{ width: 72 }}>
                  Diff.
                </th>
                <th className="hide-narrow" style={{ width: 72 }} title="Force des adversaires">
                  SoS
                </th>
              </tr>
            </thead>
            <tbody>
              {teamStandings.map((team) => (
                <tr key={team.team_registration_id}>
                  <td>
                    <span className={`rank-cell${team.rank <= 3 ? ' top' : ''}`}>{team.rank}</span>
                  </td>
                  <td>
                    <span className="cell-name">{team.team_name}</span>
                    {team.region ? <div className="checkin-meta">{team.region}</div> : null}
                  </td>
                  <td>{num(team.match_score)}</td>
                  <td className="hide-narrow">
                    {team.wins} – {team.draws} – {team.losses}
                  </td>
                  <td className="hide-narrow">{team.table_wins}</td>
                  <td>{team.points_for}</td>
                  <td className="hide-narrow">{team.point_diff}</td>
                  <td className="hide-narrow">{num(team.opponents_wins)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : (
      <table className="table table-static table-lg">
        <thead>
          <tr>
            <th style={{ width: 64 }}>Rang</th>
            <th>Joueur</th>
            <th style={{ width: 56 }} title="Victoires, un nul comptant pour une demi-victoire">
              V
            </th>
            <th className="hide-narrow" style={{ width: 92 }}>
              Bilan
            </th>
            <th style={{ width: 64 }} title="Points de partie marqués">
              Pts
            </th>
            <th style={{ width: 56 }} title="Tactiques marquées">
              Tac
            </th>
            <th
              className="hide-xnarrow"
              style={{ width: 64 }}
              title="Différentiel : points marqués moins points encaissés">
              Diff
            </th>
            <th
              className="hide-narrow"
              style={{ width: 64 }}
              title="Force des adversaires rencontrés">
              SoS
            </th>
            <th style={{ width: 40 }} />
          </tr>
        </thead>
        <tbody>
          {standings.map((standing, index) => {
            const key = decisive.get(standing.player_id);
            const previous = standings[index - 1];
            const sameGroup =
              previous && Number(previous.win_score) === Number(standing.win_score);
            const cellClass = (criterion: TieBreakerKey) =>
              key === criterion ? 'rank-decisive' : '';
            const open = expanded === standing.player_id;

            return [
              <tr
                key={standing.player_id}
                ref={(element) => {
                  if (element) rowRefs.current.set(standing.player_id, element);
                }}
                className={[
                  sameGroup ? 'rank-tie-group' : '',
                  matchId === standing.player_id ? 'row-highlight' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}>
                <td>
                  <span
                    className={`rank-cell${standing.rank <= 3 ? ' top' : ''} ${cellClass('random')}`}>
                    {standing.rank}
                  </span>
                </td>
                <td>
                  <div className="reg-cell">
                    <span className="reg-avatar">{standing.pseudo.charAt(0).toUpperCase()}</span>
                    <span>
                      <span className="cell-name">{standing.pseudo}</span>
                      <br />
                      {standing.dropped ? (
                        <span className="badge badge-dropped">
                          Abandon
                          {standing.dropped_round ? ` · R${standing.dropped_round}` : ''}
                        </span>
                      ) : (
                        <span className="checkin-meta">{standing.faction ?? '—'}</span>
                      )}
                    </span>
                  </div>
                </td>
                <td>
                  <span className={`rank-num strong ${cellClass('wins')}`}>
                    {num(standing.win_score)}
                  </span>
                </td>
                <td className="hide-narrow checkin-meta">
                  {standing.wins} – {standing.draws} – {standing.losses}
                </td>
                <td>
                  <span className={`rank-num ${cellClass('points')}`}>{standing.points_for}</span>
                </td>
                <td>
                  <span className={`rank-num ${cellClass('tactics')}`}>{standing.tactics}</span>
                </td>
                <td className="hide-xnarrow">
                  <span className={`rank-num ${cellClass('diff')}`}>
                    {signed(standing.point_diff)}
                  </span>
                </td>
                <td className="hide-narrow">
                  <span className={`rank-num ${cellClass('sos')}`}>
                    {num(standing.opponents_wins)}
                  </span>
                </td>
                <td>
                  <button
                    className="rank-toggle"
                    aria-expanded={open}
                    aria-label={`Détail du classement de ${standing.pseudo}`}
                    onClick={() => {
                      setCompareIndex(null);
                      setExpanded(open ? null : standing.player_id);
                    }}>
                    {open ? '▾' : '▸'}
                  </button>
                </td>
              </tr>,
              open ? renderExplain(standing, index) : null,
            ];
          })}
        </tbody>
      </table>
      )}

      <div className="field-hint" style={{ marginTop: 16 }}>
        {isTeamTournament && tab === 'teams'
          ? 'Renc. : rencontres gagnées (un nul vaut 0,5) · Matchs : matchs individuels gagnés, qui ne départagent pas · Pts : points de partie cumulés · Diff : différentiel · SoS : force des adversaires.'
          : 'V : victoires (un nul vaut 0,5) · Pts : points marqués · Tac : tactiques · Diff : différentiel · SoS : force des adversaires.'}
      </div>

      <details className="details-section" open={roundsPlayed === 0}>
        <summary>Comment le classement est calculé</summary>
        <ol style={{ marginTop: 16, paddingLeft: 20 }}>
          <li>
            <strong>Nombre de victoires.</strong> Une victoire vaut un point de classement, une
            égalité un demi-point.
          </li>
          <li>
            <strong>Points marqués.</strong> Somme des points de partie obtenus sur l’ensemble
            des rondes.
          </li>
          <li>
            <strong>Tactiques marquées.</strong> Somme des tactiques réussies. Non renseignée,
            cette donnée ne départage pas.
          </li>
          <li>
            <strong>Différentiel de score.</strong> Points marqués moins points encaissés, toutes
            rondes confondues.
          </li>
          <li>
            <strong>Force des adversaires (SoS).</strong> Somme des victoires des adversaires
            rencontrés.
          </li>
          <li>
            <strong>Tirage au sort.</strong> Fixé une fois pour toutes, identique à chaque
            affichage.
          </li>
        </ol>
        <p>
          Le bye compte comme une victoire 15 – 5 avec 3 tactiques. Les critères s’appliquent dans
          l’ordre : on ne passe au suivant qu’en cas d’égalité stricte sur tous les précédents.
        </p>
      </details>

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
                {finished ? 'Classement final' : `Classement après la ronde ${roundsPlayed}`}
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
          <div className="projection-standings">
            {standings.map((standing, index) => {
              const previous = standings[index - 1];
              const newGroup =
                previous && Number(previous.win_score) !== Number(standing.win_score);
              return (
                <div
                  key={standing.player_id}
                  className="projection-rank-item"
                  style={{
                    borderTop: newGroup ? '1px solid var(--accent)' : undefined,
                    fontWeight: finished && standing.rank <= 3 ? 700 : undefined,
                  }}>
                  <span className="projection-table-no">{standing.rank}</span>
                  <span className="projection-player">{standing.pseudo}</span>
                  <span className="projection-score">
                    {num(standing.win_score)} V · {standing.points_for} pts
                    {missingTactics === 0 ? ` · ${standing.tactics} tac` : ''}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="projection-foot">
            Départage : victoires, puis points marqués, puis tactiques, puis différentiel, puis
            force des adversaires, puis tirage au sort. — Classement arrêté le{' '}
            {new Date().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}.
          </div>
        </div>
      ) : null}
    </>
  );
}
