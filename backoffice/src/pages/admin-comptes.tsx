import { useMemo, useState } from 'react';

import { AdminPageHeader } from '../components/admin-page-header';
import { Toast } from '../components/toast';
import {
  setAccountDisabled,
  useAccountHistory,
  useAdminAccounts,
  type AdminAccount,
} from '../hooks/use-admin';
import { formatDateNumeric } from '../lib/tournaments';

type SortKey = 'pseudo' | 'created_at' | 'activity';
type StateFilter = 'all' | 'active' | 'disabled' | 'admin';

const MinReason = 10;

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

const isDisabled = (account: AdminAccount) => account.banned_until !== null;

export function AdminComptesPage({ userId }: { userId: string }) {
  const { accounts, loading, error, refresh, truncated } = useAdminAccounts();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StateFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortAsc, setSortAsc] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const counts = useMemo(
    () => ({
      all: accounts.length,
      active: accounts.filter((a) => !isDisabled(a)).length,
      disabled: accounts.filter(isDisabled).length,
      admin: accounts.filter((a) => a.role === 'admin').length,
    }),
    [accounts]
  );

  const filtered = useMemo(() => {
    const needle = normalize(search.trim());
    const result = accounts.filter((account) => {
      if (filter === 'active' && isDisabled(account)) return false;
      if (filter === 'disabled' && !isDisabled(account)) return false;
      if (filter === 'admin' && account.role !== 'admin') return false;
      if (!needle) return true;
      // Recherche par pseudo OU e-mail (critère 1 de l'US).
      return normalize(`${account.pseudo} ${account.email} ${account.region ?? ''}`).includes(
        needle
      );
    });
    result.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'pseudo') cmp = a.pseudo.localeCompare(b.pseudo, 'fr');
      else if (sortKey === 'created_at') cmp = a.created_at.localeCompare(b.created_at);
      else
        cmp =
          a.tournaments_organized + a.registrations_count -
          (b.tournaments_organized + b.registrations_count);
      return sortAsc ? cmp : -cmp;
    });
    return result;
  }, [accounts, search, filter, sortKey, sortAsc]);

  const openAccount = accounts.find((a) => a.id === openId) ?? null;

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortAsc((v) => !v);
    else {
      setSortKey(key);
      setSortAsc(key === 'pseudo');
    }
  }

  function sortHeader(key: SortKey, label: string, extraClass = '') {
    const active = key === sortKey;
    return (
      <th
        className={`${active ? 'sort-active' : ''} ${extraClass}`.trim()}
        aria-sort={active ? (sortAsc ? 'ascending' : 'descending') : 'none'}>
        <button type="button" onClick={() => toggleSort(key)}>
          {label} {active ? (sortAsc ? '▲' : '▼') : ''}
        </button>
      </th>
    );
  }

  let body;
  if (loading) {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 24 }}>
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="skeleton" style={{ height: 52 }} />
        ))}
      </div>
    );
  } else if (error) {
    body = (
      <div className="empty-state">
        <p>Impossible de charger les comptes.</p>
        <button className="btn btn-secondary" onClick={refresh}>
          Réessayer
        </button>
      </div>
    );
  } else if (filtered.length === 0) {
    const term = search.trim();
    body = (
      <div className="empty-state">
        {term ? (
          <>
            <p>Aucun compte ne correspond à «&nbsp;{term}&nbsp;».</p>
            <button className="btn btn-secondary" onClick={() => setSearch('')}>
              Effacer la recherche
            </button>
          </>
        ) : (
          <>
            <p>Aucun compte dans cette catégorie.</p>
            <button className="btn btn-secondary" onClick={() => setFilter('all')}>
              Voir tous les comptes
            </button>
          </>
        )}
      </div>
    );
  } else {
    body = (
      <table className="table">
        <thead>
          <tr>
            {sortHeader('pseudo', 'Pseudo')}
            <th className="hide-narrow">E-mail</th>
            <th className="hide-narrow" style={{ width: 180 }}>
              Région
            </th>
            {sortHeader('activity', 'Activité', 'hide-narrow')}
            {sortHeader('created_at', 'Inscrit le', 'hide-narrow')}
            <th style={{ width: 130 }}>État</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((account) => (
            <tr key={account.id} onClick={() => setOpenId(account.id)}>
              <td className="cell-name">
                <span style={{ fontWeight: 600 }}>{account.pseudo}</span>
                {account.id === userId ? <span className="badge-soon"> vous</span> : null}
                <div className="cell-sub show-narrow">{account.email}</div>
              </td>
              <td className="hide-narrow" style={{ color: 'var(--text-secondary)' }}>
                {account.email}
              </td>
              <td className="hide-narrow">
                {account.region ?? <span style={{ color: 'var(--text-secondary)' }}>—</span>}
              </td>
              <td className="hide-narrow" style={{ fontSize: 13 }}>
                {account.tournaments_organized} organisé
                {account.tournaments_organized > 1 ? 's' : ''}
                {' · '}
                {account.registrations_count} inscription
                {account.registrations_count > 1 ? 's' : ''}
              </td>
              <td className="hide-narrow" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {formatDateNumeric(account.created_at)}
              </td>
              <td>
                {isDisabled(account) ? (
                  <span className="badge badge-cancelled">Désactivé</span>
                ) : account.role === 'admin' ? (
                  <span className="badge-admin">ADMIN</span>
                ) : (
                  <span className="badge badge-open">Actif</span>
                )}
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
        title="Comptes"
        subtitle={
          loading
            ? 'Chargement…'
            : `${counts.all} compte${counts.all > 1 ? 's' : ''} · ${counts.active} actif${
                counts.active > 1 ? 's' : ''
              }${counts.disabled > 0 ? ` · ${counts.disabled} désactivé${counts.disabled > 1 ? 's' : ''}` : ''}`
        }
      />

      {!loading && !error && accounts.length > 0 ? (
        <div className="admin-toolbar">
          <input
            className="input search-input"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher un pseudo ou un e-mail"
            aria-label="Rechercher un pseudo ou un e-mail"
          />
          <div className="chips">
            {(
              [
                ['all', `Tous (${counts.all})`],
                ['active', `Actifs (${counts.active})`],
                ['disabled', `Désactivés (${counts.disabled})`],
                ['admin', `Administrateurs (${counts.admin})`],
              ] as [StateFilter, string][]
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={filter === value ? 'active' : ''}
                onClick={() => setFilter(value)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {truncated ? (
        <p className="admin-truncated">
          Les {accounts.length} comptes les plus récents sont affichés. Affinez la recherche pour
          aller au-delà.
        </p>
      ) : null}

      {body}

      {openAccount ? (
        <AccountDrawer
          account={openAccount}
          isSelf={openAccount.id === userId}
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

/**
 * Panneau latéral : c'est ici que l'action se prend, jamais dans le tableau.
 * La liste reste visible pendant qu'on rédige le motif.
 */
function AccountDrawer({
  account,
  isSelf,
  onClose,
  onChanged,
}: {
  account: AdminAccount;
  isSelf: boolean;
  onClose: () => void;
  onChanged: (message: string) => void;
}) {
  const { history } = useAccountHistory(account.id);
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const disabled = account.banned_until !== null;
  const tooShort = reason.trim().length < MinReason;
  // Les mêmes règles qu'en base (migration 0032), pour expliquer avant de
  // refuser — mais c'est la base qui tranche.
  const blockedReason = isSelf
    ? 'Vous ne pouvez pas désactiver votre propre compte.'
    : account.role === 'admin'
      ? 'Un administrateur ne peut pas être désactivé. Retirez-lui d’abord son rôle.'
      : null;

  async function submit() {
    setBusy(true);
    setFailure(null);
    const result = await setAccountDisabled(account.id, !disabled, reason.trim());
    setBusy(false);
    if (!result.ok) {
      setFailure(result.message);
      return;
    }
    onChanged(
      disabled
        ? `${account.pseudo} peut de nouveau se connecter.`
        : `${account.pseudo} ne peut plus se connecter. L’action a été consignée dans le journal.`
    );
    onClose();
  }

  return (
    <>
      <div className="drawer-veil" onClick={busy ? undefined : onClose} />
      <aside className="drawer" role="dialog" aria-label={`Compte de ${account.pseudo}`}>
        <div className="drawer-head">
          <div className="drawer-head-texts">
            <div className="drawer-title">{account.pseudo}</div>
            <div className="drawer-subtitle">{account.email}</div>
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
              <span className="label">État</span>
              <span>
                {disabled ? (
                  <span className="badge badge-cancelled">Désactivé</span>
                ) : (
                  <span className="badge badge-open">Actif</span>
                )}
              </span>
            </div>
            <div className="row">
              <span className="label">Rôle</span>
              <span>{account.role === 'admin' ? 'Administrateur' : 'Joueur'}</span>
            </div>
            <div className="row">
              <span className="label">Région</span>
              <span>{account.region ?? '—'}</span>
            </div>
            <div className="row">
              <span className="label">Inscrit le</span>
              <span>{formatDateNumeric(account.created_at)}</span>
            </div>
            <div className="row">
              <span className="label">Dernière connexion</span>
              <span>
                {account.last_sign_in_at ? formatDateNumeric(account.last_sign_in_at) : 'jamais'}
              </span>
            </div>
            <div className="row">
              <span className="label">Tournois organisés</span>
              <span>{account.tournaments_organized}</span>
            </div>
            <div className="row">
              <span className="label">Inscriptions</span>
              <span>{account.registrations_count}</span>
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
                      {event.action === 'disable_account'
                        ? 'Désactivé'
                        : event.action === 'enable_account'
                          ? 'Réactivé'
                          : event.action === 'grant_admin'
                            ? 'Nommé administrateur'
                            : event.action === 'revoke_admin'
                              ? 'Rôle d’administrateur retiré'
                              : event.action}
                    </strong>{' '}
                    le {formatDateNumeric(event.created_at)}
                    {event.admin_pseudo ? ` par ${event.admin_pseudo}` : ''}
                    {event.reason ? <div className="cell-sub">Motif : {event.reason}</div> : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>

        <div className="drawer-foot">
          {blockedReason ? (
            <p className="danger-zone-note">{blockedReason}</p>
          ) : (
            <>
              <label className="drawer-reject-label" htmlFor="account-reason">
                Motif {disabled ? 'de la réactivation' : 'de la désactivation'} (obligatoire)
              </label>
              <textarea
                id="account-reason"
                className="input drawer-reject-input"
                rows={3}
                placeholder={
                  disabled
                    ? 'Ex. : erreur de signalement, compte remis en service.'
                    : 'Ex. : propos injurieux répétés, signalés par trois organisateurs.'
                }
                value={reason}
                disabled={busy}
                onChange={(event) => setReason(event.target.value)}
                onBlur={() => setTouched(true)}
              />
              <div className="field-hint">
                {disabled
                  ? 'Conservé dans le journal d’administration.'
                  : 'Aucune donnée ne sera supprimée : tournois, résultats et équipes restent intacts. Seule la connexion est refusée.'}
              </div>
              {touched && tooShort ? (
                <div className="field-error">
                  Un motif d’au moins {MinReason} caractères est obligatoire.
                </div>
              ) : null}

              {failure ? (
                <div className="banner banner-danger" style={{ marginTop: 'var(--sp-3)' }}>
                  {failure}
                </div>
              ) : null}

              <div className="drawer-actions">
                <button
                  className={`btn ${disabled ? 'btn-primary' : 'btn-danger'}`}
                  disabled={busy || tooShort}
                  onClick={submit}>
                  {busy
                    ? 'Enregistrement…'
                    : disabled
                      ? 'Réactiver le compte'
                      : 'Désactiver le compte'}
                </button>
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
