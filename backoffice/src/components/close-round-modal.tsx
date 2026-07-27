import { useState } from 'react';

import { Modal } from './modal';
import type { Pairing } from '../hooks/use-rounds';
import { supabase } from '../lib/supabase';

/** Ce que la base renvoie après une clôture réussie. */
export type CloseResult = {
  next_round_number: number | null;
  tables_count: number;
  bye_pseudo: string | null;
  rematch_tables: number[];
};

type Props = {
  tournamentId: string;
  roundNumber: number;
  /** Nombre de rondes prévues : la dernière se clôt sans en générer d'autre. */
  roundsCount: number;
  pairings: Pairing[];
  /** Répartition par nombre de victoires, calculée côté page. */
  groups: { wins: number; count: number }[];
  playersLeft: number;
  onCancel: () => void;
  onClosed: (result: CloseResult) => void;
  /** Ouvre la saisie des tactiques manquantes. */
  onFixTactics: () => void;
};

/** Un score total inhabituel trahit souvent une faute de frappe. */
function isUnusual(pairing: Pairing): boolean {
  if (pairing.score_a === null || pairing.score_b === null) return false;
  return pairing.score_a > 80 || pairing.score_b > 80;
}

export function CloseRoundModal({
  tournamentId,
  roundNumber,
  roundsCount,
  pairings,
  groups,
  playersLeft,
  onCancel,
  onClosed,
  onFixTactics,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noPairing, setNoPairing] = useState(false);
  const [allowRematch, setAllowRematch] = useState(false);
  const [checkedTactics, setCheckedTactics] = useState(false);
  const [checkedUnusual, setCheckedUnusual] = useState(false);
  const [checkedFinal, setCheckedFinal] = useState(false);

  const isLast = roundNumber >= roundsCount;
  const real = pairings.filter((p) => p.player_b !== null);
  const bye = pairings.find((p) => p.player_b === null) ?? null;
  const wins = real.filter((p) => p.score_a !== p.score_b).length;
  const draws = real.filter((p) => p.score_a === p.score_b).length;
  const missingTactics = real.filter((p) => p.tactics_a === null || p.tactics_b === null);
  const unusual = real.filter(isUnusual);

  const nextTables = Math.floor(playersLeft / 2);
  const nextHasBye = playersLeft % 2 === 1;

  const ready =
    (missingTactics.length === 0 || checkedTactics) &&
    (unusual.length === 0 || checkedUnusual) &&
    (!isLast || checkedFinal) &&
    (!noPairing || allowRematch);

  async function handleClose() {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { data, error: dbError } = await supabase.rpc('generate_next_round', {
      p_tournament_id: tournamentId,
      p_allow_rematch: allowRematch,
    });
    setBusy(false);

    if (dbError) {
      const message = dbError.message ?? '';
      if (message.includes('NO_PAIRING_POSSIBLE')) {
        setNoPairing(true);
        setError(null);
      } else if (message.includes('ROUND_ALREADY_CLOSED')) {
        setError('already-closed');
      } else if (message.includes('MISSING_SCORES')) {
        setError('missing-scores');
      } else {
        setError('network');
      }
      return;
    }
    onClosed(data as CloseResult);
  }

  return (
    <Modal
      title={
        isLast
          ? `Clôturer la ronde ${roundNumber}, dernière du tournoi ?`
          : `Clôturer la ronde ${roundNumber} et générer la ronde ${roundNumber + 1} ?`
      }
      locked={busy}
      onClose={onCancel}>
      <p style={{ margin: 0 }}>
        {real.length} table{real.length > 1 ? 's' : ''} saisie{real.length > 1 ? 's' : ''} :{' '}
        {wins} victoire{wins > 1 ? 's' : ''}
        {draws > 0 ? `, ${draws} égalité${draws > 1 ? 's' : ''}` : ''}.
        {bye ? ` ${bye.player_a?.pseudo} avait le bye (15 – 5).` : ''}
      </p>

      <details className="details-section" open={unusual.length > 0} style={{ marginTop: 0 }}>
        <summary>Revoir les {real.length} résultats</summary>
        <div style={{ maxHeight: 240, overflowY: 'auto', marginTop: 12 }}>
          {real.map((pairing) => {
            const alerte = isUnusual(pairing);
            return (
              <div
                key={pairing.id}
                style={{ padding: '4px 0', color: alerte ? 'var(--danger)' : undefined }}>
                Table {pairing.table_number} — {pairing.player_a?.pseudo} {pairing.score_a} –{' '}
                {pairing.score_b} {pairing.player_b?.pseudo}
                <div className="checkin-meta">
                  {pairing.score_a === pairing.score_b
                    ? 'Égalité'
                    : `Victoire ${
                        (pairing.score_a ?? 0) > (pairing.score_b ?? 0)
                          ? pairing.player_a?.pseudo
                          : pairing.player_b?.pseudo
                      }`}
                </div>
              </div>
            );
          })}
        </div>
      </details>

      {isLast ? (
        <div className="banner banner-info">
          C’est la dernière des {roundsCount} rondes prévues : aucune ronde ne sera générée. Le
          classement deviendra le classement final.
        </div>
      ) : (
        <>
          <div className="banner banner-info">
            <strong>Ronde {roundNumber + 1}</strong> : {nextTables} table
            {nextTables > 1 ? 's' : ''}
            {nextHasBye ? ', plus un joueur exempt' : ''}. Les joueurs seront appariés à
            l’intérieur de leur groupe de score
            {groups.length > 0
              ? ` : ${groups
                  .map(
                    (g) =>
                      `${g.count} à ${g.wins.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} V`
                  )
                  .join(', ')}`
              : ''}
            . Deux joueurs ne se rencontrent jamais deux fois.
          </div>
          <div className="field-hint">
            Les appariements eux-mêmes sont calculés à la validation : ils s’afficheront aussitôt.
          </div>
        </>
      )}

      {missingTactics.length > 0 ? (
        <div className="banner banner-info banner-info-danger">
          Les tactiques ne sont pas saisies sur {missingTactics.length} table
          {missingTactics.length > 1 ? 's' : ''}. Le 3e critère de départage ne pourra pas
          s’appliquer à ces joueurs, et ce sera définitif pour cette ronde.
          <div style={{ marginTop: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={onFixTactics}>
              Compléter les tactiques
            </button>
          </div>
        </div>
      ) : null}

      <p style={{ margin: 0 }}>
        {isLast
          ? 'Les scores de cette ronde seront figés définitivement.'
          : `Une fois la ronde clôturée, ses scores sont figés : la ronde ${roundNumber + 1} en découle directement.`}{' '}
        <strong>Vous ne pourrez pas revenir en arrière.</strong>
      </p>

      {missingTactics.length > 0 ? (
        <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={checkedTactics}
            onChange={(event) => setCheckedTactics(event.target.checked)}
          />
          <span>
            J’ai vérifié : les tactiques manquantes sur ces {missingTactics.length} table
            {missingTactics.length > 1 ? 's' : ''} ne seront pas rattrapables.
          </span>
        </label>
      ) : null}

      {unusual.length > 0 ? (
        <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={checkedUnusual}
            onChange={(event) => setCheckedUnusual(event.target.checked)}
          />
          <span>
            J’ai vérifié la feuille des {unusual.length} table
            {unusual.length > 1 ? 's' : ''} au score inhabituel.
          </span>
        </label>
      ) : null}

      {isLast ? (
        <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={checkedFinal}
            onChange={(event) => setCheckedFinal(event.target.checked)}
          />
          <span>J’ai vérifié : tous les résultats du tournoi sont exacts.</span>
        </label>
      ) : null}

      {/* Aucun appariement possible sans revanche : on laisse l'organisateur trancher. */}
      {noPairing ? (
        <div className="banner banner-danger">
          <strong>
            Impossible d’apparier la ronde {roundNumber + 1} sans rejouer un match déjà joué.
          </strong>
          <div style={{ marginTop: 4 }}>
            Avec {playersLeft} joueurs et {roundNumber} ronde{roundNumber > 1 ? 's' : ''} jouée
            {roundNumber > 1 ? 's' : ''}, toutes les combinaisons restantes ont déjà eu lieu. C’est
            fréquent en fin de tournoi sur un petit effectif.
          </div>
          <label
            className="field"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <input
              type="checkbox"
              checked={allowRematch}
              onChange={(event) => setAllowRematch(event.target.checked)}
            />
            <span>Autoriser un match retour pour la ronde {roundNumber + 1}.</span>
          </label>
          <div className="field-hint">
            Vous pouvez aussi réduire le nombre de rondes prévues dans les réglages du tournoi.
          </div>
        </div>
      ) : null}

      {error === 'already-closed' ? (
        <div className="banner banner-danger">
          Cette ronde a déjà été clôturée, peut-être depuis un autre appareil.
        </div>
      ) : null}
      {error === 'missing-scores' ? (
        <div className="banner banner-danger">
          Une table n’a plus de score côté serveur. La ronde ne peut pas être clôturée.
        </div>
      ) : null}
      {error === 'network' ? (
        <div className="banner banner-danger">
          La ronde n’a pas pu être clôturée. Vérifiez votre connexion et réessayez.
        </div>
      ) : null}

      <div className="modal-actions">
        <button className="btn btn-secondary" disabled={busy} onClick={onCancel}>
          Revenir aux scores
        </button>
        <button className="btn btn-primary" disabled={busy || !ready} onClick={handleClose}>
          {busy
            ? isLast
              ? 'Clôture…'
              : 'Génération…'
            : error
              ? 'Réessayer'
              : noPairing
                ? `Clôturer et générer avec un match retour`
                : isLast
                  ? 'Clôturer la dernière ronde'
                  : `Clôturer et générer la ronde ${roundNumber + 1}`}
        </button>
      </div>
    </Modal>
  );
}
