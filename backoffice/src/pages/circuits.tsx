import { useMemo, useState } from 'react';

import { Modal } from '../components/modal';
import {
  createCircuit,
  useCircuits,
  useCircuitStandings,
  useTournamentRegions,
  type Circuit,
} from '../hooks/use-circuits';

type Props = {
  userId: string;
};

/** Nombre à la française, sans décimale inutile. */
function num(value: number | string): string {
  return Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}

/** « 12 sept. 2026 » à partir d'une date ISO. */
function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function scopeLabel(region: string | null): string {
  return region ?? 'National';
}

export function CircuitsPage({ userId }: Props) {
  const { circuits, loading, error, refresh } = useCircuits();
  const regions = useTournamentRegions();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createModal, setCreateModal] = useState(false);

  const selected = useMemo(
    () => circuits.find((c) => c.id === selectedId) ?? null,
    [circuits, selectedId]
  );

  const header = (
    <div className="page-header">
      <div>
        <h1 className="page-title">Circuits</h1>
        <div className="page-subtitle">
          Classements de saison agrégés à partir des tournois terminés.
        </div>
      </div>
      {!loading && circuits.length > 0 ? (
        <button className="btn btn-primary" onClick={() => setCreateModal(true)}>
          + Créer un circuit
        </button>
      ) : null}
    </div>
  );

  let body;
  if (loading) {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 24 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton" style={{ height: 52 }} />
        ))}
      </div>
    );
  } else if (error) {
    body = (
      <div className="empty-state">
        <p>Impossible de charger les circuits.</p>
        <button className="btn btn-secondary" onClick={refresh}>
          Réessayer
        </button>
      </div>
    );
  } else if (circuits.length === 0) {
    body = (
      <div className="empty-state">
        <h2>Aucun circuit pour l’instant</h2>
        <p>
          Un circuit agrège automatiquement les résultats des tournois individuels terminés
          d’une saison (et d’une région, si vous en choisissez une) en un classement de saison.
        </p>
        <button className="btn btn-primary" onClick={() => setCreateModal(true)}>
          + Créer un circuit
        </button>
      </div>
    );
  } else {
    body = (
      <table className="table">
        <thead>
          <tr>
            <th>Nom</th>
            <th style={{ width: 110 }}>Saison</th>
            <th className="hide-narrow" style={{ width: 200 }}>
              Portée
            </th>
            <th className="hide-narrow" style={{ width: 200 }}>
              Période
            </th>
            <th style={{ width: 90 }} title="Nombre de meilleurs résultats retenus par joueur">
              Best-N
            </th>
          </tr>
        </thead>
        <tbody>
          {circuits.map((circuit) => (
            <tr
              key={circuit.id}
              className={circuit.id === selectedId ? 'row-highlight' : ''}
              onClick={() => setSelectedId(circuit.id)}
              style={{ cursor: 'pointer' }}>
              <td className="cell-name">{circuit.name}</td>
              <td>{circuit.season}</td>
              <td className="hide-narrow">{scopeLabel(circuit.region)}</td>
              <td className="hide-narrow">
                {shortDate(circuit.start_date)} → {shortDate(circuit.end_date)}
              </td>
              <td>{circuit.best_n}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <>
      {header}
      {body}

      {selected ? (
        <CircuitStandings key={selected.id} circuit={selected} onClose={() => setSelectedId(null)} />
      ) : null}

      {createModal ? (
        <CreateCircuitModal
          userId={userId}
          regions={regions}
          onClose={() => setCreateModal(false)}
          onCreated={(id) => {
            setCreateModal(false);
            refresh();
            setSelectedId(id);
          }}
        />
      ) : null}
    </>
  );
}

/** Classement d'un circuit sélectionné, sous la liste. */
function CircuitStandings({ circuit, onClose }: { circuit: Circuit; onClose: () => void }) {
  const { standings, loading, error, refresh } = useCircuitStandings(circuit.id);

  return (
    <div style={{ marginTop: 40 }}>
      <div className="page-header">
        <div>
          <h2 className="section-title" style={{ marginTop: 0 }}>
            {circuit.name}
          </h2>
          <div className="page-subtitle">
            Saison {circuit.season} · {scopeLabel(circuit.region)} ·{' '}
            {shortDate(circuit.start_date)} → {shortDate(circuit.end_date)} · {circuit.best_n}{' '}
            meilleurs résultats
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={refresh}>
            Rafraîchir
          </button>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>

      <div className="banner banner-info" style={{ marginTop: 16, maxWidth: 720 }}>
        Barème « place pondérée par la taille » : sur chaque tournoi, un joueur marque{' '}
        <strong>(nombre de joueurs − son rang + 1)</strong> points. Seuls ses {circuit.best_n}{' '}
        meilleurs résultats de la saison comptent.
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 24 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton" style={{ height: 56 }} />
          ))}
        </div>
      ) : error ? (
        <div className="empty-state">
          <p>Impossible de calculer le classement.</p>
          <button className="btn btn-secondary" onClick={refresh}>
            Réessayer
          </button>
        </div>
      ) : standings.length === 0 ? (
        <div className="empty-state">
          <h2>Pas encore de classement</h2>
          <p>
            Aucun tournoi individuel terminé ne tombe encore dans cette saison
            {circuit.region ? ` pour la région ${circuit.region}` : ''}. Le classement se
            remplira dès qu’un tournoi éligible sera terminé.
          </p>
        </div>
      ) : (
        <table className="table table-static" style={{ marginTop: 16 }}>
          <thead>
            <tr>
              <th style={{ width: 64 }}>Rang</th>
              <th>Joueur</th>
              <th style={{ width: 90 }} title="Points de circuit cumulés">
                Points
              </th>
              <th className="hide-narrow" style={{ width: 110 }} title="Résultats comptés / joués">
                Comptés
              </th>
              <th className="hide-narrow" style={{ width: 90 }} title="Meilleur total sur un tournoi">
                Meilleur
              </th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s) => (
              <tr key={s.player_id}>
                <td>
                  <span className={`rank-cell${s.rank <= 3 ? ' top' : ''}`}>{s.rank}</span>
                </td>
                <td>
                  <div className="reg-cell">
                    <span className="reg-avatar">{s.pseudo.charAt(0).toUpperCase()}</span>
                    <span>
                      <span className="cell-name">{s.pseudo}</span>
                      <br />
                      <span className="checkin-meta">{s.region ?? '—'}</span>
                    </span>
                  </div>
                </td>
                <td>
                  <span className="rank-num strong">{num(s.circuit_points)}</span>
                </td>
                <td className="hide-narrow checkin-meta">
                  {s.tournaments_counted} / {s.tournaments_played}
                </td>
                <td className="hide-narrow">
                  <span className="rank-num">{s.best_result}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Formulaire de création d'un circuit. */
function CreateCircuitModal({
  userId,
  regions,
  onClose,
  onCreated,
}: {
  userId: string;
  regions: string[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const currentYear = new Date().getFullYear();
  const [name, setName] = useState('');
  const [season, setSeason] = useState(String(currentYear));
  const [region, setRegion] = useState<string>(''); // '' = national
  const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
  const [endDate, setEndDate] = useState(`${currentYear}-12-31`);
  const [bestN, setBestN] = useState(4);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const nameOk = name.trim().length >= 3 && name.trim().length <= 80;
  const datesOk = Boolean(startDate) && Boolean(endDate) && endDate >= startDate;
  const canSubmit = nameOk && season.trim() !== '' && datesOk && bestN >= 1 && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setFormError(null);
    const { data, error } = await createCircuit(userId, {
      name: name.trim(),
      season: season.trim(),
      region: region === '' ? null : region,
      start_date: startDate,
      end_date: endDate,
      best_n: bestN,
    });
    setSubmitting(false);
    if (error || !data) {
      setFormError(error ?? 'Création impossible.');
      return;
    }
    onCreated(data.id);
  }

  return (
    <Modal title="Créer un circuit" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <label>
          <div className="field-label">Nom</div>
          <input
            className="input input-lg"
            style={{ width: '100%' }}
            placeholder="Circuit AoS France 2026"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </label>

        <div style={{ display: 'flex', gap: 16 }}>
          <label style={{ flex: 1 }}>
            <div className="field-label">Saison</div>
            <input
              className="input input-lg"
              style={{ width: '100%' }}
              value={season}
              onChange={(e) => setSeason(e.target.value)}
            />
          </label>
          <label style={{ flex: 1 }}>
            <div className="field-label">Portée</div>
            <select
              className="input input-lg"
              style={{ width: '100%' }}
              value={region}
              onChange={(e) => setRegion(e.target.value)}>
              <option value="">National (toutes régions)</option>
              {regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ display: 'flex', gap: 16 }}>
          <label style={{ flex: 1 }}>
            <div className="field-label">Début</div>
            <input
              type="date"
              className="input input-lg"
              style={{ width: '100%' }}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label style={{ flex: 1 }}>
            <div className="field-label">Fin</div>
            <input
              type="date"
              className="input input-lg"
              style={{ width: '100%' }}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
          <label style={{ width: 120 }}>
            <div className="field-label" title="Meilleurs résultats retenus">
              Best-N
            </div>
            <input
              type="number"
              min={1}
              className="input input-lg"
              style={{ width: '100%' }}
              value={bestN}
              onChange={(e) => setBestN(Math.max(1, Number(e.target.value) || 1))}
            />
          </label>
        </div>

        <div className="field-hint">
          Tout tournoi individuel terminé dont la date tombe dans la période — et la région, si
          choisie — comptera automatiquement.
        </div>

        {!datesOk ? (
          <div className="field-hint" style={{ color: 'var(--danger)' }}>
            La date de fin doit être postérieure à la date de début.
          </div>
        ) : null}
        {formError ? (
          <div className="field-hint" style={{ color: 'var(--danger)' }}>
            {formError}
          </div>
        ) : null}
      </div>

      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onClose}>
          Annuler
        </button>
        <button className="btn btn-primary" disabled={!canSubmit} onClick={submit}>
          {submitting ? 'Création…' : 'Créer le circuit'}
        </button>
      </div>
    </Modal>
  );
}
