# EGIDE — résumé du projet

> Document de passation : à donner tel quel au début d'une nouvelle conversation pour
> reprendre le travail sans repartir de zéro. Dernière mise à jour : 22 août 2026.

## 1. Le projet en trois phrases

EGIDE est une application de tournois **Warhammer Age of Sigmar** : annuaire d'événements,
inscriptions, déroulé du jour J (pointage, appariements suisses, scores, classement),
équipes et listes d'armées. Interface **entièrement en français**, public francophone.
Le porteur du projet **débute en développement** : avancer par petits incréments testables
et expliquer les étapes.

## 2. Architecture — deux applications, une base

| Application | Rôle | Techno | Racine |
|---|---|---|---|
| **App mobile** | Le produit : joueurs et organisateurs | Expo **SDK 54** + expo-router | `src/` |
| **Back office** | Console web des organisateurs (jour J) | Vite + React 19 + react-router-dom | `backoffice/` |

Deux projets npm **séparés** (chacun son `package.json`). Du code proche existe en double des
deux côtés (`lib/supabase.ts`, `lib/tournaments.ts`, `lib/ordinal.ts`, `hooks/use-session.ts`,
`components/status-badge.tsx`) — c'est **volontaire**, mais une modification métier doit souvent
être répercutée des deux côtés.

**Backend : Supabase** (projet `ajmhcslxlkjlvaxcazav`, région eu-west-3).

### Règle d'architecture centrale

**La logique métier vit dans Postgres, pas dans le client.** 22 migrations numérotées et
**immuables** dans `supabase/migrations/` — pour changer quoi que ce soit, on **ajoute** une
migration `00NN_description.sql`, on n'édite jamais une existante. Les fonctions sont en
`security definer` avec des `grant`/`revoke` explicites, appelées via `supabase.rpc(...)`.

Fonctions clés : `register_for_tournament`, `promote_waitlist`, `start_tournament`,
`swiss_pair` / `generate_next_round`, `set_pairing_score`, `tournament_standings`,
`drop_player`, `close_tournament`, `create_team` / `join_team`, `submit_army_list` /
`review_army_list`.

## 3. Règles métier (validées par le porteur, expert AoS)

- **Le bye vaut une victoire 15 à 5** (et 3 tactiques au classement).
- **Six départages, dans cet ordre** : victoires → points marqués → tactiques marquées →
  différentiel de score → force des adversaires (SoS) → tirage au sort *stable*.
- Une partie vaut **80 points maximum** : 50 de primaire (12 scénarios) + 30 de tactiques.
  Chaque joueur choisit **2 cartes de 3 tactiques parmi 6**.
- **Appariement suisse** : jamais deux fois le même adversaire, bye tournant, retour arrière
  si la suite s'avère impossible. Issue de secours si aucun appariement n'est possible sans
  revanche (l'organisateur doit l'autoriser explicitement).
- **Scénario de ronde** : saisi en texte libre par l'organisateur (la liste officielle change
  à chaque General's Handbook).
- **Appariements publiés immédiatement** à la génération (pas de bouton « publier »).

## 4. État d'avancement

**Livré et testé : EPIC-1 à EPIC-6** — soit la totalité du MVP phase 1.

