import { Navigate, Route, Routes, useParams } from 'react-router-dom';

import { Layout, usePseudo } from './components/layout';
import { useMyTournaments, useTournament } from './hooks/use-my-tournaments';
import { useSession } from './hooks/use-session';
import { isSupabaseConfigured } from './lib/supabase';
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

/** Liste « Mes tournois » avec son chargement de données. */
function TournoisRoute({ userId, email, pseudo }: { userId: string; email: string; pseudo: string | null }) {
  const { tournaments, loading, error, refresh } = useMyTournaments(userId);
  return (
    <Layout email={email} pseudo={pseudo}>
      <TournoisPage tournaments={tournaments} loading={loading} error={error} onRetry={refresh} />
    </Layout>
  );
}

/** Fiche d'un tournoi (et ses sections « Bientôt ») avec sidebar contextuelle. */
function TournoiRoute({
  userId,
  email,
  pseudo,
  section,
}: {
  userId: string;
  email: string;
  pseudo: string | null;
  section?: string;
}) {
  const { id } = useParams();
  const { tournament, loading, error, refresh } = useTournament(id);
  return (
    <Layout email={email} pseudo={pseudo} tournament={tournament}>
      {section === 'classement' ? (
        <ClassementPage
          tournament={tournament}
          tournamentLoading={loading}
          tournamentError={error}
          userId={userId}
        />
      ) : section === 'rondes' ? (
        <RondesPage
          tournament={tournament}
          tournamentLoading={loading}
          tournamentError={error}
          userId={userId}
          onChanged={refresh}
        />
      ) : section === 'check-in' ? (
        <CheckInPage
          tournament={tournament}
          tournamentLoading={loading}
          tournamentError={error}
          userId={userId}
          onChanged={refresh}
        />
      ) : section === 'inscrits' ? (
        <InscritsPage
          tournament={tournament}
          tournamentLoading={loading}
          tournamentError={error}
          userId={userId}
          onChanged={refresh}
        />
      ) : section === 'listes' ? (
        <ListesPage
          tournament={tournament}
          tournamentLoading={loading}
          tournamentError={error}
          userId={userId}
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
        />
      )}
    </Layout>
  );
}

export default function App() {
  const { session, loading } = useSession();
  const pseudo = usePseudo(session?.user.id);

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

  const email = session.user.email ?? '';

  return (
    <Routes>
      {/* Page publique d'un circuit : même URL pour tous, sans la sidebar. */}
      <Route path="/circuit/:id" element={<CircuitPublicPage />} />
      <Route path="/connexion" element={<Navigate to="/tournois" replace />} />
      <Route path="/" element={<Navigate to="/tournois" replace />} />
      <Route
        path="/tournois"
        element={<TournoisRoute userId={session.user.id} email={email} pseudo={pseudo} />}
      />
      <Route
        path="/circuits"
        element={
          <Layout email={email} pseudo={pseudo}>
            <CircuitsPage userId={session.user.id} />
          </Layout>
        }
      />
      <Route path="/tournois/:id" element={<TournoiRoute userId={session.user.id} email={email} pseudo={pseudo} />} />
      <Route
        path="/tournois/:id/inscrits"
        element={<TournoiRoute userId={session.user.id} email={email} pseudo={pseudo} section="inscrits" />}
      />
      <Route
        path="/tournois/:id/check-in"
        element={<TournoiRoute userId={session.user.id} email={email} pseudo={pseudo} section="check-in" />}
      />
      <Route
        path="/tournois/:id/rondes"
        element={<TournoiRoute userId={session.user.id} email={email} pseudo={pseudo} section="rondes" />}
      />
      <Route
        path="/tournois/:id/classement"
        element={<TournoiRoute userId={session.user.id} email={email} pseudo={pseudo} section="classement" />}
      />
      <Route
        path="/tournois/:id/listes"
        element={<TournoiRoute userId={session.user.id} email={email} pseudo={pseudo} section="listes" />}
      />
      <Route
        path="*"
        element={
          <Layout email={email} pseudo={pseudo}>
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
