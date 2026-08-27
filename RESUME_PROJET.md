# EGIDE — résumé du projet

> Document de passation : à donner tel quel au début d'une nouvelle conversation pour
> reprendre le travail sans repartir de zéro. Dernière mise à jour : 27 août 2026.

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

**La logique métier vit dans Postgres, pas dans le client.** 51 migrations numérotées et
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

**Livré et testé : EPIC-1 à 6 (MVP phase 1), EPIC-12 (administration) et EPIC-9 (profil enrichi).**
Migrations 0001 à 0051.

| EPIC | Contenu | État |
|---|---|---|
| 1 | Création et gestion de tournoi | Livré |
| 2 | Annuaire, inscriptions, liste d'attente, filtres | Livré |
| 3 | Jour J : check-in, rondes suisses, scores, classement, abandon, clôture + **toute la vue joueur** | Livré |
| 4 | Équipes (création, code d'invitation, roster, capitanat) | Livré |
| 5 | Listes d'armées (texte + PDF, relecture organisateur) | Livré |
| 6 | Notifications push | **Codé, réception non vérifiée** |
| 9 | Profil enrichi : historique, factions jouées, **déclaration de faction** | Livré (2026-08-27) |
| 7 | **Tournois par équipes** : les 9 US, inscription → appariement capitaines → classement | Livré (2026-08-27) |
| 8 | **Chat** : fils de tournoi et d'équipe, modération, signalement | Livré (2026-08-27) |
| 10 | Vérification des listes | **Instruit, en attente d'arbitrage** (`ETUDE_LISTES.md`) |
| 11 | Phase 3 : ELO national et statistiques méta livrés ; carte et stores bloqués | Partiel (2026-08-27) |
| 12 | Administration de la plateforme (6 US) | Livré (2026-08-22), validé en navigateur |

Post-MVP livré par ailleurs : Circuit FR (+ page publique partageable), duplication de
tournoi, export CSV du classement, rappel push J-1.

### Le seul point en suspens : EPIC-6

Tout est en place (table `push_tokens`, file `push_outbox` + 5 triggers, Edge Function
`send-push` déployée, préférences dans le Profil, tap → écran concerné). La chaîne a été
vérifiée jusqu'à l'envoi. **Ce qui manque : la réception sur un vrai téléphone.**
Expo Go **ne reçoit plus les push distantes depuis le SDK 53** — il faut un development build
(`eas build --profile development`). Le `projectId` EAS est déjà dans `app.json`.

### Écrans existants

**Mobile** : parcours d'entrée (`bienvenue`, `connexion`, `inscription`, `creer-profil`),
4 onglets (Événements, Tournois, Équipes, Profil), fiche événement, tables d'une ronde,
classement, liste d'armée, création de tournoi, création et fiche d'équipe,
**historique du joueur** (`/historique`, poussé depuis le Profil).

**Back office** : connexion, mes tournois, fiche tournoi, inscrits, check-in,
rondes & scores, classement, listes d'armées, circuits, page publique d'un circuit,
et la **section Administration** (tableau de bord, tous les tournois, comptes, équipes)
avec son troisième mode de barre latérale sur les routes `/admin/*`.

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
10. **Faction choisie dans une liste fermée** (2026-08-22), même remède que les régions et
    pour la même raison : « nighthaunt » et « Nighthaunt » ne se rencontraient jamais dans
    un regroupement. `src/lib/factions.ts` + `src/components/faction-picker.tsx`, branchés
    sur la soumission de liste **et** sur le profil. **Liste validée le 27 août 2026** par
    le porteur : 24 factions de 4e édition, Beasts of Chaos retirée (passée en Legends),
    Helsmiths of Hashut ajoutée, et **aucune entrée « Autre »** — un fourre-tout se remplit
    toujours, et une ligne « Autre » ne dit rien de personne dans une statistique.
11. **La faction jouée se déclare sur l'inscription, pas sur la liste d'armée**
    (2026-08-27, migrations 0038-0039). `registrations.faction` est la source de
    vérité ; `army_lists.faction` reste une trace que plus personne ne lit pour
    statuer. Deux règles en découlent, gravées en base et pas seulement dans
    l'écran : la faction est **visible des membres connectés, jamais des visiteurs
    anonymes** (c'est le niveau où se trouvait déjà la faction favorite ; en AoS le
    secret qui compte est le *contenu* de la liste, que la 0018 protège) ; et
    **« combler oui, réécrire non »** — une faction absente peut être renseignée
    même après le tournoi, celle qu'ont vue les adversaires ne change plus.
12. **`faction_favorite` ne s'affiche plus dans un contexte de tournoi.** Elle disait
    « ce que j'aime jouer » là où l'écran promettait « ce qui est aligné aujourd'hui ».
    Elle reste légitime au profil et au roster d'équipe. Conséquence assumée : les
    tournois déjà joués n'affichent plus de faction tant que personne n'a comblé.
13. **Un seuil qui décide de montrer un chiffre vit en base, pas dans l'écran.**
    Le taux de victoire méta n'est calculé qu'au-delà de 30 parties, l'ELO
    n'apparaît qu'à partir de 5 parties jouées : sous ces seuils, les fonctions
    renvoient `null` plutôt qu'un nombre. L'écran ne peut donc pas afficher un
    chiffre creux, et le seuil ne se règle qu'à un seul endroit.
14. **Le pouvoir d'administration est vérifié par la base, jamais par l'interface.**
    `is_admin()` est la seule source de vérité ; masquer une entrée de menu n'est qu'un
    confort. Corollaire tenu partout : la lecture seule de l'admin est vraie en base — un
    `update` admin sur le tournoi d'autrui touche zéro ligne, la politique d'écriture de la
    0002 n'ayant jamais été touchée.
15. **Règle d'ergonomie de l'administration : le tableau consulte, le détail agit.** Aucune
    action destructrice dans une ligne de liste. Vaut pour l'annulation de tournoi, la
    désactivation de compte et la dissolution d'équipe.
16. **Aucun pourcentage sur un petit échantillon.** Sur cinq parties, un taux de victoire de
    60 % couvre en réalité de 15 % à 95 % : il n'informe pas, il fait croire à une mesure.
    Les statistiques joueur n'affichent que des entiers ; le taux de victoire est renvoyé à
    l'EPIC-11 (stats méta), où l'échantillon est celui de la communauté.
17. **Mieux vaut ne rien montrer que raconter une histoire fausse.** Appliqué trois fois :
    un inscrit jamais pointé n'apparaît pas dans son historique ; un tournoi en cours ne
    reçoit pas de rang ; `profiles.faction_favorite` n'est jamais substituée à la faction
    réellement jouée.

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
10. **Un écran noir peut ne pas venir du code** (2026-08-22). L'app web affichait du noir
    une fois connecté, sur Firefox. La console ne contenait aucune erreur applicative :
    seulement un `MaxListenersExceededWarning` émis par un `contentscript.js` d'extension.
    En navigation privée — où Firefox désactive les extensions — tout fonctionnait.
    **Avant de chercher un bug de rendu, vérifier la console et rejouer sans extensions.**
    Corollaire de méthode : plusieurs hypothèses plausibles (splash bloqué, modale
    montée en permanence, chemin de cas vide) ont été écartées une à une par des
    mesures — le rendu serveur récupéré en HTTP, le HTML fouillé — et non par
    intuition ; c'est ce qui a évité de « corriger » du code sain.
11. **Écrire des assertions SQL, c'est aussi les écrire juste.** Quatre faux échecs coûteux
    en une session, tous dans le test et non dans le code :
    - dans **une même instruction**, `exists(...)` ne voit pas la ligne qu'une fonction vient
      d'écrire — le snapshot est pris au début de l'instruction. Séparer écriture et lecture.
    - deux lignes écrites dans **une même transaction** partagent `now()` : leur ordre
      relatif est indéfini. Pour tester un tri chronologique, poser des dates explicites.
    - `push_outbox` a la **RLS active sans aucune politique** : illisible depuis un rôle
      client. La lire exige `reset role`.
    - vérifier la longueur de ses propres chaînes de test : « trop court » fait exactement
      10 caractères et passait donc une validation `>= 10`, annulant vraiment un tournoi.
12. **`FOR UPDATE` est interdit sur le côté nullable d'une jointure externe** — écrire
    `for update of t` en nommant la table qu'on verrouille réellement.
13. **`create or replace function` refuse un changement de type de retour.** Ajouter une
    colonne à une fonction table impose un `drop function` préalable, dans la migration.
14. **Une colonne ajoutée à une table dont l'`UPDATE` est ouvert devient écrivable par tous.**
    La 0001 avait accordé `UPDATE` sur `profiles` entière : la colonne `role` de la 0028
    aurait permis à n'importe qui de se nommer administrateur. C'est le piège de la 0016,
    revenu à l'identique. **À vérifier à chaque nouvelle colonne sensible.**
    Revenu une **troisième** fois avec `registrations.faction` (0038). Comme aucun
    client n'écrit directement dans cette table — tout passe par des fonctions
    `security definer` — le droit d'`UPDATE` y a été **retiré** au lieu d'être
    découpé, et le `SELECT` d'`anon` re-accordé colonne par colonne. **Règle
    permanente : toute colonne ajoutée désormais à `registrations` est privée.**
15. **Une contrainte `check` peut interdire une manœuvre qu'on croyait libre.**
    La suppression douce des messages voulait vider le corps ; la contrainte de
    longueur (1 à 2000 caractères) le refusait. L'assertion l'a montré avant tout
    usage. La correction (masquer à la lecture, conserver en base) s'est révélée
    meilleure que l'intention de départ — **écrire l'assertion a produit un
    meilleur design, pas seulement un bug trouvé**.
16. **Toute fonction qui recopie une ligne colonne par colonne est à rouvrir à
    chaque ajout de colonne.** `duplicate_tournament` recopiait `type` sans
    `team_size` : la duplication d'un tournoi par équipes échouait sur une
    contrainte, avec un message incompréhensible pour l'organisateur.

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
- **Deux administrateurs** (2026-08-22) : `NBS` / `nbstylz@gmail.com`, compte du porteur, et
  `TesteurQA` conservé pour les tests. Le premier admin se nomme à la main en SQL (procédure
  en tête de la migration 0028) ; ensuite un admin en nomme d'autres via `set_admin_role`,
  qui consigne la nomination au journal. **La fonction refuse de retirer le dernier admin.**
- **Dépôt GitHub** : `github.com/nbstylz/egide` (public). Aucune clé n'y figure, les `.env`
  sont ignorés. Le code des Edge Functions y est public, sans danger : les règles sont
  appliquées par Postgres, pas par le TypeScript.
- **Aucun navigateur pilotable sur le poste de développement** : les serveurs MCP exigent
  Google Chrome, seul Edge est installé, et l'installer demande les droits administrateur.
  Le parcours navigateur se fait donc **par le porteur**. Ce qui reste vérifiable sans lui :
  assertions SQL, appels HTTP réels (`curl` + JWT obtenu par `/auth/v1/token`), et le HTML
  rendu par le serveur Expo (`curl http://localhost:8081/<route>`) — cette dernière technique
  a permis d'écarter plusieurs fausses pistes.
- **Supabase exige la confirmation d'email** et son serveur d'envoi est vite saturé. Pour le
  développement : dashboard → Authentication → Sign In / Providers → Email → décocher
  « Confirm email ». Sinon, confirmer les comptes directement en SQL.
- **Design system publié** sur claude.ai/design (projet « EGIDE »), sources dans
  `design-system/`. `src/constants/theme.ts` fait foi, les fiches suivent.

## 10. Prochaines étapes

### Ce qui ne peut avancer que par le porteur

1. **EPIC-6 — réception des notifications.** Tout est codé et vérifié jusqu'à
   l'envoi. Il manque `eas login` puis un development build
   (`eas build --profile development --platform android`) : Expo Go ne reçoit
   plus les push distantes depuis le SDK 53. Le mot de passe EAS ne doit jamais
   passer par l'agent.
2. **Parcourir l'application dans un navigateur.** Aucun écran livré depuis le
   27 août n'a jamais été affiché : tout a été vérifié par le typage, le lint et
   des assertions SQL, jamais à l'œil. C'est l'angle mort le plus large du
   projet, et il grandit à chaque écran.
3. **Dix questions de règles AoS**, toutes implémentées sous hypothèse par
   défaut et rectifiables par une migration : voir le tableau en tête de
   l'EPIC-7 dans `BACKLOG.md`. Les cinq premières (protocole d'appariement,
   effectif pair, issue d'une rencontre, départages d'équipe, bye d'équipe)
   méritent une relecture **avant le premier vrai tournoi par équipes**.
4. **Arbitrer l'EPIC-10** (`ETUDE_LISTES.md`) : ouvrir la vérification de
   l'addition, faire vérifier la question juridique, ou classer l'EPIC.
5. **US-11.2, la carte interactive** : elle impose une dépendance native, donc
   un development build et la fin du test dans `npm run web`. C'est un
   changement des conditions de développement, pas un simple écran.
6. **US-11.4, publication sur les stores** : comptes développeur, assets, review.
7. **Deux arbitrages hérités de l'EPIC-12** : ouvrir ou non le contenu des
   listes d'armées à l'administration, et livrer ou non la page « Journal ».

### Ce qui reste faisable sans lui

- **Paiements rail A (Stripe)** : la base est à moitié posée depuis la 0023
  (`registration_payments`, `stripe_accounts`, cron
  `liberer-inscriptions-impayees`), mais **zéro ligne côté client**. Lire
  `PAIEMENTS.md` avant la première ligne de code.
- **US-7.10** : ouvrir les listes d'armées à l'équipe adverse avant
  l'appariement — décision de confidentialité, à arbitrer d'abord.
- **Améliorations notées** : sauvegarde locale des scores en cours de saisie
  (coupure réseau), export CSV des inscrits, formulaire de création de tournoi
  dans le back office, partage du code d'invitation par lien profond.
- **Ménage repéré** : les fonctions de trigger `queue_*` et
  `guard_registration_faction` sont exécutables par `anon` et
  `authenticated` (avertissement des advisors Supabase). Sans danger — une
  fonction de trigger ne s'appelle pas directement — mais à révoquer en une
  migration groupée.

**Limite connue à ne pas redécouvrir** : un bannissement bloque la connexion et
le renouvellement de session, mais un jeton d'accès déjà émis reste valide
jusqu'à son expiration (une heure). Comportement standard de Supabase.

## 11. Documents de référence dans le dépôt

| Fichier | Contenu |
|---|---|
| `CLAUDE.md` | Instructions permanentes (conventions, commandes, architecture) |
| `BACKLOG.md` | Tous les EPICs et User Stories, avec notes de livraison |
| `CAHIER_DES_CHARGES.md` | Périmètre et phasage d'origine |
| `RESUME_PROJET.md` | Ce document |
| `ETUDE_LISTES.md` | Faisabilité de la vérification des listes (EPIC-10) — **décision en attente** |
| `backoffice/README.md` | Spécificités du back office |
