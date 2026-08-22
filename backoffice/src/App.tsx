import { Navigate, Route, Routes, useParams } from 'react-router-dom';

import { AdminForbidden, AdminLoading } from './components/admin-page-header';
import { Layout, usePseudo } from './components/layout';
import { useIsAdmin } from './hooks/use-admin';
import { useMyTournaments, useTournament } from './hooks/use-my-tournaments';
import { useSession } from './hooks/use-session';
import { isSupabaseConfigured } from './lib/supabase';
import { AdminComptesPage } from './pages/admin-comptes';
import { AdminTournoisPage } from './pages/admin-tournois';
import { ConnexionPage } from './pages/connexion';
import { CheckInPage } from './pages/check-in';
import { ClassementPage } from './pages/classement';
import { InscritsPage } from './pages/inscrits';
import { RondesPage } from './pages/rondes';
import { ListesPage } from './pages/listes';
import { PlaceholderPage } from './pages/placeholder';
import { TournoiDetailPage } from './pages/tournoi-detail';
import { TournoisPage } from './pages/tournois';
import { CircuitsPage } from './pages/circuits';
import { CircuitPublicPage } from './pages/circuit-public';

type Shell = {
  userId: string;
  email: string;
  pseudo: string | null;
  /** Résolu : `undefined` tant que `is_admin()` n'a pas répondu. */
  isAdmin: boolean | undefined;
};

/** Liste « Mes tournois » avec son chargement de données. */
function TournoisRoute({ userId, email, pseudo, isAdmin }: Shell) {
  const { tournaments, loading, error, refresh } = useMyTournaments(userId);
  return (
    <Layout email={email} pseudo={pseudo} isAdmin={isAdmin}>
      <TournoisPage tournaments={tournaments} loading={loading} error={error} onRetry={refresh} />
    </Layout>
  );
}

/**
 * Fiche d'un tournoi et ses sections.
 *
 * `adminView` bascule tout l'écran en supervision : la garde « es-tu
 * l'organisateur ? » s'assouplit, et chaque section perd ses actions. La
 * lecture seule est aussi vraie en base (la politique d'écriture de la 0002
 * n'a pas été touchée) — l'interface ne fait que la rendre lisible.
 */
function TournoiRoute({
  userId,
  email,
  pseudo,
  isAdmin,
  section,
  adminView,
}: Shell & { section?: string; adminView?: boolean }) {
  const { id } = useParams();
  const { tournament, loading, error, refresh } = useTournament(id);
  const organizerPseudo = usePseudo(adminView ? tournament?.organizer_id : undefined);
  const readOnly = Boolean(adminView);

  return (
    <Layout
      email={email}
      pseudo={pseudo}
      tournament={tournament}
      organizerPseudo={organizerPseudo}
      isAdmin={isAdmin}
      admin={adminView}>
      {section === 'classement' ? (
        <ClassementPage
          tournament={tournament}
          tournamentLoading={loading}
          tournamentError={error}
          userId={userId}
          adminView={adminView}
        />
      ) : section === 'rondes' ? (
        <RondesPage
          tournament={tournament}
          tournamentLoading={loading}
          tournamentError={error}
          userId={userId}
          onChanged={refresh}
          readOnly={readOnly}
          adminView={adminView}
          organizerPseudo={organizerPseudo}
        />
      ) : section === 'check-in' ? (
        <CheckInPage
          tournament={tournament}
          tournamentLoading={loading}
          tournamentError={error}
          userId={userId}
          onChanged={refresh}
          readOnly={readOnly}
          adminView={adminView}
          organizerPseudo={organizerPseudo}
        />
      ) : section === 'inscrits' ? (
        <InscritsPage
          tournament={tournament}
          tournamentLoading={loading}
          tournamentError={error}
          userId={userId}
          onChanged={refresh}
          readOnly={readOnly}
          adminView={adminView}
          organizerPseudo={organizerPseudo}
        />
      ) : section === 'listes' ? (
        <ListesPage
          tournament={tournament}
          tournamentLoading={loading}
          tournamentError={error}
          userId={userId}
          readOnly={readOnly}
          adminView={adminView}
          organizerPseudo={organizerPseudo}
        />
      ) : section ? (
        <PlaceholderPage section={section} />
      ) : (
        <TournoiDetailPage
          tournament={tournament}
          loading={loading}
          error={error}
          userId={userId}
          onChanged={refresh}
          readOnly={readOnly}
          adminView={adminView}
          organizerPseudo={organizerPseudo}
        />
      )}
    </Layout>
  );
}

/**
 * Garde de la section d'administration.
 *
 * Tant que `is_admin()` n'a pas répondu on affiche un squelette : rediriger
 * pendant le chargement éjecterait l'admin à chaque rafraîchissement d'une
 * page /admin. Le refus est un état distinct de « page introuvable ».
 */
