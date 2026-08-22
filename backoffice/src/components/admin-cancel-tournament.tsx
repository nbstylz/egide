import { useState } from 'react';

import { Modal } from './modal';
import {
  adminCancelTournament,
  useAdminCancellation,
  type AdminCancellation,
} from '../hooks/use-admin';
import type { TournamentWithCount } from '../hooks/use-my-tournaments';
import { flushPushQueue } from '../lib/push';
import { formatDateNumeric } from '../lib/tournaments';

/** Longueur minimale du motif — la même qu'en base (migration 0031). */
const MinReason = 10;

type Props = {
  tournament: TournamentWithCount;
  onCancelled: () => void;
  onToast: (message: string) => void;
};

/**
 * Zone de danger de la fiche d'administration.
 *
 * Volontairement tout en bas, et jamais dans le tableau : il faut avoir
 * parcouru la fiche — donc avoir vu de quel tournoi et de quel organisateur
 * il s'agit — pour arriver ici. C'est la friction recherchée.
 */
export function AdminCancelTournament({ tournament, onCancelled, onToast }: Props) {
  const { cancellation } = useAdminCancellation(
    tournament.id,
    tournament.status === 'cancelled'
  );
  const [open, setOpen] = useState(false);

  return (
    <div className="danger-zone">
      <div className="danger-zone-title">Zone de danger — administration</div>

      {tournament.status === 'completed' ? (
        <p className="danger-zone-note">
          Ce tournoi est terminé : il ne peut plus être annulé. Son classement fait foi pour les
          joueurs qui l’ont disputé.
        </p>
      ) : tournament.status === 'cancelled' ? (
        <CancelledNote cancellation={cancellation} />
      ) : (
        <div className="danger-zone-row">
          <p>
            Annuler ce tournoi le retirera des recherches, préviendra{' '}
            {tournament.registered_count > 0
              ? `les ${tournament.registered_count} joueur${
                  tournament.registered_count > 1 ? 's' : ''
                } inscrit${tournament.registered_count > 1 ? 's' : ''}`
              : 'son organisateur'}
            , et sera consigné dans le journal d’administration avec votre motif.
          </p>
          {/* Outline et non plein : le rouge plein appelle le clic. */}
          <button className="btn btn-danger-outline" onClick={() => setOpen(true)}>
            Annuler ce tournoi
          </button>
        </div>
      )}

      {open ? (
        <CancelModal
          tournament={tournament}
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            onToast('Tournoi annulé. L’action a été consignée dans le journal.');
            onCancelled();
          }}
        />
      ) : null}
    </div>
  );
}

function CancelledNote({ cancellation }: { cancellation: AdminCancellation | null }) {
  if (!cancellation) {
    // Annulé par son organisateur, pas par l'administration : rien à raconter.
    return (
      <p className="danger-zone-note">
        Ce tournoi est annulé. Aucune annulation administrative n’est consignée à son sujet.
      </p>
    );
  }
  return (
    <p className="danger-zone-note">
      Annulé par l’administration le {formatDateNumeric(cancellation.created_at)}
      {cancellation.admin_pseudo ? ` par ${cancellation.admin_pseudo}` : ''}.
      <br />
      Motif : {cancellation.reason}
    </p>
  );
}

function CancelModal({
  tournament,
  onClose,
  onDone,
}: {
  tournament: TournamentWithCount;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const running = tournament.status === 'in_progress';
  const tooShort = reason.trim().length < MinReason;
  // Une friction, pas deux : le motif partout, la case seulement pour un
  // tournoi en cours de jeu. Empiler les obstacles produit un automatisme.
  const blocked = tooShort || (running && !understood);

  async function submit() {
    setBusy(true);
    setFailure(null);
    const result = await adminCancelTournament(tournament.id, reason.trim());
    setBusy(false);
    if (!result.ok) {
      setFailure(result.message);
      return;
    }
    // Les inscrits doivent l'apprendre : on pousse la file sans attendre.
    flushPushQueue();
    onDone();
  }

  return (
    <Modal title={`Annuler « ${tournament.name} » ?`} onClose={onClose} locked={busy}>
      <p style={{ marginTop: 0 }}>
        Le tournoi passera au statut <strong>Annulé</strong>.{' '}
        {tournament.registered_count > 0 ? (
          <>
            Les <strong>{tournament.registered_count} joueurs inscrits</strong> recevront une
            notification.{' '}
          </>
        ) : null}
        L’organisateur ne pourra pas revenir en arrière. <strong>Cette action est
        irréversible.</strong>
      </p>

      <label className="drawer-reject-label" htmlFor="admin-cancel-reason">
        Motif de l’annulation (obligatoire)
      </label>
      <textarea
        id="admin-cancel-reason"
        className="input drawer-reject-input"
        rows={3}
        placeholder="Ex. : événement fictif, organisateur injoignable depuis trois semaines."
        value={reason}
        disabled={busy}
        onChange={(event) => setReason(event.target.value)}
        onBlur={() => setTouched(true)}
      />
      <div className="field-hint">
        Conservé dans le journal d’administration et envoyé aux inscrits. Restez factuel : ce
        texte fait foi.
      </div>
      {/* L'erreur apparaît quand on quitte le champ, pas au clic sur le bouton. */}
      {touched && tooShort ? (
        <div className="field-error">
          Un motif d’au moins {MinReason} caractères est obligatoire.
        </div>
      ) : null}

      {running ? (
        <label className="checkbox-row" style={{ marginTop: 'var(--sp-3)' }}>
          <input
            type="checkbox"
            checked={understood}
            disabled={busy}
            onChange={(event) => setUnderstood(event.target.checked)}
          />
          <span>
            Je comprends que ce tournoi est en cours de jeu et que les résultats déjà saisis
            seront figés.
          </span>
        </label>
      ) : null}

      {failure ? (
        <div className="banner banner-danger" style={{ marginTop: 'var(--sp-3)' }}>
          {failure}
        </div>
      ) : null}

      <div className="modal-actions">
        {/* Le bouton sûr d'abord dans le DOM : la modale y pose le focus, et
            une frappe réflexe sur Entrée conserve le tournoi. */}
        <button className="btn btn-secondary" disabled={busy} onClick={onClose}>
          Conserver le tournoi
        </button>
        <button className="btn btn-danger" disabled={busy || blocked} onClick={submit}>
          {busy ? 'Annulation…' : 'Annuler le tournoi'}
        </button>
      </div>
    </Modal>
  );
}
