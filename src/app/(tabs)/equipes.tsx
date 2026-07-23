import { SectionScreen } from '@/components/section-screen';

export default function EquipesScreen() {
  return (
    <SectionScreen
      icon="people"
      title="Équipes"
      subtitle="Crée ton équipe, recrute des joueurs et participez ensemble aux tournois par équipes."
      upcoming={[
        'Création d’équipe et gestion du roster',
        'Rejoindre une équipe sur invitation',
        'Tournois par équipes : 3 joueurs (FR), 5–8 (ETC), taille libre',
        'Appariements capitaines',
      ]}
    />
  );
}
