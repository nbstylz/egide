# EGIDE

**Application mobile dédiée à la compétition Warhammer Age of Sigmar** : organisation de tournois, annuaire d'événements et jeu en équipe. Interface en français, pensée pour la communauté francophone.

> Projet communautaire, gratuit. En cours de développement.

---

## Ce que fait l'application

- **Organiser un tournoi** — création (lieu, date, format, capacité), inscriptions et liste d'attente, check-in le jour J.
- **Faire tourner le tournoi** — appariements en **rondes suisses automatiques**, saisie des scores, **classement en temps réel** avec départages.
- **Trouver des événements** — annuaire public des tournois à venir, fiche détaillée, inscription depuis l'app.
- **Vue joueur** — ses tables, le classement, le podium, son parcours.
- **Équipes** — créer / rejoindre une équipe, gestion du roster et du capitaine.
- **Listes d'armées** — soumission (texte / PDF) et validation par l'organisateur.
- **Notifications push** aux moments clés (ouverture d'inscriptions, début de ronde, etc.).

Le périmètre complet et le phasage sont décrits dans [`CAHIER_DES_CHARGES.md`](./CAHIER_DES_CHARGES.md).

---

## Architecture

Le dépôt contient **deux front-ends** qui partagent une **même base Supabase** (mêmes tables, mêmes fonctions) :

| Application | Rôle | Techno | Dossier |
|---|---|---|---|
| **App mobile** | Le produit : joueurs et organisateurs (iOS / Android / web) | Expo SDK 54 · expo-router · React Native | `src/` |
| **Backoffice** | Console web des organisateurs (check-in, scores, rondes) | Vite · React 19 · react-router | `backoffice/` |

Le cœur métier (appariements suisses, classement, inscriptions atomiques…) vit dans **des fonctions PostgreSQL** versionnées sous [`supabase/migrations/`](./supabase/migrations), appelées via RPC. Cela garde les règles au même endroit, quel que soit le client.

**Backend :** Supabase — PostgreSQL, Auth, Storage, Realtime, Edge Functions.

---

## Démarrage

### Prérequis

- [Node.js](https://nodejs.org/) (LTS)
- Un projet [Supabase](https://supabase.com/) (gratuit) pour obtenir l'URL et la clé publique
- Pour tester sur téléphone : l'app **Expo Go**, ou un émulateur Android / simulateur iOS

### 1. App mobile

```bash
# À la racine du dépôt
npm install

# Configuration : copier l'exemple et renseigner les deux clés Supabase
cp .env.example .env
#   EXPO_PUBLIC_SUPABASE_URL=...
#   EXPO_PUBLIC_SUPABASE_ANON_KEY=...

npm run web       # lancer dans le navigateur (le plus rapide)
# ou
npm start         # puis choisir la plateforme (Android / iOS / web)
```

### 2. Backoffice (console organisateur)

```bash
cd backoffice
npm install

# Configuration
cp .env.example .env
#   VITE_SUPABASE_URL=...
#   VITE_SUPABASE_ANON_KEY=...

npm run dev       # serveur de développement Vite
```

> Les clés Supabase se trouvent dans le dashboard du projet : **Project Settings → API**. Elles ne sont **jamais** committées : les fichiers `.env` sont ignorés par git.

---

## Base de données

Le schéma est géré par **migrations numérotées et immuables** dans `supabase/migrations/`. Pour faire évoluer la base, on **ajoute** une nouvelle migration (`00NN_description.sql`) plutôt que de modifier une existante.

---

## Statut

MVP en cours (tournois individuels, annuaire, équipes, listes, notifications). Les prochaines étapes — paiement des inscriptions, tournois par équipes, premium — sont détaillées dans les documents de conception du dépôt.

---

## Licence

Projet personnel / communautaire. Licence à définir.
