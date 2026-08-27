import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useTeamCheckIn, type TeamCheckInRow } from '../hooks/use-team-check-in';
import { flushPushQueue } from '../lib/push';
import { supabase } from '../lib/supabase';
import { formatEventDateShort } from '../lib/tournaments';
import { AdminReadOnlyBanner } from './admin-page-header';
import { Modal } from './modal';
import { Toast } from './toast';

type Props = {
  tournamentId: string;
  tournamentName: string;
  eventDate: string;
  city: string;
  teamSize: number;
  /** Le pointage n'est ouvert que tant que le tournoi n'est pas lancé. */
  editable: boolean;
  readOnly?: boolean;
  organizerPseudo?: string | null;
  /** Chemin de base des liens du tournoi (`/tournois/:id` ou `/admin/...`). */
  base: string;
};

/** Traduit un refus de la base ; les factions manquantes arrivent nommées. */
function readableError(message: string): string {
  const [code, subject] = message.split(':');
  if (code === 'FACTION_MISSING') {
    return `Faction non déclarée : ${subject}. Renseignez-la depuis la page Inscrits, puis pointez l’équipe.`;
  }
  if (code === 'NOT_REGISTERED') return 'Cette équipe n’occupe pas de place dans le tournoi.';
  return 'Impossible d’enregistrer le pointage. Vérifiez votre connexion.';
}

/**
 * Pointage par équipe (US-7.4).
 *
 * Une équipe se présente à l'accueil ensemble : l'organisateur fait un geste
 * pour l'équipe entière, et le pointage individuel de la 0007 reste la brique
 * de base — appelée en lot, jamais réécrite.
 *
 * Deux choses se voient ici et nulle part ailleurs, parce que les découvrir au
 * moment de générer la ronde 1 coûterait dix minutes devant une salle qui
 * attend : les **rosters incomplets** et les **factions non déclarées**.
 */