| EPIC | Contenu | État |
|---|---|---|
| 1 | Création et gestion de tournoi | Livré |
| 2 | Annuaire, inscriptions, liste d'attente, filtres | Livré |
| 3 | Jour J : check-in, rondes suisses, scores, classement, abandon, clôture + **toute la vue joueur** | Livré |
| 4 | Équipes (création, code d'invitation, roster, capitanat) | Livré |
| 5 | Listes d'armées (texte + PDF, relecture organisateur) | Livré |
| 6 | Notifications push | **Codé, réception non vérifiée** |
| 12 | Administration (rôle admin, supervision) | Spécifié, non codé |

### Le seul point en suspens : EPIC-6

Tout est en place (table `push_tokens`, file `push_outbox` + 5 triggers, Edge Function
`send-push` déployée, préférences dans le Profil, tap → écran concerné). La chaîne a été
vérifiée jusqu'à l'envoi. **Ce qui manque : la réception sur un vrai téléphone.**
Expo Go **ne reçoit plus les push distantes depuis le SDK 53** — il faut un development build
(`eas build --profile development`). Le `projectId` EAS est déjà dans `app.json`.

### Écrans existants

**Mobile** : parcours d'entrée (`bienvenue`, `connexion`, `inscription`, `creer-profil`),
4 onglets (Événements, Tournois, Équipes, Profil), fiche événement, tables d'une ronde,
classement, liste d'armée, création de tournoi, création et fiche d'équipe.

**Back office** : connexion, mes tournois, fiche tournoi, inscrits, check-in,
rondes & scores, classement, listes d'armées.

## 5. Décisions structurantes déjà prises (ne pas re-litiger)

1. **Back office web séparé** pour les organisateurs, plutôt que la gestion dans l'app mobile.
2. **Authentification au lancement de l'app**, pas dans l'onglet Profil. Une garde déclarative
   dans `src/app/_layout.tsx` décide de la route (jamais dans un `useEffect` : sinon l'écran
   d'accueil clignote pour qui est déjà connecté).
3. **Mode invité assumé** : l'annuaire, les tables et les classements sont publics. « Continuer
   sans compte » est un vrai chemin, mémorisé (l'écran d'accueil ne revient pas à chaque
   lancement).
4. **Création de profil obligatoire** après la première connexion : un compte sans pseudo est
   inutilisable en tournoi.
5. **Région choisie dans une liste fermée** (18 régions françaises), obligatoire sur le profil,
   la création de tournoi et la création d'équipe. La saisie libre produisait
   « Rhone alpes Auvergne » face à « Auvergne-Rhône-Alpes ».
6. **Pas de temps réel** : rafraîchissement en tirant vers le bas. Dix fois moins coûteux à
   livrer et à tester.
7. **Scores saisis par l'organisateur uniquement**, pas par les joueurs.
8. **Administration dans le back office web uniquement** — aucune page admin mobile pour
   l'instant.
9. **SDK 54 imposé** : l'App Store du porteur plafonne Expo Go à la 54.0.2. Ne pas remonter
   en SDK 57 sans son accord explicite.

## 6. Conventions de code

- **Tout le texte utilisateur, les commentaires et les noms de routes sont en français.**
  Identifiants de code en anglais, colonnes SQL en anglais snake_case.
- Les commentaires expliquent le **pourquoi métier**, pas le quoi.
- **Aucune formulation genrée** : on ne connaît pas le genre des joueurs. Écrire « tu as le
  bye », pas « il est exempt ».
- Thème clair/sombre systématique via `@/constants/theme` + `useColorScheme()`, jamais de
  couleur en dur.
- **Règle de contraste absolue** : tout texte sur fond doré (`tint`) utilise `OnTint` —
  blanc en clair, **noir** en sombre. Blanc sur or sombre donne environ 1,9:1, illisible.
- Statuts et libellés centralisés dans `lib/tournaments.ts`.
- Pattern de données : **hook `use-*` → client Supabase → composant**. Toujours garder
  `if (!supabase) …` : sans clés `.env`, `supabase` vaut `null`.

## 7. Méthode de travail (à respecter)

- Le backlog est tenu dans **`BACKLOG.md`**, alimenté par l'agent **`product-owner`**.
- **Avis de l'agent `ux-ui` obligatoire avant de coder tout écran ou mise en page.**
- L'agent `qa-tester` teste dans le navigateur. Les agents sont dans `.claude/agents/`.
- Il n'y a **pas de tests automatisés** : la validation se fait en lançant l'app
  (`npm run web`) et en parcourant les écrans, plus des **assertions SQL** pour les
  fonctions de base (précédent : 13 assertions pour les équipes, 8 pour les listes d'armées).
- Un commit par US livrée, message en français expliquant le **pourquoi**.

## 8. Pièges rencontrés (leçons chèrement acquises)

1. **RLS filtre les lignes, jamais les colonnes.** L'annuaire des équipes étant public, la
   politique « lecture pour tous » exposait aussi `invite_code` : n'importe qui pouvait
   rejoindre n'importe quelle équipe. Correction : `revoke select` puis `grant select`
   colonne par colonne + fonction dédiée (migration 0016). **À vérifier dès qu'une table
   publique contient un secret.**
2. **Ne jamais appeler `refresh()` après chaque écriture** dans un écran de saisie rapide :
   le rechargement fait clignoter le tableau et détruit le focus clavier. Garder un état
   `saved` local.
3. **Toute action différée doit recevoir sa cible explicitement**, jamais la déduire de
   l'état (les fermetures vieillissent : un bouton « Annuler » re-pointait au lieu de
   dé-pointer).
4. **Amorçage de formulaire** : un `useEffect` de préremplissage doit attendre **tous** les
   chargements amont (session → tournoi → inscription → profil), car chaque hook aval
   retombe `loading=false` quand son paramètre est encore `undefined`.
5. **`router.back()` échoue** sur un écran ouvert par lien direct : prévoir un repli
   `router.replace` vers l'écran parent.
6. **Le `Modal` de React Native Web ne disparaît pas** quand `visible` repasse à faux :
   le monter conditionnellement (`{open ? <Modal/> : null}`).
7. **Un `useMemo` placé après un retour anticipé** casse l'ordre des hooks (page blanche) :
   déclarer tous les hooks avant tout `return` conditionnel.
8. **Le projet Supabase se met en veille** après environ une semaine d'inactivité (palier
   gratuit) : le domaine ne résout plus, l'app affiche « Network request failed ». Réveil en
   une minute depuis le dashboard ou via l'outil MCP (`restore_project`).
9. **Un état partagé entre écrans ne peut pas vivre dans deux `useState` séparés** : le
   drapeau invité est un store hors React (`src/hooks/use-guest.ts`).

## 9. Environnement et accès

- **Clés** : chaque app lit son `.env` (copier le `.env.example`).
  Mobile : `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
  Back office : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- **Lancer** : `npm run web` (mobile, port 8081) et `npm --prefix backoffice run dev`
  (port 5173).
- **Comptes de test** (base de développement — à purger avant toute mise en production) :
  `nabil.selmane+egide-qa@gmail.com` (TesteurQA, organisateur des tournois de test),
  `+egide-qa2/3/4`, et une douzaine de `joueur.*@test.egide.local`.
  Les mots de passe ne sont pas notés ici : les redemander ou les réinitialiser en SQL.
- **Supabase exige la confirmation d'email** et son serveur d'envoi est vite saturé. Pour le
  développement : dashboard → Authentication → Sign In / Providers → Email → décocher
  « Confirm email ». Sinon, confirmer les comptes directement en SQL.
- **Design system publié** sur claude.ai/design (projet « EGIDE »), sources dans
  `design-system/`. `src/constants/theme.ts` fait foi, les fiches suivent.

## 10. Prochaines étapes possibles

1. **Finir l'EPIC-6** : development build EAS, puis vérifier la réception d'une notification.
2. **EPIC-12 Administration** (spécifié dans `BACKLOG.md`) : rôle admin en base, supervision
   des tournois, comptes et équipes dans le back office. Recommandé **en tête de phase 2** :
   c'est la condition pour ouvrir l'app à des inconnus.
3. **EPIC-7** : tournois par équipes et appariements capitaines (le gros morceau de valeur).
4. Améliorations notées : sauvegarde locale des scores en cours de saisie (coupure réseau),
   export CSV des inscrits, formulaire de création de tournoi dans le back office,
   partage du code d'invitation par lien profond.

## 11. Documents de référence dans le dépôt

| Fichier | Contenu |
|---|---|
| `CLAUDE.md` | Instructions permanentes (conventions, commandes, architecture) |
| `BACKLOG.md` | Tous les EPICs et User Stories, avec notes de livraison |
| `CAHIER_DES_CHARGES.md` | Périmètre et phasage d'origine |
| `RESUME_PROJET.md` | Ce document |
| `backoffice/README.md` | Spécificités du back office |
