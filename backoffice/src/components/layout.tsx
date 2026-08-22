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

type Props = {
  email: string;
  pseudo: string | null;
  /** Tournoi courant quand on est sur /tournois/:id/* (mode « tournoi » de la sidebar). */
  tournament?: TournamentWithCount | null;
  children: React.ReactNode;
};

/** Gabarit général : sidebar (mode global ou mode tournoi) + zone de contenu. */
export function Layout({ email, pseudo, tournament, children }: Props) {
  const { id } = useParams();
  const location = useLocation();
  const inTournament = Boolean(id);

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">EGIDE</div>

        <nav className="sidebar-nav">
          {inTournament ? (
            <>
              <Link to="/tournois" className="sidebar-back">
                ← Mes tournois
              </Link>
              {tournament ? (
                <div style={{ margin: '8px 0' }}>
                  <div className="sidebar-tournament-name">{tournament.name}</div>
                  <div style={{ marginTop: 4 }}>
                    <StatusBadge status={tournament.status} />
                  </div>
                </div>
              ) : null}
              {TournamentSections.map((section) => {
                const target = `/tournois/${id}${section.path ? `/${section.path}` : ''}`;
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
        <div className="content-inner">{children}</div>
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