function AdminRoute({ shell, children }: { shell: Shell; children: React.ReactNode }) {
  const { email, pseudo, isAdmin } = shell;

  if (isAdmin === undefined) {
    return (
      <Layout email={email} pseudo={pseudo} isAdmin={isAdmin} admin>
        <AdminLoading />
      </Layout>
    );
  }
  if (!isAdmin) {
    return (
      <Layout email={email} pseudo={pseudo} isAdmin={false} admin>
        <AdminForbidden />
      </Layout>
    );
  }
  return <>{children}</>;
}

export default function App() {
  const { session, loading } = useSession();
  const pseudo = usePseudo(session?.user.id);
  const isAdmin = useIsAdmin(session?.user.id);

  if (!isSupabaseConfigured) {
    return (
      <div className="login-page">
        <p>Supabase n’est pas configuré : renseigne le fichier backoffice/.env puis relance.</p>
      </div>
    );
  }

  if (loading) {
    return null;
  }

  if (!session) {
    return (
      <Routes>
        {/* Page publique d'un circuit : consultable sans compte (lien partagé). */}
        <Route path="/circuit/:id" element={<CircuitPublicPage />} />
        <Route path="/connexion" element={<ConnexionPage />} />
        <Route path="*" element={<Navigate to="/connexion" replace />} />
      </Routes>
    );
  }

  const shell: Shell = {
    userId: session.user.id,
    email: session.user.email ?? '',
    pseudo,
    isAdmin,
  };

  return (
    <Routes>
      {/* Page publique d'un circuit : même URL pour tous, sans la sidebar. */}
      <Route path="/circuit/:id" element={<CircuitPublicPage />} />
      <Route path="/connexion" element={<Navigate to="/tournois" replace />} />
      <Route path="/" element={<Navigate to="/tournois" replace />} />
      <Route path="/tournois" element={<TournoisRoute {...shell} />} />
      <Route
        path="/circuits"
        element={
          <Layout email={shell.email} pseudo={shell.pseudo} isAdmin={shell.isAdmin}>
            <CircuitsPage userId={shell.userId} />
          </Layout>
        }
      />
      <Route path="/tournois/:id" element={<TournoiRoute {...shell} />} />
      <Route path="/tournois/:id/inscrits" element={<TournoiRoute {...shell} section="inscrits" />} />
      <Route path="/tournois/:id/check-in" element={<TournoiRoute {...shell} section="check-in" />} />
      <Route path="/tournois/:id/rondes" element={<TournoiRoute {...shell} section="rondes" />} />
      <Route
        path="/tournois/:id/classement"
        element={<TournoiRoute {...shell} section="classement" />}
      />
      <Route path="/tournois/:id/listes" element={<TournoiRoute {...shell} section="listes" />} />

      {/* ---------- Administration ----------
          Chemins distincts de /tournois/:id : un lien copié-collé ne doit pas
          changer de comportement selon qui clique dessus, et la sidebar doit
          pouvoir décider de son mode à partir de l'URL seule. */}
      <Route path="/admin" element={<Navigate to="/admin/tournois" replace />} />
      <Route
        path="/admin/tournois"
        element={
          <AdminRoute shell={shell}>
            <Layout email={shell.email} pseudo={shell.pseudo} isAdmin admin>
              <AdminTournoisPage userId={shell.userId} />
            </Layout>
          </AdminRoute>
        }
      />
      {['', '/inscrits', '/check-in', '/rondes', '/classement', '/listes'].map((suffix) => (
        <Route
          key={suffix || 'general'}
          path={`/admin/tournois/:id${suffix}`}
          element={
            <AdminRoute shell={shell}>
              <TournoiRoute
                {...shell}
                adminView
                section={suffix ? suffix.slice(1) : undefined}
              />
            </AdminRoute>
          }
        />
      ))}
      <Route
        path="/admin/comptes"
        element={
          <AdminRoute shell={shell}>
            <Layout email={shell.email} pseudo={shell.pseudo} isAdmin admin>
              <AdminComptesPage userId={shell.userId} />
            </Layout>
          </AdminRoute>
        }
      />
      {['equipes', 'journal'].map((section) => (
        <Route
          key={section}
          path={`/admin/${section}`}
          element={
            <AdminRoute shell={shell}>
              <Layout email={shell.email} pseudo={shell.pseudo} isAdmin admin>
                <PlaceholderPage section={`admin-${section}`} />
              </Layout>
            </AdminRoute>
          }
        />
      ))}

      <Route
        path="*"
        element={
          <Layout email={shell.email} pseudo={shell.pseudo} isAdmin={shell.isAdmin}>
            <div className="empty-state">
              <h2>Page introuvable</h2>
              <a href="/tournois">Retour à mes tournois</a>
            </div>
          </Layout>
        }
      />
    </Routes>
  );
}