export function TeamCheckIn({
  tournamentId,
  tournamentName,
  eventDate,
  city,
  teamSize,
  editable,
  readOnly,
  organizerPseudo,
  base,
}: Props) {
  const navigate = useNavigate();
  const { rows, loading, error, refresh, setRows } = useTeamCheckIn(tournamentId);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [launchOpen, setLaunchOpen] = useState(false);
  const [scenario, setScenario] = useState('');
  const [launching, setLaunching] = useState(false);
  const [launchFailed, setLaunchFailed] = useState(false);

  const engaged = useMemo(() => rows.filter((r) => r.status !== 'waitlisted'), [rows]);
  const presentTeams = engaged.filter((r) => r.status === 'checked_in').length;
  const presentPlayers = engaged.reduce((sum, r) => sum + r.present, 0);
  const expectedPlayers = engaged.reduce((sum, r) => sum + r.roster_size, 0);

  async function toggle(row: TeamCheckInRow) {
    if (!supabase || !editable) return;
    const present = row.status !== 'checked_in';
    setBusyId(row.team_registration_id);
    const { error: dbError } = await supabase.rpc('set_team_check_in', {
      p_team_registration_id: row.team_registration_id,
      p_present: present,
    });
    setBusyId(null);
    if (dbError) {
      setToast(readableError(dbError.message));
      return;
    }
    // Pas de rechargement : on met la ligne à jour sur place.
    setRows((current) =>
      current.map((r) =>
        r.team_registration_id === row.team_registration_id
          ? {
              ...r,
              status: present ? 'checked_in' : 'registered',
              present: present ? r.roster_size : 0,
            }
          : r
      )
    );
  }

  /**
   * Lance le tournoi. La modale nomme les équipes qui seront écartées : une
   * équipe pointée par erreur se rattrape, une équipe oubliée ne se rattrape
   * plus une fois la ronde 1 générée.
   */
  async function launch() {
    if (!supabase) return;
    setLaunching(true);
    setLaunchFailed(false);
    const { error: dbError } = await supabase.rpc('start_tournament', {
      p_tournament_id: tournamentId,
    });
    if (dbError) {
      setLaunching(false);
      setLaunchFailed(true);
      return;
    }
    // Le scénario saisi doit survivre au trajet vers la page Rondes.
    if (scenario.trim() !== '') {
      const { data: round } = await supabase
        .from('rounds')
        .select('id')
        .eq('tournament_id', tournamentId)
        .eq('number', 1)
        .maybeSingle<{ id: string }>();
      if (round) {
        await supabase.rpc('set_round_scenario', {
          p_round_id: round.id,
          p_scenario: scenario.trim(),
        });
      }
    }
    setLaunching(false);
    setLaunchOpen(false);
    flushPushQueue();
    navigate(`${base}/rondes`);
  }

  if (loading) {
    return <div className="skeleton" style={{ height: 240, marginTop: 24 }} />;
  }

  if (error) {
    return (
      <div className="empty-state">
        <h2>Impossible de charger les équipes</h2>
        <p>Vérifiez votre connexion, puis réessayez.</p>
        <button className="button" onClick={refresh}>
          Réessayer
        </button>
      </div>
    );
  }

  if (engaged.length === 0) {
    return (
      <>
        <h1 className="page-title">Check-in</h1>
        <div className="empty-state">
          <h2>Aucune équipe à pointer</h2>
          <p>
            Aucune équipe n’est engagée sur ce tournoi. Les inscriptions se font depuis
            l’application mobile, par les capitaines.
          </p>
          <Link to={`${base}/inscrits`}>Voir les inscrits →</Link>
        </div>
      </>
    );
  }

  const fillPercent = Math.round((presentTeams / engaged.length) * 100);

  return (
    <>
      {readOnly ? <AdminReadOnlyBanner organizerPseudo={organizerPseudo} /> : null}

      <div className="page-header">
        <div>
          <h1 className="page-title">Check-in</h1>
          <div className="page-subtitle">
            {formatEventDateShort(eventDate)} · {city} · {tournamentName}
          </div>
        </div>
      </div>

      {!editable ? (
        <div className="banner banner-info" style={{ marginTop: 24, maxWidth: 640 }}>
          🔒 Le pointage est figé : le tournoi n’accepte plus de changement de présence.
        </div>
      ) : null}

      <div className="checkin-summary">
        <div aria-live="polite">
          <span className="checkin-count">
            {presentTeams} / {engaged.length}
          </span>{' '}
          <span style={{ color: 'var(--text-secondary)' }}>équipes présentes</span>
          <div className="stat-label">
            {presentPlayers} joueur{presentPlayers > 1 ? 's' : ''} sur {expectedPlayers}
          </div>
        </div>
        <div className="mini-gauge" style={{ maxWidth: 'none', marginTop: 8 }}>
          <div className="mini-gauge-fill present" style={{ width: `${fillPercent}%` }} />
        </div>
      </div>

      <div className="checkin-list" style={{ marginTop: 24 }}>
        {engaged.map((row) => {
          const present = row.status === 'checked_in';
          const incomplete = row.roster_size < row.expected;
          const blocked = row.missing_factions !== null;
          return (
            <div key={row.team_registration_id} className="team-checkin-row">
              <button
                className={`checkin-row${present ? ' present' : ''}${!editable ? ' readonly' : ''}`}
                disabled={!editable || busyId === row.team_registration_id}
                onClick={() => toggle(row)}
                aria-pressed={present}>
                <span className={`checkin-box${present ? ' checked' : ''}`}>
                  {present ? '✓' : ''}
                </span>
                <span>
                  <span className="checkin-name">{row.team_name}</span>
                  <br />
                  <span className="checkin-meta">
                    {row.roster_size} joueur{row.roster_size > 1 ? 's' : ''} sur {row.expected}
                  </span>
                </span>
                <span className={`checkin-state${present ? ' present' : ''}`}>
                  {present ? 'Présente' : 'À pointer'}
                </span>
              </button>

              {/* Ce qui se découvrirait sinon devant une table vide. */}
              {incomplete ? (
                <div className="banner banner-info banner-info-danger team-checkin-note">
                  Roster incomplet : {row.expected - row.roster_size} joueur
                  {row.expected - row.roster_size > 1 ? 's' : ''} manquant
                  {row.expected - row.roster_size > 1 ? 's' : ''}. Une table sera déclarée forfait.
                </div>
              ) : null}
              {blocked ? (
                <div className="banner banner-info banner-info-danger team-checkin-note">
                  Faction non déclarée : {row.missing_factions}. Le capitaine adverse apparie en
                  regardant les factions —{' '}
                  <Link to={`${base}/inscrits`}>renseignez-la depuis les inscrits</Link>.
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {editable ? (
        <div className="checkin-launch">
          <button
            className="btn btn-primary btn-lg"
            disabled={presentTeams < 2}
            onClick={() => setLaunchOpen(true)}>
            Lancer le tournoi
          </button>
          <div className="stat-label">
            {presentTeams < 2
              ? 'Il faut au moins deux équipes présentes pour lancer.'
              : `${Math.floor(presentTeams / 2)} rencontre${
                  Math.floor(presentTeams / 2) > 1 ? 's' : ''
                } · ${Math.floor(presentTeams / 2) * teamSize} table${
                  Math.floor(presentTeams / 2) * teamSize > 1 ? 's' : ''
                }${presentTeams % 2 === 1 ? ' · une équipe aura le bye' : ''}`}
          </div>
        </div>
      ) : null}

      {launchOpen ? (
        <Modal
          title="Lancer le tournoi ?"
          onClose={() => setLaunchOpen(false)}
          locked={launching}>
          <p>
            {presentTeams} équipe{presentTeams > 1 ? 's' : ''} présente
            {presentTeams > 1 ? 's' : ''} seront appariées sur{' '}
            {Math.floor(presentTeams / 2) * teamSize} table
            {Math.floor(presentTeams / 2) * teamSize > 1 ? 's' : ''}. Les tables de chaque
            rencontre sont composées dans l’ordre des rosters.
          </p>
          {engaged.length - presentTeams > 0 ? (
            <p className="banner banner-info banner-info-danger">
              {engaged
                .filter((r) => r.status !== 'checked_in')
                .map((r) => r.team_name)
                .join(', ')}{' '}
              {engaged.length - presentTeams > 1 ? 'ne seront pas' : 'ne sera pas'} du tournoi :
              {engaged.length - presentTeams > 1 ? ' elles ne sont pas pointées' : ' elle n’est pas pointée'}.
            </p>
          ) : null}
          <label>
            Scénario de la ronde 1 <span className="stat-label">(facultatif)</span>
            <input
              className="input"
              value={scenario}
              onChange={(event) => setScenario(event.target.value)}
              placeholder="Ex. Prise de position"
              disabled={launching}
            />
          </label>
          {launchFailed ? (
            <p className="field-error">
              Le lancement a échoué. Vérifiez votre connexion, puis réessayez.
            </p>
          ) : null}
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setLaunchOpen(false)} disabled={launching}>
              Revenir au pointage
            </button>
            <button className="btn btn-primary" onClick={launch} disabled={launching}>
              {launching ? 'Lancement…' : 'Lancer le tournoi'}
            </button>
          </div>
        </Modal>
      ) : null}

      {toast ? <Toast message={toast} variant="danger" onDone={() => setToast(null)} /> : null}
    </>
  );
}
