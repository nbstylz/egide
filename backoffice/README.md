# EGIDE — Back office organisateur

Interface web de gestion des tournois, réservée aux organisateurs. Elle partage
la base Supabase et les comptes de l'application mobile EGIDE : on se connecte
ici avec les mêmes identifiants (la création de compte se fait dans l'app mobile).

## Démarrer

```bash
npm --prefix backoffice run dev
```

L'interface est alors disponible sur http://localhost:5173.

Avant le premier lancement, copie `.env.example` en `.env` et renseigne les clés
du projet Supabase (Dashboard Supabase → Settings → API).

## Contenu

- **Connexion** (`/connexion`) — email + mot de passe, mêmes comptes que l'app mobile.
- **Mes tournois** (`/tournois`) — tableau des tournois organisés, trié par date,
  avec statut et jauge d'inscrits. Les tournois terminés ou annulés passent en bas.
- **Fiche tournoi** (`/tournois/:id`) — édition des paramètres (nom, ville, région,
  date, points, rondes, capacité) tant que le tournoi n'est pas en cours, terminé
  ou annulé ; sinon la fiche passe en lecture seule. En bas, la zone de danger
  permet d'annuler le tournoi (confirmation par saisie du mot ANNULER quand des
  joueurs sont inscrits).
- **Sections à venir** — Inscrits, Check-in, Rondes & scores, Listes d'armées.

## Stack

Vite + React + TypeScript, `react-router-dom`, `@supabase/supabase-js`.
Le CSS est fait main (`src/index.css`) avec des variables reprenant le thème doré
d'EGIDE, en modes clair et sombre. Aucune bibliothèque de composants.
