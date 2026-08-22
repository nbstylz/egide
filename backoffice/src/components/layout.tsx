import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useParams } from 'react-router-dom';

import { supabase } from '../lib/supabase';
import type { TournamentWithCount } from '../hooks/use-my-tournaments';
import { StatusBadge } from './status-badge';

/** Sections d'un tournoi ; seules les « Bientôt » mènent à un placeholder. */
const TournamentSections = [
  { path: '', label: 'Général', soon: false },
  { path: 'inscrits', label: 'Inscrits', soon: false },
  { path: 'check-in', label: 'Check-in', soon: false },
  { path: 'rondes', label: 'Rondes & scores', soon: false },
  { path: 'classement', label: 'Classement', soon: false },
  { path: 'listes', label: 'Listes d’armées' },
];

/**
 * Sections de l'administration. L'ordre est figé dès maintenant : les US 12.4
 * à 12.6 ne feront que retirer leur pastille « Bientôt », la navigation n'aura
 * pas à bouger. Aucun item mort : chacun mène quelque part.
 */
const AdminSections = [
  { path: '', label: 'Tableau de bord', soon: true },
  { path: 'tournois', label: 'Tournois', soon: false },
  { path: 'comptes', label: 'Comptes', soon: true },
  { path: 'equipes', label: 'Équipes', soon: true },
  { path: 'journal', label: 'Journal', soon: true },
];

type Props = {
  email: string;
  pseudo: string | null;
  /** Tournoi courant quand on est sur une fiche (mode « tournoi » de la sidebar). */
  tournament?: TournamentWithCount | null;
  /** Pseudo de l'organisateur, affiché en vue admin (« ce n'est pas chez toi »). */
  organizerPseudo?: string | null;
  /** Vrai dès que l'utilisateur est admin : conditionne l'entrée « Administration ». */
  isAdmin?: boolean;
  /** Vrai sur /admin/* : la sidebar passe en mode administration. */
  admin?: boolean;
  /** Les pages admin ont besoin de plus de largeur (six colonnes). */
  wide?: boolean;
  children: React.ReactNode;
};

/** Gabarit général : sidebar (mode global, tournoi ou administration) + contenu. */
export function Layout({
  email,
  pseudo,
  tournament,
  organizerPseudo,
  isAdmin,
  admin,
  wide,
  children,
}: Props) {
  const { id } = useParams();
  const location = useLocation();
  const inTournament = Boolean(id);
  const adminRoot = location.pathname.startsWith('/admin');

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">EGIDE</div>

        <nav className="sidebar-nav">
          {inTournament ? (
            <>
              <Link to={adminRoot ? '/admin/tournois' : '/tournois'} className="sidebar-back">
                ← {adminRoot ? 'Tous les tournois' : 'Mes tournois'}
              </Link>
              {adminRoot ? <div className="overline">Administration</div> : null}
              {tournament ? (
                <div style={{ margin: '8px 0' }}>
                  <div className="sidebar-tournament-name">{tournament.name}</div>
                  <div style={{ marginTop: 4 }}>
                    <StatusBadge status={tournament.status} />
                  </div>
                  {/* Rappel discret et constant de « chez qui » on se trouve. */}
                  {adminRoot && organizerPseudo ? (
                    <div className="sidebar-tournament-owner">Organisé par {organizerPseudo}</div>
                  ) : null}
                </div>
              ) : null}
              {TournamentSections.map((section) => {
                const base = adminRoot ? `/admin/tournois/${id}` : `/tournois/${id}`;
                const target = `${base}${section.path ? `/${section.path}` : ''}`;
                const active = location.pathname === target;
                return (
                  <Link
                    key={section.label}
                    to={target}
                    className={`sidebar-item${active ? ' active' : ''}`}>
                    <span>{section.label}</span>
                    {section.soon ? <span className="badge-soon">Bientôt</span> : null}
                    {section.path === 'inscrits' && tournament ? (
                      <span className="badge-soon">{tournament.registered_count}</span>
                    ) : null}
                  </Link>
                );
              })}
            </>
          ) : adminRoot ? (
            <>
              <Link to="/tournois" className="sidebar-back">
                ← Mes tournois
              </Link>
              <div className="overline">Administration</div>
              {AdminSections.map((section) => {
                const target = `/admin${section.path ? `/${section.path}` : ''}`;
                const active = location.pathname === target;
                return (
                  <Link
                    key={section.label}
                    to={target}
                    className={`sidebar-item${active ? ' active' : ''}`}>
                    <span>{section.label}</span>
                    {section.soon ? <span className="badge-soon">Bientôt</span> : null}
                  </Link>
                );
              })}
            </>
          ) : (
            <>
              <NavLink
                to="/tournois"
                className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}>
                <span>Mes tournois</span>
              </NavLink>
              <NavLink
                to="/circuits"
                className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}>
                <span>Circuits</span>
              </NavLink>
              {/* Rien tant que `is_admin()` n'a pas répondu : un non-admin ne doit
                  jamais voir apparaître puis disparaître une entrée admin. */}
              {isAdmin ? (
                <Link to="/admin/tournois" className="sidebar-item sidebar-admin-entry">
                  <span>Administration</span>
                  <span className="badge-admin">ADMIN</span>
                </Link>
              ) : null}
            </>
          )}
        </nav>

        <div className="sidebar-user">
          {pseudo ? <div className="sidebar-user-pseudo">{pseudo}</div> : null}
          <div className="sidebar-user-email" title={email}>
            {email}
          </div>
          <button className="sidebar-signout" onClick={() => supabase?.auth.signOut()}>
            Se déconnecter
          </button>
        </div>
      </aside>

      <main className="content">
        <div className={`content-inner${wide || admin ? ' content-inner--wide' : ''}`}>
          {children}
        </div>
      </main>
    </div>
  );
}

/** Charge le pseudo du profil connecté (pour le bloc utilisateur). */
export function usePseudo(userId: string | undefined) {
  const [pseudo, setPseudo] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase || !userId) {
      setPseudo(null);
      return;
    }
    supabase
      .from('profiles')
      .select('pseudo')
      .eq('id', userId)
      .maybeSingle<{ pseudo: string }>()
      .then(({ data }) => setPseudo(data?.pseudo ?? null));
  }, [userId]);

  return pseudo;
}
