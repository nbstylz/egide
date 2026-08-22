import { Link, useParams } from 'react-router-dom';

import { AdminPageHeader } from '../components/admin-page-header';

const Sections: Record<string, { title: string; text: string }> = {
  listes: {
    title: 'Listes d’armées',
    text: 'Collectez et validez les listes d’armées des joueurs avant le tournoi.',
  },
  'admin-comptes': {
    title: 'Comptes',
    text: 'Rechercher un compte, consulter son activité et le désactiver si nécessaire.',
  },
  'admin-equipes': {
    title: 'Équipes',
    text: 'Renommer une équipe au nom inapproprié ou dissoudre une équipe abandonnée.',
  },
  'admin-journal': {
    title: 'Journal',
    text: 'L’historique des actions d’administration, avec leur auteur et leur motif.',
  },
};

/** Page « à venir » commune aux sections non encore développées. */
export function PlaceholderPage({ section }: { section: string }) {
  const { id } = useParams();
  const info = Sections[section];
  const isAdmin = section.startsWith('admin-');

  return (
    <>
      {isAdmin ? <AdminPageHeader title={info.title} /> : null}
      <div className="empty-state" style={{ marginTop: 64 }}>
        {isAdmin ? null : <h2>{info.title}</h2>}
        <span className="badge-soon" style={{ fontSize: 12, padding: '2px 8px' }}>
          Bientôt disponible
        </span>
        <p style={{ maxWidth: 400 }}>{info.text}</p>
        <Link to={isAdmin ? '/admin/tournois' : `/tournois/${id}`}>
          ← {isAdmin ? 'Retour à l’administration' : 'Retour au tournoi'}
        </Link>
      </div>
    </>
  );
}
