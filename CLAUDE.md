# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## À lire avant de coder (Expo SDK 54)

Ce projet tourne sur **Expo SDK 54** (voir `package.json` : `expo@^54.0.0`, `react-native@0.81`, `react@19.1`). Les API Expo changent souvent d'une version à l'autre — consulte la doc versionnée **https://docs.expo.dev/versions/v54.0.0/** avant d'écrire du code qui touche à un module `expo-*`.

**Le SDK 54 est imposé, pas subi** : l'App Store du porteur plafonne Expo Go à la 54.0.2. Ne jamais remonter de SDK sans son accord explicite.

## Contexte projet

EGIDE est une app de tournois **Warhammer Age of Sigmar** (organisation, annuaire d'événements, équipes). Interface **en français**, public francophone. Le porteur débute en développement : avancer par petits incréments testables, expliquer les étapes.

**Au début de toute session de travail sur le code, lire `RESUME_PROJET.md` avant d'agir.** C'est le document de passation : il dit où en est le projet, ce qui a déjà été tranché, et les pièges déjà payés. Le relire coûte une minute ; le sauter fait re-litiger des décisions et retomber dans des pièges documentés. Inutile pour une simple question ponctuelle.

Documents de référence du dépôt, par ordre d'utilité :
- **`RESUME_PROJET.md`** — document de passation : état d'avancement, décisions déjà tranchées, pièges rencontrés, comptes de test. À lire au démarrage, et dès qu'une question dépasse le fichier courant.
- `BACKLOG.md` — tous les EPICs et User Stories, avec notes de livraison (tenu par l'agent `product-owner`).
- `CAHIER_DES_CHARGES.md` — périmètre et phasage d'origine.
- `PAIEMENTS.md` — architecture des paiements (Stripe pour les inscriptions, IAP pour le premium), **à lire avant la première ligne de code de paiement**.
- `backoffice/README.md` — spécificités du back office.

## Deux applications, un même Supabase

Le dépôt contient **deux front-ends** qui partagent la même base Supabase (mêmes tables, mêmes fonctions RPC) :

| App | Rôle | Techno | Racine |
|---|---|---|---|
| **App mobile** (racine) | Le produit : joueurs et organisateurs sur iOS/Android/web | Expo + expo-router | `src/` |
| **Backoffice** | Console web des organisateurs (check-in, saisie scores, rondes, circuits) | Vite + React 19 + react-router-dom v7 | `backoffice/` |

Les deux sont des projets npm **séparés** (chacun son `package.json` et son `node_modules`). Le backoffice est exclu du `tsconfig.json` racine. Du code proche existe en double des deux côtés (`lib/supabase.ts`, `lib/tournaments.ts`, `lib/ordinal.ts`, `lib/push.ts`, `hooks/use-session.ts`, `hooks/use-standings.ts`, `components/status-badge.tsx`) — c'est volontaire : **une modification métier doit souvent être répercutée dans les deux**.

## Commandes

### App mobile (racine)
```bash
npm install
npm start          # expo start (choisir la plateforme dans le terminal)
npm run web        # navigateur, port 8081 — le plus rapide pour tester
npm run android    # émulateur Android
npm run ios        # simulateur iOS
npm run lint       # expo lint
```

### Backoffice
```bash
npm --prefix backoffice install
npm --prefix backoffice run dev     # serveur Vite, port 5173
npm --prefix backoffice run build   # tsc -b && vite build
npm --prefix backoffice run lint    # oxlint
```

### Validation
Il n'y a **pas de suite de tests automatisés**. La validation se fait en deux temps :
1. lancer l'app (`npm run web`) et parcourir les écrans — l'agent `qa-tester` teste dans le navigateur ;
2. pour toute fonction SQL, écrire des **assertions SQL** exécutées contre la base (précédents : 13 assertions pour les équipes, 8 pour les listes d'armées).

## Configuration (obligatoire pour démarrer)

Chaque app lit ses clés Supabase depuis un `.env` (copier le `.env.example` correspondant) :
- Mobile : `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- Backoffice : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

Si les clés manquent, `supabase` vaut `null` et `isSupabaseConfigured` est `false` : chaque écran doit gérer ce cas (ne jamais supposer que le client existe).

## Architecture

### Navigation mobile — expo-router (file-based)
Les routes vivent dans `src/app/` (alias `@/*` → `src/*`, `typedRoutes` et `reactCompiler` activés). `src/app/_layout.tsx` est le **cerveau du routage** : il lit session / profil / mode invité et redirige. Les groupes :
- `(auth)/` — bienvenue, connexion, inscription, création de profil
- `(tabs)/` — 4 onglets : Événements (`index`), Tournois, Équipes, Profil
- `evenements/[id]/…` et `equipes/[id]` — écrans poussés, **publics** (un lien profond ne doit jamais être détourné vers l'accueil : voir la variable `onPublicRoute`)

La garde est **déclarative** (`<Redirect>` calculé pendant le rendu), **jamais dans un `useEffect`** : sinon l'écran d'accueil clignote pour qui est déjà connecté. Tant que `booting` est vrai, on ne rend que le splash.

### Couches de données
Pattern répété partout : **hook `use-*` → client Supabase → composant**.
- `src/lib/` : types + libellés FR + helpers purs (ex. `tournaments.ts` définit `TournamentStatus`, `StatusLabels`, `formatEventDate`). Pas d'appels réseau ici.
- `src/hooks/use-*.ts` : chargent/écrivent via `supabase`, exposent `{ data, loading, refresh }`. Toujours garder `if (!supabase) …`.
- `src/components/` : présentation, thémée clair/sombre via `@/constants/theme` et `useColorScheme()`.

**Pas de temps réel** (décision assumée) : rafraîchissement en tirant vers le bas.

### Logique métier = fonctions Postgres (RPC)
Le cœur du tournoi vit dans la base, pas dans le client : les migrations `supabase/migrations/*.sql` définissent des fonctions `security definer` appelées via `supabase.rpc(...)`. Elles se terminent toujours par leurs `grant`/`revoke` explicites (réservées à `authenticated`, `revoke` de `anon`).

Familles de fonctions : inscriptions (`register_for_tournament`, `withdraw_from_tournament`, `promote_waitlist`, `remove_registration`), jour J (`set_check_in`, `start_tournament`, `swiss_pair` / `generate_next_round`, `set_pairing_score`, `set_round_scenario`, `drop_player`, `close_tournament`), classement (`tournament_standings`, `circuit_standings`), équipes (`create_team`, `join_team`, `get_invite_code`…), listes (`submit_army_list`, `review_army_list`).

Règles enfouies dans le SQL à connaître : `bye_scores()` — un bye vaut victoire **15 à 5** (+3 tactiques) ; `already_met()` — l'appariement suisse ne rejoue jamais un adversaire, avec bye tournant et retour arrière.

**Les migrations sont numérotées et immuables** : pour changer le schéma ou une fonction, **ajouter une nouvelle migration** `00NN_description.sql`, ne jamais éditer une existante.

### Comment une migration atteint la base
Il n'y a **pas de CLI Supabase configurée** dans le dépôt (pas de `supabase/config.toml`, pas de stack locale) : le fichier sous `supabase/migrations/` est la source de vérité versionnée, mais il faut l'appliquer au projet distant — via le serveur MCP `supabase` déclaré dans `.mcp.json` (`apply_migration`) ou l'éditeur SQL du dashboard. Écrire le fichier ne suffit donc jamais : vérifier ensuite que la fonction existe bien en base.

Le projet Supabase du palier gratuit **se met en veille** après ~1 semaine d'inactivité (« Network request failed » côté app) — le réveiller depuis le dashboard ou via MCP `restore_project`.

### Notifications push
Chaîne complète : `push_tokens` (jeton du device, migration 0021) → `push_outbox` (file + 5 triggers `queue_*`, migration 0022) → Edge Function `supabase/functions/send-push` (unique porte de sortie vers l'API Expo).

La file n'est pas vidée par un cron : **le client appelle `flushPushQueue()`** (`src/lib/push.ts`, dupliqué dans `backoffice/src/lib/push.ts`) après toute action qui crée un événement à notifier. Un tap sur une notif lit `data.url` et fait `router.push(url)` (voir `_layout.tsx`). Web exclu (`Platform.OS === 'web'`), et **Expo Go ne reçoit plus les push distantes depuis le SDK 53** : tester la réception exige un development build (`eas build --profile development`, `projectId` déjà dans `app.json`).

## Conventions

- **Tout le texte utilisateur, les commentaires et les noms de routes sont en français.** Les identifiants de code (variables, types) sont en anglais ; les colonnes SQL en anglais snake_case.
- **Aucune formulation genrée** : on ne connaît pas le genre des joueurs. Écrire « tu as le bye », pas « il est exempt ».
- Commentaires rédigés : ils expliquent le *pourquoi* métier, pas le *quoi*. Garder ce ton.
- Thème clair/sombre systématique via `@/constants/theme` + `useColorScheme()`, jamais de couleur en dur. Le design system y est centralisé : `Colors` (accent doré `tint`), paires sémantiques clair/sombre (`GreenColor`, `RedColor`, `TintBackground`…), échelle `Spacing` (`half`…`six`) pour les marges, `MaxContentWidth`. **Règle de contraste** : tout texte posé sur un fond `tint` doit utiliser `OnTint` (blanc en clair, noir sur l'or sombre) — sinon le contraste tombe à ~1,9:1, illisible.
- Statuts et libellés centralisés dans `lib/tournaments.ts` (`StatusLabels`, `TypeLabels`, `ActiveRegistrationStatuses`) — réutiliser, ne pas redéfinir.
- Le backoffice n'a **aucune bibliothèque de composants** : CSS fait main dans `backoffice/src/index.css`, variables reprenant le thème doré.
- Un commit par US livrée, message en français expliquant le **pourquoi**.

## Pièges déjà payés cher

1. **RLS filtre les lignes, jamais les colonnes.** Une table publique contenant un secret (ex. `teams.invite_code`) l'expose à tous : `revoke select` puis `grant select` colonne par colonne + fonction dédiée (migration 0016).
2. **Ne jamais appeler `refresh()` après chaque écriture** dans un écran de saisie rapide : le rechargement fait clignoter le tableau et détruit le focus clavier. Garder un état `saved` local.
3. **Toute action différée reçoit sa cible explicitement**, jamais déduite de l'état — les fermetures vieillissent.
4. **Amorçage de formulaire** : un `useEffect` de préremplissage doit attendre **tous** les chargements amont (session → tournoi → inscription → profil) ; chaque hook aval retombe `loading=false` tant que son paramètre est `undefined`.
5. **`router.back()` échoue** sur un écran ouvert par lien direct : prévoir un repli `router.replace` vers l'écran parent.
6. **Le `Modal` de React Native Web ne disparaît pas** quand `visible` repasse à faux : le monter conditionnellement (`{open ? <Modal/> : null}`).
7. **Tous les hooks avant tout `return` conditionnel** : un `useMemo` placé après un retour anticipé casse l'ordre des hooks (page blanche).
8. **Un état partagé entre écrans ne vit pas dans deux `useState`** : le drapeau invité est un store hors React (`src/hooks/use-guest.ts`).

## Agents et workflow du dépôt

Des sous-agents spécialisés sont définis dans `.claude/agents/` : `product-owner` (backlog, périmètre), `ux-ui` (conçoit avant chaque mise en page — **avis UX/UI requis avant de coder un écran**), `developpeur` (implémente), `qa-tester` (teste dans le navigateur, ne corrige pas).

Le design system est publié sur claude.ai/design (projet « EGIDE »), sources HTML dans `design-system/`. **`src/constants/theme.ts` fait foi** ; les fiches suivent.
