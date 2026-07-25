import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { Modal } from '../components/modal';
import { StatusBadge } from '../components/status-badge';
import { Toast } from '../components/toast';
import type { TournamentWithCount } from '../hooks/use-my-tournaments';
import { supabase } from '../lib/supabase';
import {
  CancellableStatuses,
  EditableStatuses,
  formatEventDate,
  TypeLabels,
} from '../lib/tournaments';

const PointsPresets = [1000, 1500, 2000];

type Props = {
  tournament: TournamentWithCount | null;
  loading: boolean;
  error: boolean;
  /** Identifiant du compte connecté : seule l'organisateur accède à la gestion. */
  userId: string;
  onChanged: () => void;
};

/** Message du bandeau lecture seule selon le statut. */
function readonlyMessage(status: string): string {
  if (status === 'in_progress') {
    return 'Ce tournoi est en cours : ses paramètres ne sont plus modifiables.';
  }
  if (status === 'completed') {
    return 'Ce tournoi est terminé : ses paramètres ne sont plus modifiables.';
  }
  return 'Ce tournoi a été annulé.';
}

export function TournoiDetailPage({ tournament, loading, error, userId, onChanged }: Props) {
  const editable = tournament ? EditableStatuses.includes(tournament.status) : false;
  const cancellable = tournament ? CancellableStatuses.includes(tournament.status) : false;

  // Champs du formulaire (initialisés depuis le tournoi chargé).
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [date, setDate] = useState('');
  const [pointsChip, setPointsChip] = useState<number | 'other'>(2000);
  const [customPoints, setCustomPoints] = useState('');
  const [rounds, setRounds] = useState(5);
  const [capacity, setCapacity] = useState(32);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [cancelModal, setCancelModal] = useState(false);
  const [cancelInput, setCancelInput] = useState('');
  const [cancelError, setCancelError] = useState(false);

  useEffect(() => {
    if (!tournament) return;
    setName(tournament.name);
    setCity(tournament.city);
    setRegion(tournament.region ?? '');
    setDate(tournament.event_date);
    if (PointsPresets.includes(tournament.points_limit)) {
      setPointsChip(tournament.points_limit);
      setCustomPoints('');
    } else {
      setPointsChip('other');
      setCustomPoints(String(tournament.points_limit));
    }
    setRounds(tournament.rounds_count);
    setCapacity(tournament.capacity);
    setErrors({});
  }, [tournament]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="skeleton" style={{ height: 32, maxWidth: 320 }} />
        <div className="skeleton" style={{ height: 400, maxWidth: 560 }} />
      </div>
    );
  }

  // La lecture du tournoi est publique (RLS), mais la gestion est réservée
  // à l'organisateur : pour les autres, la fiche « n'existe pas ».
  if (error || !tournament || tournament.organizer_id !== userId) {
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

  const dirty =
    name !== tournament.name ||
    city !== tournament.city ||
    region !== (tournament.region ?? '') ||
    date !== tournament.event_date ||
    (pointsChip === 'other' ? parseInt(customPoints, 10) : pointsChip) !==
      tournament.points_limit ||
    rounds !== tournament.rounds_count ||
    capacity !== tournament.capacity;

  function resetForm() {
    if (!tournament) return;
    setName(tournament.name);
    setCity(tournament.city);
    setRegion(tournament.region ?? '');
    setDate(tournament.event_date);
    if (PointsPresets.includes(tournament.points_limit)) {
      setPointsChip(tournament.points_limit);
      setCustomPoints('');
    } else {
      setPointsChip('other');
      setCustomPoints(String(tournament.points_limit));
    }
    setRounds(tournament.rounds_count);
    setCapacity(tournament.capacity);
    setErrors({});
    setSaveError(false);
  }

  async function handleSave() {
    if (!supabase || !tournament) return;

    const nextErrors: Record<string, string> = {};
    if (name.trim().length < 3) nextErrors.name = 'Le nom est obligatoire (3 caractères min.).';
    if (city.trim() === '') nextErrors.city = 'Indique la ville du tournoi.';
    const today = new Date().toISOString().slice(0, 10);
    if (!date) {
      nextErrors.date = 'Date invalide.';
    } else if (date !== tournament.event_date && date < today) {
      // On ne bloque que si la date a été modifiée vers le passé.
      nextErrors.date = 'La date doit être dans le futur.';
    }
    const points = pointsChip === 'other' ? parseInt(customPoints, 10) : pointsChip;
    if (!points || points <= 0) nextErrors.points = 'Indique un nombre de points valide.';
    if (rounds < 1 || rounds > 8) nextErrors.rounds = 'Le nombre de rondes doit être entre 1 et 8.';
    if (capacity < 4 || capacity > 200 || capacity % 2 !== 0) {
      nextErrors.capacity = 'La capacité doit être un nombre pair entre 4 et 200.';
    } else if (capacity < tournament.registered_count) {
      nextErrors.capacity = `La capacité ne peut pas être inférieure au nombre d’inscrits actuels (${tournament.registered_count}).`;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setBusy(true);
    setSaveError(false);
    const { error: dbError } = await supabase
      .from('tournaments')
      .update({
        name: name.trim(),
        city: city.trim(),
        region: region.trim() || null,
        event_date: date,
        points_limit: points,
        rounds_count: rounds,
        capacity,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tournament.id);
    setBusy(false);

    if (dbError) {
      setSaveError(true);
    } else {
      setToast('Modifications enregistrées.');
      onChanged();
    }
  }

  async function handleCancelTournament() {
    if (!supabase || !tournament) return;
    setBusy(true);
    setCancelError(false);
    const { error: dbError } = await supabase
      .from('tournaments')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', tournament.id);
    setBusy(false);

    if (dbError) {
      setCancelError(true);
    } else {
      setCancelModal(false);
      setCancelInput('');
      setToast('Le tournoi a été annulé.');
      onChanged();
    }
  }

  const hasActiveRegistrations = tournament.registered_count > 0;
  const cancelConfirmed =
    !hasActiveRegistrations || cancelInput.trim().toUpperCase() === 'ANNULER';

  function fieldError(key: string) {
    return errors[key] ? <div className="field-error">{errors[key]}</div> : null;
  }

  const updatedAt = new Date(tournament.updated_at).toLocaleString('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'inline' }}>
            {tournament.name}
          </h1>{' '}
          <StatusBadge status={tournament.status} />
          <div className="page-subtitle">Dernière modification le {updatedAt}</div>
        </div>
      </div>

      {!editable ? (
        <div
          className={`banner banner-info${tournament.status === 'cancelled' ? ' banner-info-danger' : ''}`}
          style={{ marginTop: 24, maxWidth: 560 }}>
          🔒 {readonlyMessage(tournament.status)}
        </div>
      ) : null}

      {editable ? (
        <div className="form-column">
          <div className="group-title">Informations</div>

          <div className="field">
            <label htmlFor="name">Nom du tournoi</label>
            <input
              id="name"
              className={`input${errors.name ? ' input-error' : ''}`}
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              disabled={busy}
            />
            {fieldError('name')}
          </div>

          <div className="field">
            <label htmlFor="city">Ville</label>
            <input
              id="city"
              className={`input${errors.city ? ' input-error' : ''}`}
              value={city}
              onChange={(event) => setCity(event.target.value)}
              disabled={busy}
            />
            {fieldError('city')}
          </div>

          <div className="field">
            <label htmlFor="region">Région (optionnel)</label>
            <input
              id="region"
              className="input"
              value={region}
              onChange={(event) => setRegion(event.target.value)}
              disabled={busy}
            />
          </div>

          <div className="field">
            <label htmlFor="date">Date</label>
            <input
              id="date"
              type="date"
              className={`input${errors.date ? ' input-error' : ''}`}
              value={date}
              onChange={(event) => setDate(event.target.value)}
              disabled={busy}
            />
            {fieldError('date')}
          </div>

          <div className="group-title">Format</div>

          <div className="field">
            <label>Type de tournoi</label>
            <div className="segmented">
              <button type="button" className="active">
                Individuel
              </button>
              <button type="button" disabled>
                Équipe <span className="badge-soon">Bientôt</span>
              </button>
            </div>
          </div>

          <div className="field">
            <label>Points de liste</label>
            <div className="chips">
              {PointsPresets.map((points) => (
                <button
                  key={points}
                  type="button"
                  className={pointsChip === points ? 'active' : ''}
                  onClick={() => setPointsChip(points)}
                  disabled={busy}>
                  {points}
                </button>
              ))}
              <button
                type="button"
                className={pointsChip === 'other' ? 'active' : ''}
                onClick={() => setPointsChip('other')}
                disabled={busy}>
                Autre
              </button>
            </div>
            {pointsChip === 'other' ? (
              <input
                className={`input${errors.points ? ' input-error' : ''}`}
                type="number"
                placeholder="Points de liste (ex. 1250)"
                value={customPoints}
                onChange={(event) => setCustomPoints(event.target.value)}
                disabled={busy}
                style={{ marginTop: 8, maxWidth: 240 }}
              />
            ) : null}
            {fieldError('points')}
          </div>

          <div className="field">
            <label>Nombre de rondes</label>
            <div className="stepper">
              <button type="button" onClick={() => setRounds((v) => Math.max(1, v - 1))} disabled={busy}>
                −
              </button>
              <input
                className="input"
                value={rounds}
                onChange={(event) => setRounds(parseInt(event.target.value, 10) || 1)}
                disabled={busy}
              />
              <button type="button" onClick={() => setRounds((v) => Math.min(8, v + 1))} disabled={busy}>
                +
              </button>
            </div>
            {fieldError('rounds')}
          </div>

          <div className="group-title">Capacité</div>

          <div className="field">
            <label>Nombre de joueurs maximum</label>
            <div className="stepper">
              <button
                type="button"
                onClick={() => setCapacity((v) => Math.max(4, v - 2))}
                disabled={busy}>
                −
              </button>
              <input
                className="input"
                value={capacity}
                onChange={(event) => setCapacity(parseInt(event.target.value, 10) || 4)}
                disabled={busy}
              />
              <button
                type="button"
                onClick={() => setCapacity((v) => Math.min(200, v + 2))}
                disabled={busy}>
                +
              </button>
            </div>
            {errors.capacity ? (
              <div className="field-error">{errors.capacity}</div>
            ) : (
              <div className="field-hint">Un nombre pair évite les rondes avec exempt (bye).</div>
            )}
          </div>

          {saveError ? (
            <div className="banner banner-danger">
              Impossible d’enregistrer. Vérifiez votre connexion et réessayez.
            </div>
          ) : null}

          <div className="save-bar">
            <button className="btn btn-primary" onClick={handleSave} disabled={busy || !dirty}>
              {busy ? 'Enregistrement…' : 'Enregistrer les modifications'}
            </button>
            {dirty ? (
              <button className="btn btn-secondary" onClick={resetForm} disabled={busy}>
                Annuler les modifications
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="form-column readonly-list">
          <div className="group-title">Informations</div>
          <div className="row">
            <span className="label">Nom du tournoi</span>
            <span>{tournament.name}</span>
          </div>
          <div className="row">
            <span className="label">Ville</span>
            <span>{tournament.city}</span>
          </div>
          <div className="row">
            <span className="label">Région</span>
            <span>{tournament.region ?? '—'}</span>
          </div>
          <div className="row">
            <span className="label">Date</span>
            <span>{formatEventDate(tournament.event_date)}</span>
          </div>
          <div className="group-title">Format</div>
          <div className="row">
            <span className="label">Type</span>
            <span>{TypeLabels[tournament.type]}</span>
          </div>
          <div className="row">
            <span className="label">Points de liste</span>
            <span>{tournament.points_limit} points</span>
          </div>
          <div className="row">
            <span className="label">Nombre de rondes</span>
            <span>{tournament.rounds_count}</span>
          </div>
          <div className="group-title">Capacité</div>
          <div className="row">
            <span className="label">Joueurs</span>
            <span>
              {tournament.registered_count} inscrit{tournament.registered_count > 1 ? 's' : ''} /{' '}
              {tournament.capacity} places
            </span>
          </div>
        </div>
      )}

      {cancellable ? (
        <div className="danger-zone">
          <div className="danger-zone-title">Zone de danger</div>
          <div className="danger-zone-row">
            <p>
              Annuler ce tournoi le retirera des recherches et préviendra les inscrits. Cette
              action est définitive.
            </p>
            <button className="btn btn-danger-outline" onClick={() => setCancelModal(true)}>
              Annuler le tournoi
            </button>
          </div>
        </div>
      ) : null}

      {cancelModal ? (
        <Modal
          title={`Annuler « ${tournament.name} » ?`}
          onClose={() => {
            setCancelModal(false);
            setCancelInput('');
          }}>
          <p style={{ margin: 0 }}>
            Le tournoi passera au statut Annulé.
            {hasActiveRegistrations
              ? tournament.registered_count > 1
                ? ` Les ${tournament.registered_count} joueurs inscrits ne pourront plus s’y inscrire ni le retrouver dans les recherches.`
                : ' Le joueur inscrit ne pourra plus s’y inscrire ni le retrouver dans les recherches.'
              : ''}{' '}
            <strong>Cette action est irréversible.</strong>
          </p>
          {hasActiveRegistrations ? (
            <div className="field">
              <label htmlFor="cancel-confirm">
                Pour confirmer, tapez <strong>ANNULER</strong> ci-dessous.
              </label>
              <input
                id="cancel-confirm"
                className="input"
                value={cancelInput}
                onChange={(event) => setCancelInput(event.target.value)}
              />
            </div>
          ) : null}
          {cancelError ? (
            <div className="banner banner-danger">
              Impossible d’annuler le tournoi. Vérifiez votre connexion et réessayez.
            </div>
          ) : null}
          <div className="modal-actions">
            <button
              className="btn btn-secondary"
              onClick={() => {
                setCancelModal(false);
                setCancelInput('');
              }}>
              Conserver le tournoi
            </button>
            <button
              className="btn btn-danger"
              disabled={!cancelConfirmed || busy}
              onClick={handleCancelTournament}>
              {busy ? 'Annulation…' : 'Annuler définitivement le tournoi'}
            </button>
          </div>
        </Modal>
      ) : null}

      {toast ? <Toast message={toast} onDone={() => setToast(null)} /> : null}
    </>
  );
}
