import { useState } from 'react';

import { Modal } from './modal';
import { supabase } from '../lib/supabase';

type Props = {
  tournamentId: string;
  /** Joueurs pointés présents : ce sont eux qui seront appariés. */
  presentCount: number;
  /** Pseudos des inscrits non pointés, qui vont être écartés. */
  absentNames: string[];
  /** Libellé du bouton secondaire, selon la page d'où l'on vient. */
  cancelLabel: string;
  onCancel: () => void;
  /** Le scénario saisi est remonté à la page, qui l'écrit après coup. */
  onLaunched: (scenario: string) => void;
};

/**
 * Confirmation du lancement. Le tournoi devient irréversiblement « en cours »,
 * donc la modale nomme les joueurs qui seront écartés et, s'il y en a,
 * demande une case à cocher.
 */
export function LaunchTournamentModal({
  tournamentId,
  presentCount,
  absentNames,
  cancelLabel,
  onCancel,
  onLaunched,
}: Props) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [scenario, setScenario] = useState('');

  const tables = Math.floor(presentCount / 2);
  const isOdd = presentCount % 2 === 1;
  const absentCount = absentNames.length;
  const shownNames = absentNames.slice(0, 5).join(', ');
  const extraNames = absentCount > 5 ? ` … et ${absentCount - 5} autres.` : '';

  async function handleLaunch() {
    if (!supabase) return;
    setBusy(true);
    setFailed(false);
    const { error } = await supabase.rpc('start_tournament', {
      p_tournament_id: tournamentId,
    });
    setBusy(false);

    if (error) {
      setFailed(true);
      return;
    }
    onLaunched(scenario);
  }

  return (
    <Modal
      title="Lancer le tournoi et générer la ronde 1 ?"
      locked={busy}
      onClose={onCancel}>
      <p style={{ margin: 0 }}>
        {presentCount} joueur{presentCount > 1 ? 's' : ''} pointé
        {presentCount > 1 ? 's' : ''} présent{presentCount > 1 ? 's' : ''} ser
        {presentCount > 1 ? 'ont' : 'a'} apparié{presentCount > 1 ? 's' : ''} au hasard sur{' '}
        {tables} table{tables > 1 ? 's' : ''}.
      </p>

      {isOdd ? (
        <div className="banner banner-info">
          Le nombre de présents est impair : un joueur sera tiré au sort pour être exempt (bye).
          Il remporte automatiquement la ronde 15 points de partie contre 5.
        </div>
      ) : null}

      {absentCount > 0 ? (
        <div className="banner banner-info banner-info-danger">
          {absentCount} joueur{absentCount > 1 ? 's' : ''} non pointé
          {absentCount > 1 ? 's' : ''} ser{absentCount > 1 ? 'ont' : 'a'} écarté
          {absentCount > 1 ? 's' : ''} du tournoi : {shownNames}
          {extraNames}
        </div>
      ) : null}

      <label className="field">
        <span>Scénario de la ronde 1 (facultatif)</span>
        <input
          type="text"
          maxLength={80}
          placeholder="ex. Focal Points"
          value={scenario}
          disabled={busy}
          onChange={(event) => setScenario(event.target.value)}
        />
        <span className="field-hint">
          Affiché aux joueurs dans l’app. Modifiable ensuite depuis la page Rondes.
        </span>
      </label>

      <p style={{ margin: 0 }}>
        Une fois le tournoi lancé, les inscriptions et le pointage sont figés.{' '}
        <strong>Vous ne pourrez pas revenir en arrière.</strong>
      </p>

      {absentCount > 0 ? (
        <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
          />
          <span>
            {absentCount > 1
              ? `J’ai vérifié : ces ${absentCount} joueurs sont bien absents.`
              : 'J’ai vérifié : ce joueur est bien absent.'}
          </span>
        </label>
      ) : null}

      {failed ? (
        <div className="banner banner-danger">
          Impossible de lancer le tournoi. Vérifiez votre connexion et réessayez.
        </div>
      ) : null}

      <div className="modal-actions">
        <button className="btn btn-secondary" disabled={busy} onClick={onCancel}>
          {cancelLabel}
        </button>
        <button
          className="btn btn-primary"
          disabled={busy || (absentCount > 0 && !checked)}
          onClick={handleLaunch}>
          {busy ? 'Lancement…' : failed ? 'Réessayer' : 'Lancer le tournoi'}
        </button>
      </div>
    </Modal>
  );
}
