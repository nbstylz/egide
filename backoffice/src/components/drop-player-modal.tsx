import { useState } from 'react';

import { Modal } from './modal';
import type { Pairing } from '../hooks/use-rounds';
import { supabase } from '../lib/supabase';

type Props = {
  registrationId: string;
  pseudo: string;
  /** Numéro de la ronde en cours. */
  roundNumber: number;
  /** Table du joueur dans la ronde en cours, si elle existe. */
  pairing: Pairing | null;
  /** Joueurs encore en lice avant cet abandon. */
  playersLeft: number;
  onCancel: () => void;
  onDropped: (forfeited: boolean, opponent: string | null, table: number | null) => void;
};

/**
 * Abandon d'un joueur. Le point délicat est sa table de la ronde en cours :
 * si elle n'a pas de score, la ronde ne pourra pas être clôturée tant que
 * l'organisateur n'aura pas dit ce qui a été joué.
 */
export function DropPlayerModal({
  registrationId,
  pseudo,
  roundNumber,
  pairing,
  playersLeft,
  onCancel,
  onDropped,
}: Props) {
  const [forfeit, setForfeit] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const isBye = pairing !== null && pairing.player_b === null;
  const scored = pairing !== null && pairing.score_a !== null;
  const needsDecision = pairing !== null && !isBye && !scored;
  const opponent =
    pairing && !isBye
      ? pairing.player_a?.pseudo === pseudo
        ? (pairing.player_b?.pseudo ?? null)
        : (pairing.player_a?.pseudo ?? null)
      : null;

  const remaining = playersLeft - 1;

  async function handleDrop() {
    if (!supabase) return;
    setBusy(true);
    setFailed(false);
    const { error } = await supabase.rpc('drop_player', {
      p_registration_id: registrationId,
      p_dropped: true,
      p_forfeit: needsDecision && forfeit,
    });
    setBusy(false);
    if (error) {
      setFailed(true);
      return;
    }
    onDropped(needsDecision && forfeit, opponent, pairing?.table_number ?? null);
  }

  return (
    <Modal title={`Déclarer l’abandon de « ${pseudo} » ?`} locked={busy} onClose={onCancel}>
      <p style={{ margin: 0 }}>
        {pseudo} garde les résultats des {roundNumber} ronde{roundNumber > 1 ? 's' : ''} déjà
        jouée{roundNumber > 1 ? 's' : ''} : elles restent au classement. Il ne sera plus apparié à
        partir de la ronde {roundNumber + 1}.
      </p>

      {isBye ? (
        <div className="banner banner-info">
          {pseudo} avait le bye à la ronde {roundNumber} : la victoire 15 – 5 est conservée.
        </div>
      ) : scored && pairing ? (
        <div className="banner banner-info">
          Le score de la table {pairing.table_number} ({pairing.player_a?.pseudo}{' '}
          {pairing.score_a} – {pairing.score_b} {pairing.player_b?.pseudo}) est déjà saisi : il est
          conservé tel quel.
        </div>
      ) : needsDecision && pairing ? (
        <div className="banner banner-info banner-info-danger">
          <strong>
            {opponent} attend à la table {pairing.table_number}.
          </strong>{' '}
          Cette table n’a pas encore de score : choisissez ce qui a été joué.
          <label
            className="field"
            style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 12 }}>
            <input
              type="radio"
              name="forfeit"
              checked={forfeit}
              onChange={() => setForfeit(true)}
            />
            <span>
              La partie n’a pas été jouée — forfait
              <div className="field-hint">
                {opponent} l’emporte 15 – 5, comme pour un bye. Le score est enregistré tout de
                suite : la ronde pourra être clôturée.
              </div>
            </span>
          </label>
          <label
            className="field"
            style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <input
              type="radio"
              name="forfeit"
              checked={!forfeit}
              onChange={() => setForfeit(false)}
            />
            <span>
              La partie a été jouée — je saisis le score
              <div className="field-hint">
                L’abandon est enregistré, la table reste à saisir dans le tableau.
              </div>
            </span>
          </label>
        </div>
      ) : null}

      <div className="field-hint">
        Après cet abandon, il restera <strong>{remaining} joueurs en lice</strong>.
        {remaining % 2 === 1
          ? ' Le nombre devient impair : un joueur aura le bye à chaque ronde suivante.'
          : ''}
      </div>

      <p style={{ margin: 0 }}>
        Vous pourrez le réintégrer tant que le tournoi n’est pas terminé. Les rondes déjà
        générées, elles, ne seront pas refaites.
      </p>

      {failed ? (
        <div className="banner banner-danger">
          Impossible d’enregistrer l’abandon. Vérifiez votre connexion et réessayez.
        </div>
      ) : null}

      <div className="modal-actions">
        <button className="btn btn-secondary" disabled={busy} onClick={onCancel}>
          Conserver le joueur
        </button>
        <button className="btn btn-danger" disabled={busy} onClick={handleDrop}>
          {busy ? 'Enregistrement…' : failed ? 'Réessayer' : 'Déclarer l’abandon'}
        </button>
      </div>
    </Modal>
  );
}
