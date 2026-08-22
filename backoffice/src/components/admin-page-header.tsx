import { useEffect } from 'react';
import { Link } from 'react-router-dom';

/**
 * En-tête commun à toutes les pages d'administration.
 *
 * L'overline « ADMINISTRATION » n'est pas décorative : sous 900 px la sidebar
 * devient une barre horizontale et perd sa force de contexte, c'est alors le
 * seul rappel du territoire où l'on se trouve. Le titre du document joue le
 * même rôle quand l'admin a son propre tournoi ouvert dans un autre onglet.
 */
export function AdminPageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  useEffect(() => {
    document.title = `Administration · ${title} — EGIDE`;
    return () => {
      document.title = 'EGIDE';
    };
  }, [title]);

  return (
    <div className="page-header">
      <div>
        <div className="overline">Administration</div>
        <h1 className="page-title">{title}</h1>
        {subtitle ? (
          <div className="page-subtitle" role="status">
            {subtitle}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Refus d'accès. Volontairement distinct de « Page introuvable » : l'admin qui
 * débogue doit pouvoir séparer « je n'ai pas le droit » de « ça n'existe pas ».
 */
export function AdminForbidden() {
  return (
    <div className="empty-state" style={{ marginTop: 64 }}>
      <h2>Accès réservé</h2>
      <p>Cette section est réservée à l’administration d’EGIDE.</p>
      <Link className="btn btn-secondary" to="/tournois">
        Retour à mes tournois
      </Link>
    </div>
  );
}

/**
 * Bandeau des fiches consultées en administration.
 *
 * Réservé à la fiche, jamais posé sur toutes les pages admin : un bandeau vu
 * à chaque écran devient invisible en trois jours. Ici il est utile, parce
 * que la fiche ressemble trait pour trait à celle d'un organisateur.
 */
export function AdminReadOnlyBanner({
  organizerPseudo,
  tournamentId,
  isOwner,
  cancelled,
}: {
  organizerPseudo?: string | null;
  tournamentId?: string;
  isOwner?: boolean;
  /** Tournoi annulé : le liseré passe au rouge, l'état saute aux yeux. */
  cancelled?: boolean;
}) {
  return (
    <div
      className={`banner banner-info${cancelled ? ' banner-info-danger' : ''}`}
      style={{ marginBottom: 'var(--sp-4)' }}>
      <strong>
        Lecture seule{organizerPseudo ? ` — tournoi de ${organizerPseudo}` : ''}.
      </strong>{' '}
      Vous consultez cette fiche en tant qu’administrateur. La gestion appartient à
      l’organisateur : inscriptions, check-in, scores et classement ne sont pas modifiables ici.
      {isOwner && tournamentId ? (
        <div style={{ marginTop: 'var(--sp-2)' }}>
          <Link to={`/tournois/${tournamentId}`}>Ouvrir en tant qu’organisateur →</Link>
        </div>
      ) : null}
    </div>
  );
}

/** Attente de la réponse de `is_admin()` — jamais une redirection. */
export function AdminLoading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 24 }}>
      {Array.from({ length: 10 }, (_, index) => (
        <div key={index} className="skeleton" style={{ height: 52 }} />
      ))}
    </div>
  );
}
