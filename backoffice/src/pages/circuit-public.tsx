import { useState } from 'react';
import { useParams } from 'react-router-dom';

import { useCircuit, useCircuitStandings } from '../hooks/use-circuits';
import { formatEventDateShort } from '../lib/tournaments';

/** Nombre à la française, sans décimale inutile. */
function num(value: number | string): string {
  return Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}

function scopeLabel(region: string | null): string {
  return region ?? 'National';
}

/**
 * Page publique et partageable d'un circuit : /circuit/:id.
 * Consultable sans compte — les données (circuits, circuit_standings) sont
 * ouvertes à `anon`. Aucune barre latérale : c'est une page « vitrine ».
 */
export function CircuitPublicPage() {
  const { id } = useParams();
  const { circuit, loading: circuitLoading, error: circuitError } = useCircuit(id);
  const { standings, loading: standingsLoading } = useCircuitStandings(id);
  const [copied, setCopied] = useState(false);

  function copyLink() {
    navigator.clipboard?.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const shell = (children: React.ReactNode) => (
    <div className="public-shell">
      <header className="public-topbar">
        <div className="public-brand">EGIDE</div>
        <div className="public-tag">Circuits</div>
      </header>
      <main className="public-content">{children}</main>
      <footer className="public-footer">
        Classement propulsé par <strong>EGIDE</strong> · Tournois Warhammer Age of Sigmar
      </footer>
    </div>
  );

  if (circuitLoading) {
    return shell(
      <>
        <div className="skeleton" style={{ height: 90, marginBottom: 24 }} />
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="skeleton" style={{ height: 56, marginBottom: 1 }} />
        ))}
      </>
    );
  }

  if (circuitError || !circuit) {
    return shell(
      <div className="empty-state">
        <h2>Circuit introuvable</h2>
        <p>Ce circuit n’existe pas, ou le lien est incorrect.</p>
      </div>
    );
  }

  return shell(
    <>
      <div className="public-header">
        <div>
          <div className="overline">Circuit · Saison {circuit.season}</div>
          <h1 className="public-title">{circuit.name}</h1>
          <div className="page-subtitle">
            {scopeLabel(circuit.region)} · {formatEventDateShort(circuit.start_date)} →{' '}
            {formatEventDateShort(circuit.end_date)}
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={copyLink}>
          {copied ? '✓ Lien copié' : 'Copier le lien'}
        </button>
      </div>

      <div className="banner banner-info" style={{ marginTop: 20 }}>
        Barème « place pondérée par la taille » : sur chaque tournoi, un joueur marque{' '}
        <strong>(nombre de joueurs − son rang + 1)</strong> points. Seuls ses{' '}
        <strong>{circuit.best_n}</strong> meilleurs résultats de la saison comptent.
      </div>

      {standingsLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 24 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton" style={{ height: 56 }} />
          ))}
        </div>
      ) : standings.length === 0 ? (
        <div className="empty-state">
          <h2>Pas encore de classement</h2>
          <p>
            Aucun tournoi terminé ne compte encore pour cette saison. Le classement se remplira
            au fil des tournois.
          </p>
        </div>
      ) : (
        <table className="table table-static" style={{ marginTop: 20 }}>
          <thead>
            <tr>
              <th style={{ width: 64 }}>Rang</th>
              <th>Joueur</th>
              <th style={{ width: 90 }}>Points</th>
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
    </>
  );
}
