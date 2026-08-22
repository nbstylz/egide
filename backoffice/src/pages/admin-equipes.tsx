import { useMemo, useState } from 'react';

import { AdminPageHeader } from '../components/admin-page-header';
import { Toast } from '../components/toast';
import {
  disbandTeam,
  renameTeam,
  useAdminTeams,
  useTeamHistory,
  type AdminTeam,
} from '../hooks/use-admin';
import { formatDateNumeric } from '../lib/tournaments';

const MinReason = 10;

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function AdminEquipesPage() {
  const { teams, loading, error, refresh } = useAdminTeams();
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState<string>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const regions = useMemo(() => {
    const set = new Set<string>();
    for (const team of teams) if (team.region) set.add(team.region);
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [teams]);

  const filtered = useMemo(() => {
    const needle = normalize(search.trim());
    return teams.filter((team) => {
      if (region !== 'all' && team.region !== region) return false;
      if (!needle) return true;
      return normalize(`${team.name} ${team.captain_pseudo ?? ''}`).includes(needle);
    });
  }, [teams, search, region]);

  const openTeam = teams.find((t) => t.id === openId) ?? null;

  let body;
  if (loading) {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 24 }}>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="skeleton" style={{ height: 52 }} />
        ))}
      </div>
    );
  } else if (error) {
    body = (
      <div className="empty-state">
        <p>Impossible de charger les équipes.</p>
        <button className="btn btn-secondary" onClick={refresh}>
          Réessayer
        </button>
      </div>
    );
  } else if (teams.length === 0) {
    body = (
      <div className="empty-state">
        <h2>Aucune équipe sur la plateforme</h2>
        <p>Les équipes créées depuis l’application mobile apparaîtront ici.</p>
      </div>
    );
  } else if (filtered.length === 0) {
    body = (
      <div className="empty-state">
        <p>
          Aucune équipe ne correspond
          {search.trim() ? ` à « ${search.trim()} »` : ''}
          {region !== 'all' ? ` en ${region}` : ''}.
        </p>
        <button
          className="btn btn-secondary"
          onClick={() => {
            setSearch('');
            setRegion('all');
          }}>
          Réinitialiser les filtres
        </button>
      </div>
    );
  } else {
    body = (
      <table className="table">
        <thead>
          <tr>
            <th>Nom</th>
            <th className="hide-narrow" style={{ width: 200 }}>
              Capitaine
            </th>
            <th className="hide-narrow" style={{ width: 200 }}>
              Région
            </th>
            <th style={{ width: 110 }}>Membres</th>
            <th className="hide-narrow" style={{ width: 120 }}>
              Créée le
            </th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((team) => (
            <tr key={team.id} onClick={() => setOpenId(team.id)}>
              <td className="cell-name">
                <span style={{ fontWeight: 600 }}>{team.name}</span>
                <div className="cell-sub show-narrow">
                  {team.captain_pseudo ?? 'capitaine inconnu'}
                  {team.region ? ` · ${team.region}` : ''}
                </div>
              </td>
              <td className="hide-narrow">
                {team.captain_pseudo ?? (
                  <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                    Capitaine inconnu
                  </span>
                )}
              </td>
              <td className="hide-narrow">
                {team.region ?? <span style={{ color: 'var(--text-secondary)' }}>—</span>}
              </td>
              <td>{team.member_count}</td>
              <td className="hide-narrow" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {formatDateNumeric(team.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <>
      <AdminPageHeader
        title="Équipes"
        subtitle={
          loading
            ? 'Chargement…'
            : `${teams.length} équipe${teams.length > 1 ? 's' : ''}${
                filtered.length !== teams.length ? ` · ${filtered.length} affichée${filtered.length > 1 ? 's' : ''}` : ''
              }`
        }
      />

      {!loading && !error && teams.length > 0 ? (
        <div className="admin-toolbar">
          <input
            className="input search-input"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher une équipe ou un capitaine"
            aria-label="Rechercher une équipe ou un capitaine"
          />
          {regions.length > 1 ? (
            <div className="chips">
              <button
                type="button"
                className={region === 'all' ? 'active' : ''}
                onClick={() => setRegion('all')}>
                Toutes les régions ({teams.length})
              </button>
              {regions.map((name) => (
                <button
                  key={name}
                  type="button"
                  className={region === name ? 'active' : ''}
                  onClick={() => setRegion(name)}>
                  {name} ({teams.filter((t) => t.region === name).length})
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {body}

      {openTeam ? (
        <TeamDrawer
          team={openTeam}
          onClose={() => setOpenId(null)}
          onChanged={(message) => {
            setToast(message);
            refresh();
          }}
        />
      ) : null}

      {toast ? <Toast message={toast} onDone={() => setToast(null)} /> : null}
    </>
  );
}

/** Panneau latéral : la liste reste visible pendant qu'on rédige le motif. */
function TeamDrawer({
  team,
  onClose,
  onChanged,
}: {
  team: AdminTeam;
  onClose: () => void;
  onChanged: (message: string) => void;
}) {
  const { history } = useTeamHistory(team.id);
  const [mode, setMode] = useState<'view' | 'rename' | 'disband'>('view');
  const [name, setName] = useState(team.name);
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const tooShort = reason.trim().length < MinReason;

  function back() {
    setMode('view');
    setReason('');
    setName(team.name);
    setConfirm(false);
    setFailure(null);
  }

  async function submit() {
    setBusy(true);
    setFailure(null);
    const result =
      mode === 'rename'
        ? await renameTeam(team.id, name.trim(), reason.trim())
        : await disbandTeam(team.id, reason.trim());
    setBusy(false);
    if (!result.ok) {
      setFailure(result.message);
      return;
    }
    onChanged(
      mode === 'rename'
        ? `L’équipe s’appelle désormais « ${name.trim()} ».`
        : `L’équipe « ${team.name} » est dissoute. L’action a été consignée dans le journal.`
    );
    onClose();
  }

  return (
    <>
      <div className="drawer-veil" onClick={busy ? undefined : onClose} />
      <aside className="drawer" role="dialog" aria-label={`Équipe ${team.name}`}>
        <div className="drawer-head">
          <div className="drawer-head-texts">
            <div className="drawer-title">{team.name}</div>
            <div className="drawer-subtitle">
              {team.member_count} membre{team.member_count > 1 ? 's' : ''}
              {team.captain_pseudo ? ` · capitaine ${team.captain_pseudo}` : ''}
            </div>
          </div>
          <div className="drawer-head-actions">
            <button className="btn btn-sm btn-secondary" onClick={onClose} disabled={busy}>
              Fermer
            </button>
          </div>
        </div>

        <div className="drawer-body">
          <div className="readonly-list">
            <div className="row">
              <span className="label">Région</span>
              <span>{team.region ?? '—'}</span>
            </div>
            <div className="row">
              <span className="label">Créée le</span>
              <span>{formatDateNumeric(team.created_at)}</span>
            </div>
            <div className="row">
              <span className="label">Description</span>
              <span>{team.description?.trim() || '—'}</span>
            </div>
          </div>

          {history.length > 0 ? (
            <>
              <div className="group-title" style={{ marginTop: 'var(--sp-4)' }}>
                Mesures déjà prises
              </div>
              <ul className="admin-history">
                {history.map((event, index) => (
                  <li key={index}>
                    <strong>
                      {event.action === 'rename_team' ? 'Renommée' : 'Dissoute'}
                    </strong>{' '}
                    le {formatDateNumeric(event.created_at)}
                    {event.admin_pseudo ? ` par ${event.admin_pseudo}` : ''}
                    {event.action === 'rename_team' && event.detail ? (
                      <div className="cell-sub">
                        « {String(event.detail.from)} » → « {String(event.detail.to)} »
                      </div>
                    ) : null}
                    {event.reason ? <div className="cell-sub">Motif : {event.reason}</div> : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>

        <div className="drawer-foot">
          {mode === 'view' ? (
            <div className="drawer-actions">
              <button className="btn btn-secondary" onClick={() => setMode('rename')}>
                Renommer
              </button>
              <button className="btn btn-danger-outline" onClick={() => setMode('disband')}>
                Dissoudre
              </button>
            </div>
          ) : (
            <>
              {mode === 'rename' ? (
                <>
                  <label className="drawer-reject-label" htmlFor="team-name">
                    Nouveau nom
                  </label>
                  <input
                    id="team-name"
                    className="input"
                    style={{ width: '100%' }}
                    value={name}
                    disabled={busy}
                    maxLength={40}
                    onChange={(event) => setName(event.target.value)}
                  />
                  <div className="field-hint">
                    Le capitaine découvrira le nouveau nom dans l’application.
                  </div>
                </>
              ) : (
                <div className="banner banner-danger" style={{ marginBottom: 'var(--sp-3)' }}>
                  Dissoudre « {team.name} » retirera ses {team.member_count} membre
                  {team.member_count > 1 ? 's' : ''} et supprimera l’équipe. Cette action est
                  irréversible.
                </div>
              )}

              <label className="drawer-reject-label" htmlFor="team-reason">
                Motif (obligatoire)
              </label>
              <textarea
                id="team-reason"
                className="input drawer-reject-input"
                rows={3}
                placeholder={
                  mode === 'rename'
                    ? 'Ex. : nom précédent jugé inapproprié par trois organisateurs.'
                    : 'Ex. : équipe sans activité depuis un an, capitaine injoignable.'
                }
                value={reason}
                disabled={busy}
                onChange={(event) => setReason(event.target.value)}
              />
              <div className="field-hint">Conservé dans le journal d’administration.</div>

              {/* Confirmation renforcée pour la seule action irréversible. */}
              {mode === 'disband' ? (
                <label className="checkbox-row" style={{ marginTop: 'var(--sp-3)' }}>
                  <input
                    type="checkbox"
                    checked={confirm}
                    disabled={busy}
                    onChange={(event) => setConfirm(event.target.checked)}
                  />
                  <span>
                    Je comprends que l’équipe et son effectif seront supprimés définitivement.
                  </span>
                </label>
              ) : null}

              {failure ? (
                <div className="banner banner-danger" style={{ marginTop: 'var(--sp-3)' }}>
                  {failure}
                </div>
              ) : null}

              <div className="drawer-actions">
                {/* Le retour d'abord : une frappe réflexe ne détruit rien. */}
                <button className="btn btn-secondary" onClick={back} disabled={busy}>
                  Retour
                </button>
                <button
                  className={`btn ${mode === 'rename' ? 'btn-primary' : 'btn-danger'}`}
                  disabled={
                    busy ||
                    tooShort ||
                    (mode === 'disband' && !confirm) ||
                    (mode === 'rename' && name.trim() === team.name)
                  }
                  onClick={submit}>
                  {busy
                    ? 'Enregistrement…'
                    : mode === 'rename'
                      ? 'Renommer l’équipe'
                      : 'Dissoudre l’équipe'}
                </button>
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
