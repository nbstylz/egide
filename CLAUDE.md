# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## À lire avant de coder (Expo SDK 54)

Ce projet tourne sur **Expo SDK 54** (voir `package.json` : `expo@^54.0.0`, `react-native@0.81`, `react@19.1`). Les API Expo changent souvent d'une version à l'autre — consulte la doc versionnée **https://docs.expo.dev/versions/v54.0.0/** avant d'écrire du code qui touche à un module `expo-*`.

## Contexte projet

EGIDE est une app de tournois **Warhammer Age of Sigmar** (organisation, annuaire d'événements, équipes). Interface **en français**, public francophone. Le porteur débute en développement : avancer par petits incréments testables, expliquer les étapes. Voir `CAHIER_DES_CHARGES.md` pour le périmètre et le phasage.

## Deux applications, un même Supabase

Le dépôt contient **deux front-ends** qui partagent la même base Supabase (mêmes tables, mêmes fonctions RPC) :

| App | Rôle | Techno | Racine |
|---|---|---|---|
| **App mobile** (racine) | Le produit : joueurs et organisateurs sur iOS/Android/web | Expo + expo-router | `src/` |
| **Backoffice** | Console web des organisateurs (check-in, saisie scores, rondes) | Vite + React 19 + react-router-dom v7 | `backoffice/` |

Les deux sont des projets npm **séparés** (chacun son `package.json` et son `node_modules`). Le backoffice est exclu du `tsconfig.json` racine. Du code proche existe en double des deux côtés (`lib/supabase.ts`, `lib/tournaments.ts`, `lib/ordinal.ts`, `hooks/use-session.ts`, `components/status-badge.tsx`) — c'est volontaire : **une modification métier doit souvent être répercutée dans les deux**.

## Commandes

### App mobile (racine)
```bash
npm install
npm start          # expo start (choisir la plateforme dans le terminal)
npm run web        # lancer sur navigateur (le plus rapide pour tester)
npm run android    # émulateur Android
npm run ios        # simulateur iOS
npm run lint       # expo lint
```

### Backoffice
```bash
cd backoffice
npm install
npm run dev        # serveur Vite de dev
npm run build      # tsc -b && vite build
npm run lint       # oxlint
```

Il n'y a **pas de suite de tests automatisés** : la validation se fait en lançant l'app (souvent via `npm run web`) et en parcourant les écrans. L'agent `qa-tester` teste dans le navigateur.

## Configuration (obligatoire pour démarrer)

Chaque app lit ses clés Supabase depuis un `.env` (copier le `.env.example` correspondant) :
- Mobile : `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- Backoffice : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

Si les clés manquent, `supabase` vaut `null` et `isSupabaseConfigured` est `false` : chaque écran doit gérer ce cas (ne jamais supposer que le client existe).

## Architecture

### Navigation mobile — expo-router (file-based)
Les routes vivent dans `src/app/` (alias `@/*` → `src/*`, `typedRoutes` activé). `src/app/_layout.tsx` est le **cerveau du routage** : il lit session / profil / mode invité et redirige (`/(auth)/bienvenue`, `/(auth)/creer-profil`, `/(tabs)`). Les groupes :
- `(auth)/` — bienvenue, connexion, inscription, création de profil
- `(tabs)/` — 4 onglets : Événements (`index`), Tournois, Équipes, Profil
- `evenements/[id]/…` et `equipes/[id]` — écrans poussés, **publics** (deep-link non détourné vers l'accueil)

### Couches de données
Pattern répété partout : **hook `use-*` → client Supabase → composant**.
- `src/lib/` : types + libellés FR + helpers purs (ex. `tournaments.ts` définit `TournamentStatus`, `StatusLabels`, `formatEventDate`). Pas d'appels réseau ici.
- `src/hooks/use-*.ts` : chargent/écrivent via `supabase`, exposent `{ data, loading, refresh }`. Toujours garder `if (!supabase) …`.
- `src/components/` : présentation, thémée clair/sombre via `@/constants/theme` et `useColorScheme()`.

### Logique métier = fonctions Postgres (RPC)
Le cœur du tournoi vit dans la base, pas dans le client : les migrations `supabase/migrations/*.sql` définissent des fonctions `security definer` appelées via `supabase.rpc(...)`. Exemples clés :
- `0010_standings` / `tournament_standings()` — classement (tie-breakers)
- `0011_swiss_pairing` / `generate_next_round()` — appariements suisses (ne rejoue jamais un adversaire, gestion du bye)
- `0012`–`0014` — clôture de ronde, abandon, forfait
- `bye_scores()` — un bye vaut victoire **15 à 5** (règle métier)

Les migrations sont **numérotées et immuables** : pour changer le schéma ou une fonction, **ajouter une nouvelle migration** `00NN_description.sql`, ne jamais éditer une existante. Chaque fonction termine par ses `grant`/`revoke` explicites (souvent réservée à `authenticated`, `revoke` de `anon`).

### Notifications push
`src/lib/push.ts` (jeton du device) + tables `push_tokens` / `push_outbox` (migrations 0021-0022). Un tap sur une notif lit `data.url` et fait `router.push(url)` (voir `_layout.tsx`). Web exclu (`Platform.OS === 'web'`).

## Conventions

- **Tout le texte utilisateur, les commentaires et les noms de routes sont en français.** Les identifiants de code (variables, types) sont en anglais ; les colonnes SQL en anglais snake_case.
- Commentaires rédigés : ils expliquent le *pourquoi* métier, pas le *quoi*. Garder ce ton.
- Thème clair/sombre systématique via `@/constants/theme` + `useColorScheme()`, jamais de couleur en dur. Le design system y est centralisé : `Colors` (accent doré `tint`), paires sémantiques clair/sombre (`GreenColor`, `RedColor`, `TintBackground`…), échelle `Spacing` (`half`…`six`) pour les marges, `MaxContentWidth`. **Règle de contraste** : tout texte posé sur un fond `tint` doit utiliser `OnTint` (blanc en clair, noir sur l'or sombre) — sinon le contraste devient illisible.
- Statuts et libellés centralisés dans `lib/tournaments.ts` (`StatusLabels`, `TypeLabels`, `ActiveRegistrationStatuses`) — réutiliser, ne pas redéfinir.

## Agents et workflow du dépôt

Des sous-agents spécialisés sont définis dans `.claude/agents/` : `product-owner` (backlog, périmètre), `ux-ui` (conçoit avant chaque mise en page — **avis UX/UI requis avant de coder un écran**), `developpeur` (implémente), `qa-tester` (teste dans le navigateur, ne corrige pas). Le backlog produit est tenu dans `BACKLOG.md`.
