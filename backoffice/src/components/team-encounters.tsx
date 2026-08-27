import { useCallback, useEffect, useState } from 'react';

import { supabase } from '../lib/supabase';
import { Toast } from './toast';

type Encounter = {
  id: string;
  encounter_number: number;
  team_a_id: string;
  team_b_id: string | null;
  pairing_status: 'auto' | 'pending' | 'locked';
  team_a: { team: { name: string } | null } | null;
  team_b: { team: { name: string } | null } | null;
};

type Props = {
  roundId: string | null;
  /** Lecture seule dès que le tournoi n'est plus en cours, ou en supervision. */
  editable: boolean;
};

function readableError(message: string): string {
  switch (message) {
    case 'SCORES_ALREADY_ENTERED':
      return 'Des scores sont déjà saisis sur cette rencontre : elle ne peut plus être réappariée.';
    case 'ALREADY_LOCKED':
      return 'Cette rencontre est verrouillée.';
    case 'NOT_ORGANIZER':
      return 'Seul l’organisateur ouvre un appariement.';
    default:
      return 'Impossible d’enregistrer. Vérifiez votre connexion.';
  }
}

/**
 * Les rencontres d'une ronde, et les deux gestes de l'organisateur (US-7.7).
 *
 * **Ouvrir l'appariement** défait les tables composées dans l'ordre des rosters
 * et rend la main aux capitaines. **Compléter** est le filet : un capitaine
 * parti, un téléphone déchargé, une salle qui attend — la rencontre se termine
 * d'un geste, dans l'ordre des rosters.
 *
 * Aucune minuterie : elle exigerait un cron, une horloge partagée et du temps
 * réel, pour un problème que l'organisateur règle en marchant trois mètres.
 */
export function TeamEncounters({ roundId, editable }: Props) {
  const [rows, setRows] = useState<Encounter[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase || !roundId) {
      setRows([]);
      return;
    }
    const { data } = await supabase
      .from('team_pairings')
      .select(
        'id, encounter_number, team_a_id, team_b_id, pairing_status, team_a:team_registrations!team_pairings_team_a_id_fkey(team:teams(name)), team_b:team_registrations!team_pairings_team_b_id_fkey(team:teams(name))'
      )
      .eq('round_id', roundId)
      .order('encounter_number');
    setRows((data as unknown as Encounter[]) ?? []);
  }, [roundId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function run(id: string, rpc: 'open_captain_pairing' | 'autocomplete_captain_pairing') {
    if (!supabase) return;
    setBusyId(id);
    const { error } = await supabase.rpc(rpc, { p_team_pairing_id: id });
    setBusyId(null);
    if (error) {
      setToast(readableError(error.message));
      return;
    }
    refresh();
  }

  if (rows.length === 0) return null;

  return (
    <section className="details-section" style={{ marginBottom: 24 }}>
      <h2 className="section-title">Rencontres de la ronde</h2>
      <table className="table table-static">
        <thead>
          <tr>
            <th style={{ width: 64 }}>N°</th>
            <th>Rencontre</th>
            <th style={{ width: 140 }}>Appariement</th>
            {editable ? <th style={{ width: 280 }} /> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.encounter_number}</td>
              <td>
                <span className="cell-name">
                  {row.team_a?.team?.name ?? 'Équipe'}
                  {row.team_b ? ` contre ${row.team_b.team?.name ?? 'Équipe'}` : ''}
                </span>
                {row.team_b === null ? <div className="checkin-meta">Bye</div> : null}
              </td>
              <td>
                {row.pairing_status === 'locked' ? (
                  <span className="badge badge-bye">🔒 Verrouillée</span>
                ) : row.pairing_status === 'pending' ? (
                  <span className="badge badge-rematch">Capitaines en cours</span>
                ) : (
                  <span className="checkin-meta">Ordre des rosters</span>
                )}
              </td>
              {editable ? (
                <td>
                  {row.team_b === null ? null : (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {row.pairing_status !== 'locked' ? (
                        <button
                          className="btn btn-secondary"
                          disabled={busyId === row.id}
                          onClick={() => run(row.id, 'open_captain_pairing')}>
                          Confier aux capitaines
                        </button>
                      ) : null}
                      {row.pairing_status === 'pending' ? (
                        <button
                          className="btn btn-secondary"
                          disabled={busyId === row.id}
                          onClick={() => run(row.id, 'autocomplete_captain_pairing')}>
                          Compléter
                        </button>
                      ) : null}
                    </div>
                  )}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="field-hint">
        « Confier aux capitaines » défait les tables composées dans l’ordre des rosters : les
        capitaines apparient alors depuis leur téléphone. « Compléter » termine la rencontre à
        leur place, dans l’ordre des rosters — utile si un capitaine manque.
      </div>
      {toast ? <Toast message={toast} variant="danger" onDone={() => setToast(null)} /> : null}
    </section>
  );
}
