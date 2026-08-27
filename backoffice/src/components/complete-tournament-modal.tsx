import { useState } from 'react';

import { Modal } from './modal';
import type { Standing } from '../hooks/use-standings';
import { supabase } from '../lib/supabase';

type Props = {
  tournamentId: string;
  tournamentName: string;
  roundsCount: number;
  standings: Standing[];
  tieCount: number;
  missingTactics: number;
  onCancel: () => void;
  onReviewStandings: () => void;
  onCompleted: () => void;
};

const num = (value: number) =>
  Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 2 });

const ordinal = (rank: number) => (rank === 1 ? '1er' : `${rank}e`);

/** Le geste le plus définitif du produit : le classement devient officiel. */
export function CompleteTournamentModal({
  tournamentId,
  tournamentName,
  roundsCount,
  standings,
  tieCount,
  missingTactics,
  onCancel,
  onReviewStandings,
  onCompleted,
}: Props) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'network' | 'already' | null>(null);

  const dropped = standings.filter((s) => s.dropped).length;
  const podium = standings.slice(0, 3);

  async function handleComplete() {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: dbError } = await supabase.rpc('close_tournament', {
      p_tournament_id: tournamentId,
    });
    setBusy(false);
    if (dbError) {
      setError(dbError.message?.includes('ALREADY_CLOSED') ? 'already' : 'network');
      return;
    }
    onCompleted();
  }

  return (
    <Modal
      title={`Clôturer définitivement « ${tournamentName} » ?`}
      locked={busy}
      onClose={onCancel}>
      <p style={{ margin: 0 }}>
        {standings.length} joueurs classés, {roundsCount} ronde{roundsCount > 1 ? 's' : ''} jouée
        {roundsCount > 1 ? 's' : ''}
        {dropped > 0 ? `, ${dropped} abandon${dropped > 1 ? 's' : ''}` : ''}. Le classement
        ci-dessous devient le classement officiel du tournoi.
      </p>

      {/* Le podium en clair : c'est ce qu'il faut relire avant de valider. */}
      <div className="banner banner-info">
        {podium.map((standing) => (
          <div key={standing.player_id} style={{ padding: '2px 0' }}>
            {ordinal(standing.rank)} — <strong>{standing.pseudo}</strong>{' '}
            <span className="checkin-meta">
              {standing.faction ? `(${standing.faction}) · ` : ''}
              {num(standing.win_score)} V · {standing.points_for} pts
            </span>
          </div>
        ))}
      </div>

      <details className="details-section" style={{ marginTop: 0 }}>
        <summary>Revoir le classement complet</summary>
        <div style={{ maxHeight: 240, overflowY: 'auto', marginTop: 12 }}>
          {standings.map((standing) => (
            <div key={standing.player_id} style={{ padding: '2px 0' }}>
              {standing.rank}. {standing.pseudo} — {num(standing.win_score)} V ·{' '}
              {standing.points_for} pts
              {standing.dropped ? <span className="checkin-meta"> · abandon</span> : null}
            </div>
          ))}
        </div>
      </details>

      {tieCount > 0 ? (
        <div className="field-hint">
          {tieCount} égalité{tieCount > 1 ? 's' : ''} {tieCount > 1 ? 'ont' : 'a'} été départagée
          {tieCount > 1 ? 's' : ''} aux critères secondaires. Le détail reste consultable après la
          clôture.
        </div>
      ) : null}

      {missingTactics > 0 ? (
        <div className="banner banner-info banner-info-danger">
          Les tactiques ne sont pas saisies sur {missingTactics} table
          {missingTactics > 1 ? 's' : ''} : le 3e critère de départage n’a pas pu s’appliquer
          partout. Après la clôture, ce sera définitif.
        </div>
      ) : null}

      <p style={{ margin: 0 }}>
        Après la clôture : <strong>aucun score ne pourra plus être modifié</strong>, aucune ronde
        ne pourra être ajoutée, aucun abandon ni aucune réintégration ne sera possible. Le
        tournoi, ses rondes et son classement restent consultables.{' '}
        <strong>Vous ne pourrez pas revenir en arrière.</strong>
      </p>

      <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => setChecked(event.target.checked)}
        />
        <span>J’ai vérifié le classement final : le podium est exact.</span>
      </label>

      {error === 'already' ? (
        <div className="banner banner-danger">
          Ce tournoi a déjà été clôturé, peut-être depuis un autre appareil.
        </div>
      ) : error === 'network' ? (
        <div className="banner banner-danger">
          Le tournoi n’a pas pu être clôturé. Vérifiez votre connexion et réessayez.
        </div>
      ) : null}

      <div className="modal-actions">
        <button className="btn btn-secondary" disabled={busy} onClick={onReviewStandings}>
          Revoir le classement
        </button>
        <button
          className="btn btn-primary"
          disabled={busy || !checked}
          onClick={handleComplete}>
          {busy ? 'Clôture…' : error ? 'Réessayer' : 'Clôturer le tournoi'}
        </button>
      </div>
    </Modal>
  );
}
