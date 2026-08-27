import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { useTeamCheckIn, type TeamCheckInRow } from '../hooks/use-team-check-in';
import { supabase } from '../lib/supabase';
import { formatEventDateShort } from '../lib/tournaments';
import { AdminReadOnlyBanner } from './admin-page-header';
import { Toast } from './toast';

type Props = {
  tournamentId: string;
  tournamentName: string;
  eventDate: string;
  city: string;
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
  editable,
  readOnly,
  organizerPseudo,
  base,
}: Props) {
  const { rows, loading, error, refresh, setRows } = useTeamCheckIn(tournamentId);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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

      {toast ? <Toast message={toast} variant="danger" onDone={() => setToast(null)} /> : null}
    </>
  );
}
