import { Link, useParams } from 'react-router-dom';

const Sections: Record<string, { title: string; text: string }> = {
  inscrits: {
    title: 'Inscrits',
    text: 'Vous pourrez consulter et gérer la liste des joueurs inscrits, la liste d’attente et les désistements.',
  },
  'check-in': {
    title: 'Check-in',
    text: 'Le jour du tournoi, pointez les joueurs présents en quelques secondes.',
  },
  rondes: {
    title: 'Rondes & scores',
    text: 'Générez les appariements, saisissez les scores et suivez le classement en direct.',
  },
  listes: {
    title: 'Listes d’armées',
    text: 'Collectez et validez les listes d’armées des joueurs avant le tournoi.',
  },
};

/** Page « à venir » commune aux sections non encore développées. */
export function PlaceholderPage({ section }: { section: string }) {
  const { id } = useParams();
  const info = Sections[section];

  return (
    <div className="empty-state" style={{ marginTop: 64 }}>
      <h2>{info.title}</h2>
      <span className="badge-soon" style={{ fontSize: 12, padding: '2px 8px' }}>
        Bientôt disponible
      </span>
      <p style={{ maxWidth: 400 }}>{info.text}</p>
      <Link to={`/tournois/${id}`}>← Retour au tournoi</Link>
    </div>
  );
}
