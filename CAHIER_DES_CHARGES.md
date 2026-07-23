# EGIDE — Cahier des charges

Application mobile dédiée à la compétition **Warhammer Age of Sigmar** :
organisation de tournois, découverte d'événements, jeu en équipe.

## Décisions structurantes

| Sujet | Décision |
|---|---|
| Plateformes | iOS + Android (cross-platform) |
| Framework | React Native + Expo (TypeScript) |
| Backend | Supabase (PostgreSQL, Auth, Realtime, Storage) |
| Public | France / francophone (interface en français) |
| Modèle économique | Gratuit (projet communautaire pour l'instant) |

## Les trois piliers fonctionnels

### 1. Organisation de tournois
- Création d'un tournoi : nom, lieu, date, format (points, nombre de rondes), capacité.
- Gestion des inscriptions (liste des inscrits, liste d'attente, check-in le jour J).
- **Appariements en rondes suisses automatiques** après chaque ronde.
- Saisie des scores (victoire/défaite + points de partie), classement en temps réel.
- Tie-breakers standards (à préciser en phase de conception : SoS, points cumulés…).

### 2. Trouver des événements
- Liste + carte des tournois à venir, filtres : date, région, format, individuel/équipe.
- Fiche événement détaillée, inscription en un clic depuis l'app.
- Notification quand un tournoi ouvre près de chez soi.

### 3. Équipes
- Créer/rejoindre une équipe, gestion du roster, capitaine.
- Tournois par équipes : **équipes de 3 (standard FR)**, **5–8 (type ETC)** et
  **taille libre** définie par l'organisateur, avec appariements capitaines.

## Fonctionnalités transverses
- Comptes utilisateurs (Supabase Auth).
- Profil joueur : historique de résultats, factions jouées, futur classement ELO.
- Notifications push (début de ronde, inscriptions, etc.).
- Chat : messagerie d'équipe et fil de discussion par tournoi (modération à prévoir).

## Gestion des listes d'armées
Objectif final : **vérification poussée** (parsing des listes, contrôle des points
et de la légalité selon le General's Handbook en vigueur).

⚠️ Contraintes identifiées :
- Les données de jeu (unités, points) sont la propriété de Games Workshop —
  pas de redistribution telle quelle ; à étudier (saisie communautaire, imports…).
- Maintenance à chaque saison GHB / FAQ.

→ Livré en **phase 2**. En phase 1 : soumission simple de la liste (texte/PDF)
avec validation manuelle par l'organisateur. L'architecture prévoit l'évolution.

## Phasage proposé

- **Phase 0 — Fondations** : setup Expo + Supabase, auth, navigation, design de base.
- **Phase 1 — MVP** : tournois individuels (création → rondes suisses → classement),
  annuaire d'événements avec inscription, équipes comme entités sociales,
  soumission simple des listes, notifications push essentielles.
- **Phase 2** : tournois par équipes avec appariements capitaines, chat,
  profil enrichi / historique, vérification poussée des listes.
- **Phase 3** : classement ELO national, carte interactive, statistiques méta,
  publication sur les stores (App Store + Play Store).

## Contexte de travail
Le porteur du projet débute en développement : chaque étape doit être expliquée,
testable simplement, et avancer par petits incréments validés.
