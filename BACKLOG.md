# BACKLOG PRODUIT — EGIDE

> Rédigé par le Product Owner (agent) le 2026-07-23, à partir de CAHIER_DES_CHARGES.md
> et de l'état livré (auth + profil joueur). À tenir à jour au fil des itérations.

## Vision produit

EGIDE est l'application de référence de la scène compétitive francophone Warhammer Age of Sigmar : un organisateur y crée son tournoi et gère ses rondes suisses automatiquement, un joueur y découvre les événements près de chez lui et s'inscrit en un clic, et les équipes y vivent comme de vraies entités communautaires.

---

## EPICs par ordre de priorité

| EPIC | Titre | Phase CDC | Priorité |
|---|---|---|---|
| EPIC-1 | Création et gestion de tournoi (organisateur) | 1 — MVP | P0 |
| EPIC-2 | Annuaire d'événements et inscriptions joueur | 1 — MVP | P0 |
| EPIC-3 | Jour J : check-in, rondes suisses, scores, classement | 1 — MVP | P0 |
| EPIC-4 | Équipes comme entités sociales | 1 — MVP | P1 |
| EPIC-5 | Soumission simple des listes d'armées | 1 — MVP | P1 |
| EPIC-6 | Notifications push essentielles | 1 — MVP | P2 |
| EPIC-7 | Tournois par équipes et appariements capitaines | 2 | P3 |
| EPIC-8 | Chat (équipe + fil de tournoi) | 2 | P3 |
| EPIC-9 | Profil enrichi et historique de résultats | 2 | P3 |
| EPIC-10 | Vérification poussée des listes d'armées | 2 | P3 |
| EPIC-11 | ELO, carte interactive, stats méta, publication stores | 3 | P4 |
| EPIC-12 | Administration de la plateforme | 2 | P3 — **en tête de phase 2** |

---

## EPIC-1 — Création et gestion de tournoi (organisateur)

**Objectif :** permettre à n'importe quel utilisateur connecté de créer et administrer un tournoi individuel.
**Valeur utilisateur :** l'organisateur remplace ses tableurs et feuilles papier par un outil dédié ; c'est la brique sur laquelle tout le reste (inscriptions, rondes) repose.

### US-1.1 — Table `tournaments` en base — ✅ Livrée (2026-07-23)
**En tant qu'** organisateur, **je veux** que les tournois soient stockés de façon sécurisée **afin de** pouvoir les créer et les retrouver depuis mon téléphone.
- Critères d'acceptation :
  1. Une migration SQL crée la table `tournaments` : nom, lieu (ville + région), date, format (points de liste, nombre de rondes), capacité, type (individuel/équipe), statut (brouillon, inscriptions ouvertes, en cours, terminé, annulé), référence à l'organisateur.
  2. RLS activée : lecture publique des tournois non-brouillon, écriture réservée à l'organisateur.
  3. La migration est versionnée dans `supabase/migrations/` (comme `0001_profiles.sql`).
  4. Un insert de test via le dashboard Supabase apparaît bien avec les bonnes contraintes (capacité > 0, rondes ≥ 1).
- **Taille : S** — **Dépendances :** aucune.

### US-1.2 — Formulaire de création de tournoi — ✅ Livrée (2026-07-23)
**En tant qu'** organisateur, **je veux** créer un tournoi depuis l'onglet Tournois **afin de** publier mon événement en quelques minutes.
- Critères :
  1. Un bouton « Créer un tournoi » ouvre un formulaire : nom, lieu, région, date, points (défaut 2000), nombre de rondes (défaut 5), capacité, type.
  2. Validation des champs obligatoires avec messages d'erreur en français.
  3. À la soumission, le tournoi est créé en statut « inscriptions ouvertes » et visible en base.
  4. Un utilisateur non connecté ne peut pas accéder au formulaire.
- **Taille : M** — **Dépendances :** US-1.1.

### US-1.3 — « Mes tournois » dans l'onglet Tournois — ✅ Livrée (2026-07-23)
**En tant qu'** organisateur, **je veux** voir la liste des tournois que j'ai créés **afin de** les retrouver et les administrer.
- Critères :
  1. L'onglet Tournois liste mes tournois (nom, date, statut, nombre d'inscrits une fois US-2.3 livrée).
  2. Tri par date croissante ; état vide avec message d'invitation à créer.
  3. Un tap ouvre la fiche de gestion (US-1.4).
  4. Après création (US-1.2), le nouveau tournoi apparaît sans redémarrer l'app.
- **Taille : S** — **Dépendances :** US-1.2.

### US-1.4 — Fiche de gestion : modifier / annuler — ✅ Livrée (2026-07-25)
> **Livrée dans le BACK OFFICE WEB** (`backoffice/`), pas dans l'app mobile : décision produit du 2026-07-25 — toute la gestion organisateur se fait désormais dans une application web dédiée (Vite + React), l'app mobile gardant le parcours joueur.
> Reste à faire en v1.1 : formulaire de création de tournoi dans le back office (aujourd'hui un renvoi vers l'app mobile).
**En tant qu'** organisateur, **je veux** modifier ou annuler mon tournoi **afin de** corriger une erreur ou gérer un imprévu.
- Critères :
  1. La fiche de gestion affiche toutes les infos et permet la modification tant que le tournoi n'est pas « en cours ».
  2. L'annulation demande une confirmation et passe le statut à « annulé » (pas de suppression physique).
  3. Un tournoi annulé reste visible avec un bandeau « Annulé » dans l'annuaire.
  4. Un utilisateur qui n'est pas l'organisateur ne voit pas les boutons d'édition (et la RLS bloque toute tentative directe).
- **Taille : M** — **Dépendances :** US-1.3.

---

## EPIC-2 — Annuaire d'événements et inscriptions joueur

**Objectif :** pilier 2 du cahier des charges — découvrir les tournois à venir et s'inscrire en un clic.
**Valeur utilisateur :** le joueur trouve où jouer ; l'organisateur remplit ses tables sans gérer de messages privés.

### US-2.1 — Liste publique des événements à venir — ✅ Livrée (2026-07-23)
> Note : « places restantes » affiche pour l'instant la capacité totale ; le décompte réel arrivera avec la table `registrations` (US-2.3).
**En tant que** joueur, **je veux** voir tous les tournois à venir dans l'onglet Événements **afin de** planifier mes week-ends.
- Critères :
  1. L'onglet Événements liste les tournois « inscriptions ouvertes » ou « en cours », triés par date.
  2. Chaque carte affiche : nom, date, ville/région, format (points, rondes), places restantes, badge individuel/équipe.
  3. Les tournois passés ou annulés n'apparaissent pas par défaut.
  4. État vide clair (« Aucun événement à venir »).
- **Taille : S** — **Dépendances :** US-1.2 (il faut des tournois à afficher).

### US-2.2 — Fiche événement détaillée — ✅ Livrée (2026-07-23)
**En tant que** joueur, **je veux** ouvrir la fiche complète d'un événement **afin de** décider si je m'inscris.
- Critères :
  1. Depuis la liste, un tap ouvre la fiche : toutes les infos + pseudo de l'organisateur.
  2. La fiche affiche le nombre d'inscrits / capacité.
  3. Accessible même sans être inscrit au tournoi.
- **Taille : S** — **Dépendances :** US-2.1.

### US-2.3 — Inscription / désinscription en un clic — ✅ Livrée (2026-07-23)
> Note : tournoi complet = bouton désactivé « Complet » (la liste d'attente arrive en US-2.4). La capacité n'est pas encore verrouillée côté serveur (course à la dernière place possible) — à traiter avec la liste d'attente en US-2.4.
**En tant que** joueur, **je veux** m'inscrire à un tournoi depuis sa fiche **afin de** réserver ma place immédiatement.
- Critères :
  1. Migration : table `registrations` (tournoi, joueur, statut : inscrit / liste d'attente / désinscrit / checked-in) avec RLS (le joueur gère sa propre inscription, l'organisateur voit tout).
  2. Bouton « S'inscrire » sur la fiche ; après inscription, le bouton devient « Se désinscrire ».
  3. Impossible de s'inscrire deux fois au même tournoi (contrainte d'unicité en base).
  4. Le compteur d'inscrits de la fiche se met à jour.
  5. Un profil complet (pseudo) est requis pour s'inscrire.
- **Taille : M** — **Dépendances :** US-2.2.

### US-2.4 — Liste des inscrits et liste d'attente — ✅ Livrée (2026-07-25)
> L'inscription passe désormais par les fonctions SQL `register_for_tournament` / `withdraw_from_tournament`, qui verrouillent le tournoi le temps de compter les places : la course à la dernière place signalée en US-2.3 est corrigée.
> Confidentialité : un visiteur non connecté voit le nombre d'inscrits mais pas les pseudos (garanti par les règles RLS, pas seulement par l'interface).
> Ajouté hors périmètre initial : bandeau « une place s'est libérée » à l'ouverture de la fiche (colonne `promoted_at`), en attendant les notifications push (US-6.3).
**En tant que** joueur, **je veux** voir qui est inscrit et être placé en liste d'attente si c'est complet **afin de** ne pas perdre ma place potentielle.
- Critères :
  1. La fiche événement affiche la liste des inscrits (pseudo, faction favorite).
  2. Au-delà de la capacité, l'inscription passe automatiquement en « liste d'attente » avec position affichée.
  3. Quand un inscrit se désinscrit, le premier de la liste d'attente est promu automatiquement.
  4. Cas testable : capacité 2, trois inscriptions, le 3e est en attente ; désinscription du 1er → le 3e devient inscrit.
- **Taille : M** — **Dépendances :** US-2.3.

### US-2.5 — Filtres de l'annuaire — ✅ Livrée (2026-07-26)
> Barre « Filtrer » (44 px) + modale plein écran + chips des filtres actifs, filtrage entièrement côté client.
> Les régions et les formats étant du texte libre, les options sont construites à partir des tournois réellement présents, avec regroupement des graphies (accents, casse, tirets) et compteurs recalculés en continu ; une option sans résultat reste visible mais désactivée.
> Régions, formats et type sont conservés d'une visite à l'autre ; la période repart toujours de « À venir » (une période enregistrée devient fausse avec le temps).
**En tant que** joueur, **je veux** filtrer les événements par date, région, format et type **afin de** trouver vite ce qui me concerne.
- Critères :
  1. Filtres : région (mêmes valeurs que le profil), période (à venir / ce mois / date précise), type individuel/équipe, format en points.
  2. Les filtres se combinent et un bouton « Réinitialiser » les efface.
  3. Le nombre de résultats est visible ; état vide filtré distinct de l'état vide global.
- **Taille : M** — **Dépendances :** US-2.1.

### US-2.6 — Gestion des inscrits par l'organisateur — ✅ Livrée (2026-07-25)
> Livrée dans le **back office**, section « Inscrits » d'un tournoi : résumé chiffré, tableau des inscrits, liste d'attente ordonnée, désistements dans une section repliée.
> Le retrait passe par la fonction SQL `remove_registration`, qui vérifie que l'appelant est l'organisateur puis promeut le premier de la file dans la même transaction.
> Retrait possible uniquement tant que le tournoi n'est pas lancé ; ensuite la page est en lecture seule (les retraits du jour relèveront du check-in, US-3.1).
> Reste à faire plus tard : export CSV de la liste (emplacement réservé dans l'en-tête).
**En tant qu'** organisateur, **je veux** consulter et retirer des inscrits **afin de** gérer les désistements signalés hors app.
- Critères :
  1. Depuis la fiche de gestion (US-1.4), onglet/section « Inscrits » : inscrits, liste d'attente.
  2. L'organisateur peut retirer un inscrit (confirmation demandée) ; la promotion de la liste d'attente s'applique.
  3. Un non-organisateur n'a pas accès à ces actions.
- **Taille : S** — **Dépendances :** US-2.4, US-1.4.

---

## EPIC-3 — Jour J : check-in, rondes suisses, scores, classement

**Objectif :** le cœur différenciant du MVP — dérouler un tournoi complet, des appariements automatiques au classement final.
**Valeur utilisateur :** l'organisateur gagne un temps énorme entre les rondes ; les joueurs voient leur table et le classement en direct sur leur téléphone.

### US-3.1 — Check-in le jour J — ✅ Livrée (2026-07-26)
> Livrée dans le **back office**, section « Check-in ». Page mono-tâche pensée pour un usage debout : toute la ligne du joueur est la cible (64 px), recherche toujours visible avec validation au clavier, et pointage appliqué immédiatement à l'écran sans attendre le réseau.
> Chaque pointage est annulable depuis le message de confirmation ; en cas d'échec réseau la ligne revient à son état précédent avec un signal rouge, jamais d'échec silencieux.
> Actions groupées (« tout marquer présent », « réinitialiser ») reléguées dans une section repliée, loin de la zone de pointage rapide.
> La base refuse tout pointage si l'appelant n'est pas l'organisateur, si le tournoi n'est plus ouvert, ou si le joueur est en liste d'attente.
> Emplacement du bouton « Lancer le tournoi » réservé pour US-3.2, avec le rappel explicite que les joueurs non pointés seront écartés.
**En tant qu'** organisateur, **je veux** pointer les présents le matin du tournoi **afin de** n'apparier que les joueurs réellement là.
- Critères :
  1. Sur la fiche de gestion, un mode « Check-in » liste les inscrits avec une case présent/absent.
  2. Le statut de l'inscription passe à « checked-in ».
  3. Le compteur « X présents / Y inscrits » est visible.
  4. Un absent au check-in ne sera pas apparié en ronde 1.
- **Taille : S** — **Dépendances :** US-2.6.

### US-3.2 — Lancement du tournoi et génération de la ronde 1 — ✅ Livrée (2026-07-26)
> Livrée dans le **back office**. Lancement depuis l'encart en bas de Check-in (voie principale) ou depuis la page Rondes ; modale partagée qui **nomme les joueurs non pointés** qui vont être écartés et exige une case à cocher dans ce cas.
> Tables `rounds` et `pairings`, fonction `start_tournament` : tirage au sort des présents, attribution des tables, et bye à **15 – 5** conformément à la règle validée. Refus si moins de 2 présents, si l'appelant n'est pas l'organisateur, ou si le tournoi est déjà lancé.
> Page Rondes : sélecteur des rondes (celles à venir désactivées), synthèse (tables, joueurs appariés, scores saisis), recherche qui répond « X joue à la table N, contre Y », tableau des appariements, ligne du bye triplement signalée, section des joueurs écartés, et affichage projection plein écran + impression.
> Emplacements réservés pour US-3.4 (saisie des scores) et US-3.6 (ronde suivante).
**En tant qu'** organisateur, **je veux** lancer le tournoi et générer automatiquement les appariements de la ronde 1 **afin de** démarrer sans tirage manuel.
- Critères :
  1. Migration : tables `rounds` et `pairings` (ronde, table, joueur A, joueur B, scores, statut) avec RLS.
  2. Bouton « Lancer le tournoi » : statut → « en cours », ronde 1 créée avec appariements aléatoires des joueurs checked-in, numéros de table attribués.
  3. En nombre impair, un joueur reçoit un « bye » (victoire automatique — barème exact à confirmer avec le porteur du projet).
  4. Impossible de lancer avec moins de 2 joueurs checked-in.
- **Taille : L** — **Dépendances :** US-3.1.

### US-3.3 — Mon match de la ronde en cours (app mobile) — ✅ Livrée (2026-07-30)
> Bloc `jour-j-card.tsx` + hook `use-my-pairing.ts`. Le numéro de table est en 64 px noir/blanc sur cadre doré — le doré fait le cadre, le chiffre fait le contraste. Un seul bloc doré par écran : dès que le score est saisi (ou bye, abandon, spectateur), le fond redevient neutre.
> Correction du statut `dropped` faite : un joueur qui abandonne reste dans la liste des inscrits avec une puce neutre « Abandon · RN » et ne décrémente plus le compteur.
> « Tirer pour rafraîchir » ajouté à la fiche, avec indicateur « Actualisé il y a X min ».
> Contraste corrigé au passage : tout texte sur fond doré passe par `OnTint` (blanc en clair, noir en sombre) — l'ancien blanc fixe tombait à ~1,9:1 en mode sombre.
> Testé navigateur : apparié, score saisi, abandon, terminé (1er et abandonné), spectateur déconnecté. L'état bye est couvert par le même code que l'appariement (revue seule : il faudrait un effectif impair).
**En tant que** joueur inscrit, **je veux** voir sur la fiche du tournoi à quelle table je joue et contre qui **afin de** m'installer sans attendre l'annonce micro ni faire la queue devant l'écran de projection.
- Critères :
  1. Un bloc « Le jour J » apparaît sur la fiche événement (`src/app/evenements/[id].tsx`), **au-dessus** des cartes Format et Participants, dès que le tournoi n'est plus en statut « inscriptions ouvertes ». Lecture seule : aucune écriture en base depuis l'app mobile.
  2. **Tournoi pas encore lancé** : le bloc n'apparaît pas ; la fiche reste telle qu'aujourd'hui.
  3. **Ronde en cours, je suis apparié** : « Ronde X sur Y », le **numéro de table**, le **pseudo de l'adversaire** et sa faction favorite. Le numéro de table est l'élément le plus lisible de l'écran — c'est ce qu'on cherche en marchant.
  4. **J'ai le bye** : « Tu as le bye à la ronde X », avec « Pas d'adversaire ce tour-ci : tu remportes la ronde 15 – 5 ». Aucun numéro de table, aucun nom d'adversaire (`player_b_id` vaut `null`).
  5. **Score de ma table déjà saisi** : mon résultat (« Victoire 18 – 12 » / « Défaite » / « Égalité ») et « En attente de la ronde suivante ».
  6. **J'ai abandonné** (`registrations.status = 'dropped'`) : bandeau neutre « Tu as abandonné à la ronde N » (colonne `dropped_round`) et « Tes résultats des rondes 1 à N-1 restent acquis au classement ». Aucun appariement.
  7. **Tournoi terminé** : « Tournoi terminé » et renvoi vers le classement final (US-3.13).
  8. **Pas inscrit, pas connecté, ou en liste d'attente** : seulement « Tournoi en cours — ronde X sur Y » et un renvoi vers les tables (US-3.10), sans bloc personnel.
  9. **Correction obligatoire :** ajouter `'dropped'` au type `RegistrationStatus` de `src/lib/tournaments.ts`. Aujourd'hui un joueur qui abandonne disparaît de la liste des inscrits sur mobile et fait baisser le compteur d'inscrits en plein tournoi.
  10. « Tirer pour rafraîchir » recharge le bloc. Pas de temps réel en v1 : le joueur regarde son téléphone au moment où l'organisateur annonce la ronde.
- **Taille : M** — **Dépendances :** US-3.2 (lecture publique de `pairings` déjà autorisée par la RLS de la migration 0008), US-2.3.

### US-3.4 — Saisie des scores par l'organisateur — ✅ Livrée (2026-07-26)
> Saisie directement dans le tableau de la page Rondes, pensée pour le clavier : deux champs par table, `Entrée` passe au champ suivant puis à la table suivante encore à saisir, `Échap` annule la ligne, flèches haut/bas pour changer de ligne.
> Le vainqueur est déduit en direct (« Victoire X » / « Égalité ») dès que les deux champs sont remplis, avant enregistrement — c'est là que la faute de frappe se voit.
> Enregistrement quand la ligne complète perd le focus, sans recharger le tableau (sinon il clignote et le focus saute). Filtre « À saisir / Saisies » avec maintien de la ligne qu'on vient de saisir.
> Validation : lettres ignorées, au-delà de 100 refusé, au-delà de 20 accepté mais signalé (certains formats montent plus haut), saisie d'un seul côté non enregistrée.
> La fonction SQL refuse la saisie hors organisateur, sur le bye, hors tournoi en cours, et **fige une ronde dès que la suivante est générée**.
> Reste à faire : sauvegarde locale des brouillons non confirmés (filet en cas de coupure réseau en pleine saisie).
**En tant qu'** organisateur, **je veux** saisir le résultat de chaque table **afin de** préparer la ronde suivante.
- Critères :
  1. Pour chaque appariement : saisie des points de partie de chaque joueur ; le vainqueur (ou l'égalité) est déduit automatiquement.
  2. Un score saisi est modifiable tant que la ronde suivante n'est pas générée.
  3. Indicateur de progression « X tables sur Y saisies ».
  4. Seul l'organisateur peut saisir (RLS vérifiée).
- **Taille : M** — **Dépendances :** US-3.3.

### US-3.5 — Classement en temps réel — ✅ Livrée (2026-07-26)
> **Règles métier validées par le porteur du projet** : une partie vaut 80 points (50 de primaire + 30 de tactiques) ; 6 tactiques marquables au maximum ; le bye vaut 15-5 avec 3 tactiques ; un nul compte pour une demi-victoire ; la force des adversaires est la somme de leurs victoires.
> Départages, dans l'ordre : victoires → points marqués → tactiques → différentiel → force des adversaires → tirage au sort **stable** (sinon le classement changerait à chaque affichage).
> Saisie des tactiques ajoutée à la page Rondes, derrière un interrupteur « Saisir les tactiques » : facultative, elle ne ralentit pas les organisateurs qui n'en ont pas besoin. Champs volontairement plus petits et pointillés pour ne pas être confondus avec les points.
> Page Classement avec, comme pièce maîtresse, un dépliant « **pourquoi suis-je Nᵉ ?** » qui déroule les six critères, montre lequel a tranché et de combien, et permet de se comparer au joueur du dessus comme à celui du dessous.
> Podium affiché uniquement une fois le tournoi terminé ; affichage projection et impression disponibles.
**En tant que** joueur, **je veux** consulter le classement mis à jour après chaque saisie **afin de** suivre ma progression.
- Critères :
  1. Onglet « Classement » sur la fiche tournoi : rang, pseudo, victoires/nuls/défaites, points de tournoi, points de partie cumulés.
  2. Le classement se met à jour après chaque score saisi.
  3. Départage provisoire par points de partie cumulés (tie-breakers complets en US-3.7).
  4. Visible par tous, y compris les non-inscrits.
- **Taille : M** — **Dépendances :** US-3.4.

### US-3.6 — Génération automatique des rondes suivantes (suisse) — ✅ Livrée (2026-07-26)
> Appariement par groupes de score (classement complet, donc victoires puis points puis tactiques…), **jamais deux fois le même adversaire**, et le bye ne retombe jamais sur un joueur qui l'a déjà eu.
> L'algorithme apparie le voisin de classement immédiat et revient en arrière si la suite s'avère impossible : il trouve donc un appariement valide dès qu'il en existe un.
> Clôture bloquée tant qu'une table n'a pas de score, refusée à qui n'est pas l'organisateur, et refusée au-delà du nombre de rondes prévu. Si la génération échoue, la clôture est annulée : la ronde n'est jamais laissée figée par erreur.
> **Issue de secours** : quand aucun appariement n'est possible sans revanche (fin de tournoi, petit effectif), l'organisateur peut l'autoriser explicitement ; les tables concernées portent alors un badge « Match retour ».
> Après génération, l'app bascule sur la nouvelle ronde et propose de l'afficher pour projection.
**En tant qu'** organisateur, **je veux** générer la ronde suivante en appariement suisse **afin d'** opposer les joueurs de score proche sans rematch.
- Critères :
  1. Bouton « Générer la ronde suivante » actif uniquement quand tous les scores de la ronde en cours sont saisis.
  2. Appariements par groupes de score (victoires, puis points de partie), sans jamais rejouer un adversaire déjà affronté.
  3. Le bye ne retombe pas deux fois sur le même joueur.
  4. Cas testable : 4 joueurs, 2 rondes — en ronde 2, les deux vainqueurs de ronde 1 s'affrontent.
  5. Blocage propre si le nombre de rondes configuré est atteint.
- **Taille : L** — **Dépendances :** US-3.4.

### US-3.7 — Tie-breakers standards — ✅ Livrée pour l'essentiel (2026-07-26)
> Les six départages sont implémentés (migrations 0010 et 0013) et expliqués dans le back office par le dépliant « pourquoi suis-je Nᵉ ? ». **Reste le critère 3 côté joueur** : la règle n'est visible nulle part dans l'app mobile — traité par US-3.12.

**En tant qu'** organisateur, **je veux** un départage conforme aux standards AOS **afin que** le classement final soit incontestable.
- Critères :
  1. Ordre de départage implémenté et affiché dans l'app (ex. : points de tournoi → SoS → points de partie).
  2. Le SoS (Strength of Schedule) est calculé sur les adversaires rencontrés.
  3. La règle exacte est visible sur l'écran de classement (transparence pour les joueurs).
- **Point métier :** le cahier des charges dit « à préciser en phase de conception ». **Question à poser au porteur du projet (expert AOS)** — ordre exact des tie-breakers et barème du bye — avant de développer cette US.
- **Taille : M** — **Dépendances :** US-3.5, US-3.6.

### US-3.8 — Abandon en cours de tournoi (drop) — ✅ Livrée (2026-07-26)
> Se déclenche depuis la page Rondes & scores, là où l'organisateur travaille le jour J (le check-in y renvoyait déjà).
> Le joueur **conserve ses résultats acquis** — ses adversaires les ont mérités — et n'est plus apparié aux rondes suivantes. Le classement le signale par un badge neutre « Abandon · R2 », **sans le déclasser**.
> Point délicat traité : si sa table de la ronde en cours n'a pas de score, la modale demande ce qui a été joué et propose d'enregistrer un forfait 15-5 pour l'adversaire — sans quoi la ronde ne pourrait jamais être clôturée.
> L'abandon est réversible tant que le tournoi n'est pas terminé, mais les rondes déjà générées ne sont pas refaites.

### US-3.8 (critères d'origine) — Abandon en cours de tournoi
**En tant qu'** organisateur, **je veux** retirer un joueur qui abandonne **afin que** les rondes suivantes restent cohérentes.
- Critères :
  1. Action « Drop » sur un joueur depuis la gestion du tournoi, avec confirmation.
  2. Le joueur droppé conserve ses résultats mais n'est plus apparié.
  3. Le classement le signale (mention « abandon »).
- **Taille : S** — **Dépendances :** US-3.6.

### US-3.9 — Clôture du tournoi et podium — ✅ Livrée (2026-07-26)
> Le bouton n'apparaît qu'une fois toutes les rondes clôturées. La modale fait **relire le podium** avant de valider et exige une case à cocher : c'est le geste le plus définitif du produit.
> Après clôture : statut « terminé », scores définitivement figés (vérifié en base), aucun abandon ni réintégration possible, et redirection vers le classement final avec son podium.
> Le tournoi reste entièrement consultable : toutes les sections restent accessibles en lecture seule.

### US-3.9 (critères d'origine) — Clôture du tournoi et podium
**En tant qu'** organisateur, **je veux** clôturer le tournoi après la dernière ronde **afin de** figer le classement final.
- Critères :
  1. Bouton « Clôturer » disponible quand la dernière ronde est complètement saisie ; statut → « terminé ».
  2. Le classement final est figé, avec mise en avant du podium (top 3).
  3. Plus aucune modification de score possible après clôture.
  4. Le tournoi terminé reste consultable (résultats publics).
- **Taille : S** — **Dépendances :** US-3.7.

### US-3.14 — Scénario de la ronde — ✅ Livrée (2026-07-30)
> Migration 0017 : colonne `scenario` sur `rounds` et fonction `set_round_scenario`.
> Le scénario n'est **pas** un paramètre de `start_tournament` ni de `generate_next_round` : ces deux fonctions sont le chemin critique du jour J, et une saisie facultative ne doit jamais pouvoir faire échouer la création d'une ronde. Les modales le collectent, la page l'écrit une fois la ronde créée ; si cette écriture échoue, la ronde existe quand même et un message renvoie vers le champ de la page.
> Corrigeable sur n'importe quelle ronde, close ou non, tant que le tournoi n'est pas terminé — le scénario est souvent annoncé après la génération.

**En tant qu'** organisateur, **je veux** indiquer le scénario joué à chaque ronde **afin que** les joueurs sachent quelle mission préparer sans dépendre de l'annonce au micro.
- Critères :
  1. Migration : colonne `scenario` (texte, nullable) sur la table `rounds`. Nullable car les rondes déjà jouées n'en ont pas, et un organisateur peut ne pas vouloir le renseigner.
  2. La modale de lancement (US-3.2) et celle de clôture (US-3.6) proposent un champ « Scénario » facultatif pour la ronde créée. Générer la ronde sans scénario reste possible : ce champ ne doit jamais bloquer le jour J.
  3. Le scénario est modifiable après coup depuis la page Rondes du back office, tant que le tournoi n'est pas terminé (l'organisateur peut avoir généré la ronde avant de l'avoir décidé).
  4. Saisie en **texte libre** : la liste officielle change à chaque GHB, une liste figée dans le code vieillirait mal.
  5. Le scénario s'affiche à côté du numéro de ronde partout où celui-ci apparaît : page Rondes et affichage projection du back office, bloc « Le jour J » et écran des tables côté joueur (US-3.3, US-3.10).
  6. Une ronde sans scénario n'affiche rien du tout — pas de « Scénario : non renseigné ».
- **Décision de l'expert AOS (2026-07-30)** : le scénario doit figurer dans l'app, saisi par l'organisateur.
- **Taille : S** — **Dépendances :** US-3.2 (livrée). À livrer avant US-3.3 pour éviter de repasser sur les écrans joueur.

### Le tournoi vécu côté joueur (app mobile)

Les US ci-dessous complètent l'EPIC-3 : le déroulé existe côté organisateur (back office), il reste à l'exposer **en lecture seule** aux joueurs. Aucune écriture, aucune nouvelle migration — `rounds`, `pairings` et `tournament_standings()` sont déjà lisibles publiquement.

L'objectif de l'EPIC-3 le prévoyait dès le départ : « les joueurs voient leur table et le classement en direct sur leur téléphone ». Tant que ce lot n'est pas livré, le pilier 1 du cahier des charges (classement en temps réel *dans l'app*) ne l'est pas non plus.

### US-3.10 — Toutes les tables de la ronde — ✅ Livrée (2026-07-30)
> Écran `src/app/evenements/[id]/tables.tsx`, accessible sans connexion. Sélecteur de rondes générées, scénario affiché, ma ligne dorée avec puce « toi », bye en fin de liste, recherche dès 8 tables avec encart-réponse (« X joue à la table N, contre Y »), ouverture positionnée sur ma table.
**En tant que** joueur, **je veux** consulter l'ensemble des appariements de la ronde **afin de** savoir où jouent mes amis et suivre les tables du haut de tableau.
- Critères :
  1. Depuis le bloc « Le jour J », un lien « Voir les N tables » ouvre un écran dédié, accessible **sans être inscrit et sans être connecté** (la RLS de `pairings` autorise déjà la lecture publique).
  2. Liste triée par numéro de table : table N, joueur A vs joueur B, et le score quand il est saisi.
  3. **Ma ligne est mise en évidence** et l'écran s'ouvre positionné dessus si je suis apparié.
  4. La ligne du bye est distincte : « Table N — Pseudo — bye (15 – 5) », sans faux adversaire.
  5. Un sélecteur permet de revenir aux rondes précédentes ; les rondes non générées ne sont pas proposées.
  6. **Tournoi pas lancé** : écran non atteignable. **Tournoi terminé** : toutes les rondes restent consultables.
  7. Recherche par pseudo qui répond « Julien joue à la table 7, contre Sarah » — même comportement que la page Rondes du back office.
- **Taille : S** — **Dépendances :** US-3.3.

### US-3.11 — Mon parcours dans le tournoi — ✅ Livrée (2026-07-30)
> `mon-parcours.tsx`, alimenté par la vue `player_results`. Replié par défaut le jour J (l'en-tête porte le bilan « 2 V · 1 N · 2 D »), déplié d'office quand le tournoi est terminé ou que le joueur a abandonné. Barre d'issue verte/grise/rouge par ligne, bye en italique, total en pied.
**En tant que** joueur, **je veux** revoir mes rondes précédentes avec mes adversaires et mes scores **afin de** vérifier ma journée sans reprendre l'écran de projection.
- Critères :
  1. Dans le bloc « Le jour J », une section « Mon parcours » : une ligne par ronde jouée — numéro, adversaire, mon score – son score, issue (Victoire / Défaite / Égalité).
  2. Les données viennent de la vue `player_results` (migration 0010) filtrée sur mon `player_id` : aucune logique « joueur A / joueur B » à réécrire côté app.
  3. Le bye apparaît comme « Ronde X — Bye — 15 – 5 ».
  4. Pied de section : victoires / nuls / défaites et points marqués cumulés.
  5. **Aucune ronde jouée** : la section n'apparaît pas.
  6. **J'ai abandonné** : la section reste affichée avec mes résultats acquis, suivie de la mention d'abandon.
- **Taille : S** — **Dépendances :** US-3.3.

### US-3.12 — Classement du tournoi sur mobile — ✅ Livrée (2026-07-30)
> Écran `src/app/evenements/[id]/classement.tsx` alimenté par `tournament_standings` (aucun recalcul de rang côté app), accessible sans connexion. Quatre zones par ligne (rang, joueur, bilan V–N–D, points) — différentiel et tactiques renvoyés à la modale des départages, illisibles sur 375 px. Ma ligne dorée, et épinglée en bas quand elle sort de l'écran (tap = y défiler). Les six départages dans une modale, texte repris du back office mot pour mot. Boutons « Classement » rebranchés dans le bloc « Le jour J ».
> Badge abandon en v1 : « Abandon » sans numéro de ronde — `tournament_standings` ne renvoie que le booléen. Amélioration notée : exposer `dropped_round` dans la fonction pour afficher « Abandon · R2 ».
**En tant que** joueur, **je veux** consulter le classement mis à jour après chaque ronde **afin de** savoir où j'en suis et contre qui je risque de tomber.
- Critères :
  1. Écran « Classement » accessible depuis la fiche événement dès qu'un score est saisi, alimenté par `tournament_standings(tournament_id)` (migration 0010) — aucun calcul refait côté app.
  2. Chaque ligne : rang, pseudo, victoires/nuls/défaites, points marqués. **Ma ligne est mise en évidence** et reste visible même hors de la zone affichée (ligne épinglée en bas).
  3. Les joueurs ayant abandonné portent un badge neutre « Abandon · RN » et **ne sont pas déclassés**.
  4. Les six départages sont consultables (« Comment est calculé ce classement ? ») : victoires → points marqués → tactiques → différentiel → force des adversaires → tirage au sort stable. Reprendre le texte du back office, ne pas réinventer la règle.
  5. **Aucun score saisi** : « Le classement apparaîtra après les premiers résultats », pas de tableau vide.
  6. Visible par tous, y compris les visiteurs non connectés.
  7. « Tirer pour rafraîchir » recharge le classement.
- **Note :** cette US clôt le critère 3 de US-3.7, jusqu'ici couvert seulement par le back office.
- **Taille : M** — **Dépendances :** US-3.5 (livrée), US-3.3.

### US-3.13 — Classement final et podium après clôture — ✅ Livrée (2026-07-30) sauf critère 5
> Podium à trois cartes en tête du classement final (ordre de lecture 1-2-3, pas de « marches » fragiles sur 375 px), 1ᵉʳ sur fond doré avec trophée, les trois premiers restent aussi dans la liste — une seule source de vérité. La synthèse « Tu termines Nᵉ » vit dans le bloc « Le jour J », pas ici (doublon).
> ~~Critère 5 non couvert~~ **Couvert le 2026-07-30** : période « Passés » dans les filtres de l'annuaire — la requête bascule sur les tournois terminés, du plus récent au plus ancien, et les cartes affichent « Terminé » à la place des places restantes. L'US-3.13 est entièrement livrée.
**En tant que** joueur, **je veux** voir le résultat définitif du tournoi et le podium **afin de** conserver et partager ma performance.
- Critères :
  1. Dès que le tournoi passe en « terminé » (`close_tournament`, migration 0013), l'écran de classement affiche en tête le **podium (top 3)** et le titre « Classement final ».
  2. La fiche événement affiche « Terminé — vainqueur : Pseudo » et un accès direct au classement final ; le bloc « Le jour J » n'affiche plus d'appariement.
  3. Si j'ai joué, une ligne de synthèse : « Tu termines Nᵉ sur M, avec X victoires ».
  4. Rondes et scores restent consultables (US-3.10, US-3.11) en lecture seule.
  5. Un tournoi terminé doit rester atteignable : l'annuaire masque aujourd'hui les tournois passés. Prévoir au minimum un accès depuis « mes inscriptions » ou un filtre « Passés » — sans transformer cela en refonte de l'annuaire.
- **Taille : S** — **Dépendances :** US-3.12, US-3.9 (livrée).

---

## EPIC-4 — Équipes comme entités sociales

**Objectif :** créer/rejoindre une équipe, roster, capitaine — sans tournois par équipes (phase 2).
**Valeur utilisateur :** les équipes existent, se structurent et fidélisent leurs membres dès le MVP.

### US-4.1 — Tables `teams` et `team_members` — ✅ Livrée (2026-07-30)
**En tant que** joueur, **je veux** que les équipes soient stockées en base **afin de** construire les écrans dessus.
- Critères :
  1. Migration : `teams` (nom, description, capitaine, région) et `team_members` (équipe, joueur, rôle capitaine/membre) avec RLS.
  2. Un joueur ne peut être qu'une fois membre d'une même équipe (contrainte d'unicité).
  3. Lecture publique des équipes ; écriture selon le rôle.
- **Taille : S** — **Dépendances :** aucune (parallélisable avec EPIC-1 à 3).
- Notes de livraison : migrations `0015_teams.sql` et `0016_protect_invite_code.sql`. Aucune écriture directe n'est autorisée : tout passe par des fonctions `security definer` (`create_team`, `join_team`, `leave_team`, `transfer_captaincy`, `disband_team`, `regenerate_invite_code`). RLS seule ne suffisait pas pour le code d'invitation — elle filtre les lignes, pas les colonnes — d'où des GRANT par colonne sur `teams` et une fonction `get_invite_code()` réservée au capitaine. 13 assertions SQL passées.

### US-4.2 — Créer une équipe — ✅ Livrée (2026-07-30)
**En tant que** joueur, **je veux** créer mon équipe depuis l'onglet Équipes **afin d'** en devenir le capitaine.
- Critères :
  1. Formulaire : nom (unique), description, région.
  2. Le créateur devient automatiquement capitaine et membre.
  3. L'équipe apparaît dans l'onglet Équipes (« Mon équipe » + annuaire des équipes).
- **Taille : M** — **Dépendances :** US-4.1.
- Notes de livraison : écran `src/app/equipes/creer.tsx`. La région est préremplie depuis le profil. Le nom déjà pris s'affiche sous le champ, pas dans un bandeau.

### US-4.3 — Rejoindre une équipe par code d'invitation — ✅ Livrée (2026-07-30)
**En tant que** joueur, **je veux** rejoindre une équipe via un code partagé par le capitaine **afin d'** intégrer mon groupe sans procédure lourde.
- Critères :
  1. Chaque équipe possède un code d'invitation court que le capitaine peut afficher et régénérer.
  2. Un champ « Rejoindre avec un code » ajoute le joueur au roster.
  3. Code invalide → message d'erreur clair.
- **Taille : M** — **Dépendances :** US-4.2.
- Notes de livraison : le code se saisit dans six cases (`join-code-input.tsx`) et part dès le 6ᵉ caractère, sans bouton. L'alphabet exclut O/0, I/1 et L, donc `normalizeCode` se contente d'ignorer ce qui n'en fait pas partie — un « ABC-DEF » dicté au téléphone passe tel quel. Sans `maxLength` sur le champ natif : les séparateurs tapés y restent et mangeraient le quota de 6 (le dernier caractère était perdu).
- Reste à faire : partager le code par lien profond (`egide://equipes/rejoindre?code=…`) plutôt que par texte seul.

### US-4.4 — Gestion du roster par le capitaine — ✅ Livrée (2026-07-30)
**En tant que** capitaine, **je veux** gérer mon roster **afin de** garder une équipe à jour.
- Critères :
  1. Le capitaine peut retirer un membre (confirmation) et transférer le capitanat.
  2. Un membre peut quitter l'équipe de lui-même ; le capitaine doit d'abord transférer son rôle pour partir.
  3. Le capitaine peut dissoudre l'équipe (confirmation, suppression logique).
  4. Les membres non-capitaines ne voient pas ces actions (et la RLS les bloque).
- **Taille : M** — **Dépendances :** US-4.3.
- Notes de livraison : les actions destructrices passent par une double pression (`confirm-button.tsx`) qui énonce la conséquence avant de s'armer, et se désarme au bout de 5 s — même comportement sur mobile et sur web, là où une `Alert` native n'aurait marché que sur mobile. La dissolution est bien une suppression réelle (cascade sur `team_members`), pas logique comme l'énonçait le critère 3 : une équipe dissoute n'a pas d'historique à préserver tant que les tournois par équipes (EPIC-7) n'existent pas.

---

## EPIC-5 — Soumission simple des listes d'armées

**Objectif :** conformité phase 1 du cahier des charges — soumission texte/PDF, validation manuelle par l'organisateur. L'architecture doit permettre la vérification poussée en phase 2.
**Valeur utilisateur :** l'organisateur collecte toutes les listes au même endroit au lieu de courir après les e-mails.

### US-5.1 — Soumettre sa liste en texte — ✅ Livrée (2026-07-30)
> Migrations 0018 (`army_lists`, `submit_army_list`, `review_army_list`) et 0019 (`reopen_army_list`). Une liste peut révéler une stratégie : seuls le joueur et l'organisateur la lisent (RLS vérifiée par test). Refusée → resoumissible ; validée → figée ; soumission close dès le lancement du tournoi (règle v1 la plus simple, une deadline paramétrable pourra remplacer cette condition plus tard).
> Mobile : carte « Ma liste d'armée » sur la fiche (4 états, statut porté par badge + texte, jamais la couleur seule) + écran `evenements/[id]/liste.tsx` (faction préremplie du profil, champ mono sans autocorrection, texte jamais perdu en cas d'erreur réseau, garde-fou de sortie).
**En tant que** joueur inscrit, **je veux** coller ma liste d'armée sur ma fiche d'inscription **afin de** la transmettre à l'organisateur.
- Critères :
  1. Migration : table `army_lists` (inscription, contenu texte, faction, statut : soumise / validée / refusée, commentaire organisateur) avec RLS.
  2. Champ multiligne accessible depuis la fiche du tournoi pour un joueur inscrit ; modifiable tant que la liste n'est pas validée.
  3. La fiche événement indique au joueur l'état de sa liste (non soumise / soumise / validée / refusée).
- **Taille : M** — **Dépendances :** US-2.3.

### US-5.2 — Joindre un PDF — ✅ Livrée (2026-07-30)
> Migration 0020 : bucket privé `army-lists` (5 Mo, PDF uniquement), chemin conventionnel `<registration_id>.pdf` qui rend les politiques Storage vérifiables : dépôt réservé au joueur (tournoi ouvert, liste non validée), lecture réservée au joueur et à l'organisateur. Le PDF s'ajoute à la liste texte, il ne la remplace pas.
> Mobile : bloc « Ou joindre un PDF » sur l'écran de saisie (choisir / remplacer / retirer). Back office : « Ouvrir le PDF joint » dans le panneau de relecture, via URL signée de 5 minutes.
> Politiques vérifiées par 6 assertions SQL (dépôt d'autrui refusé, liste validée figée, lecture par un tiers refusée). L'envoi d'octets réels passe par supabase-js standard — un essai sur appareil réel reste conseillé avant le premier tournoi.
**En tant que** joueur, **je veux** joindre ma liste en PDF **afin d'** utiliser l'export de mon outil de création de listes.
- Critères :
  1. Upload d'un PDF vers Supabase Storage (bucket privé, taille max définie, ex. 5 Mo).
  2. Seuls le joueur et l'organisateur du tournoi peuvent télécharger le fichier.
  3. Remplacement possible tant que la liste n'est pas validée.
- **Taille : M** — **Dépendances :** US-5.1.

### US-5.3 — Validation manuelle par l'organisateur — ✅ Livrée (2026-07-30)
> Page `backoffice/src/pages/listes.tsx` : tableau de synthèse (les inscriptions sans liste restent visibles, atténuées — l'absence est une information de pilotage) + panneau latéral de relecture qui parcourt la file, le motif de refus se rédige la liste sous les yeux. Refus impossible sans motif (bouton désactivé + fonction SQL). Validation annulable (toast « Annuler » et « Repasser en relecture », migration 0019). Relance sans push : « Copier les pseudos sans liste ».
> Testé de bout en bout entre les deux apps : soumission mobile → refus avec motif → l'encart rouge apparaît côté joueur → correction resoumise → revient « À relire » → validation → figée côté mobile avec bandeau vert.
**En tant qu'** organisateur, **je veux** valider ou refuser chaque liste avec un commentaire **afin de** garantir des listes conformes le jour J.
- Critères :
  1. Vue « Listes » sur la fiche de gestion : par joueur, statut et contenu/PDF consultables.
  2. Actions valider / refuser (avec commentaire obligatoire en cas de refus).
  3. Le joueur voit le statut et le commentaire ; une liste refusée redevient modifiable.
  4. Compteur « X listes validées / Y inscrits ».
- **Taille : M** — **Dépendances :** US-5.1 (US-5.2 optionnelle).

---

## EPIC-6 — Notifications push essentielles

**Objectif :** les notifications « essentielles » de la phase 1 du cahier des charges, en fin de MVP conformément à la décision produit (« prévu mais pas prioritaire »).
**Valeur utilisateur :** le joueur est prévenu au bon moment sans garder l'app ouverte.

### US-6.1 — Infrastructure de notifications — 🔶 Codée (2026-07-30), test téléphone en attente
> Migration 0021 (`push_tokens`, RLS par joueur), `src/lib/push.ts` (`registerForPush` : permission demandée **après une inscription à un tournoi**, jamais au premier lancement ; refus et absence de support gérés sans crash), Edge Function `send-push` (mode `{ test: true }` vers soi-même avec JWT ; envoi ciblé réservé à la clé service ; jetons morts purgés). Bouton « Tester les notifications » dans le Profil. `projectId` EAS inscrit dans app.json.
> **Critère 3 non vérifié** : il faut un vrai téléphone ET un development build (`eas build --profile development`) — depuis le SDK 53, Expo Go ne reçoit plus les push distantes. À faire par le porteur du projet : `eas login`, build, installer, puis « Tester les notifications ».
**En tant que** joueur, **je veux** autoriser les notifications **afin de** recevoir les alertes du tournoi.
- Critères :
  1. Demande de permission au bon moment (pas au premier lancement) ; token Expo Push stocké en base lié au profil.
  2. Refus de permission géré proprement (pas de crash, possibilité de réactiver).
  3. Une notification de test peut être envoyée et reçue sur un vrai téléphone.
- **Point technique :** nécessite un development build (les push ne fonctionnent pas dans Expo Go ni dans le navigateur) — à anticiper.
- **Taille : L** — **Dépendances :** aucune fonctionnelle, mais à livrer après EPIC-3 pour avoir des événements à notifier.

### US-6.2 — Notification de début de ronde — 🔶 Codée (2026-07-30), réception téléphone en attente
> Migration 0022 : table `push_outbox` + triggers. Chaque événement à notifier est posé en file par la base au moment où il naît ; la fonction `send-push` (mode `flush`) la vide et **compose les messages côté serveur** — le contenu ne vient jamais de l'appelant, donc n'importe quel utilisateur connecté peut demander le vidage sans risque. Message : « Ronde X : table Y, contre Z » (ou « tu as le bye »), un tap ouvre l'écran des tables (`data.url` + listener dans `_layout.tsx`). Les joueurs droppés ne sont pas appariés, donc pas notifiés.
> Chaîne vérifiée de bout en bout dans le navigateur : action → événement en file → flush → `processed: 1`. Seule la réception finale attend le development build.
**En tant que** joueur checked-in, **je veux** être notifié quand les appariements sont publiés **afin de** rejoindre ma table sans délai.
- Critères :
  1. À la génération d'une ronde, chaque joueur apparié reçoit une push « Ronde X : table Y contre Z ».
  2. Un tap sur la notification ouvre l'écran des appariements.
  3. Les joueurs droppés ne reçoivent rien.
- **Taille : M** — **Dépendances :** US-6.1, US-3.6.

### US-6.3 — Notifications d'inscription — 🔶 Codée (2026-07-30), réception téléphone en attente
> Mêmes triggers (0022) : promotion liste d'attente → « Ta place est confirmée ! » ; liste validée/refusée → renvoi vers l'écran de liste ; nouvelle inscription → notification à l'organisateur, désactivable par l'interrupteur « Inscriptions sur mes tournois » du Profil (colonne `notify_registrations`).
**En tant que** joueur, **je veux** être notifié quand ma place est confirmée depuis la liste d'attente ou quand ma liste est validée/refusée **afin de** réagir vite.
- Critères :
  1. Push à la promotion liste d'attente → inscrit.
  2. Push au changement de statut de ma liste d'armée.
  3. L'organisateur est notifié d'une nouvelle inscription (activable/désactivable).
- **Taille : M** — **Dépendances :** US-6.1, US-2.4, US-5.3.

### US-6.4 — Alerte « tournoi près de chez moi » — 🔶 Codée (2026-07-30), réception téléphone en attente
> Trigger à la publication (`open` à la création ou depuis un brouillon) : push aux profils de la même région, hors organisateur, préférence « Tournois dans ma région » désactivable au Profil (`notify_region`). Pas de doublon : l'événement n'est créé qu'une fois par tournoi, une modification ne le refait pas.
**En tant que** joueur, **je veux** être alerté quand un tournoi ouvre dans ma région **afin de** ne rater aucun événement local.
- Critères :
  1. À la publication d'un tournoi, push aux joueurs dont la région du profil correspond.
  2. Préférence activable/désactivable dans le profil.
  3. Pas de doublon si le tournoi est modifié.
- **Taille : M** — **Dépendances :** US-6.1, US-1.2, profil (livré).

---

## EPIC-7 — Tournois par équipes et appariements capitaines (Phase 2)

**Objectif :** formats 3 joueurs (FR), 5–8 (ETC) et taille libre, avec la mécanique d'appariement capitaine vs capitaine.
**Valeur utilisateur :** EGIDE couvre les plus gros événements du calendrier français (championnats par équipes).

US à affiner au lancement de la phase 2 (grain volontairement plus gros) :
- **US-7.1** Création d'un tournoi type « équipe » avec taille d'équipe (3 / 5–8 / libre) — **M** — dép. EPIC-1.
- **US-7.2** Inscription d'une équipe par son capitaine, avec roster nominatif validé — **M** — dép. EPIC-4, US-7.1.
- **US-7.3** Rondes suisses entre équipes (score d'équipe agrégé) — **L** — dép. EPIC-3, US-7.2.
- **US-7.4** Écran d'appariement capitaines (choix alterné des matchs joueur contre joueur) — **L** — dép. US-7.3. **Point métier : le protocole exact d'appariement (ordre des picks, timing) varie selon les formats — à préciser avant conception.**
- **US-7.5** Saisie des scores par table et double classement (équipes + individuel) — **M** — dép. US-7.4.

## EPIC-8 — Chat (Phase 2)

**Objectif :** messagerie d'équipe et fil de discussion par tournoi, avec modération.
- **US-8.1** Fil de discussion par tournoi (inscrits + organisateur) — **L**.
- **US-8.2** Messagerie d'équipe (membres du roster) — **M** — dép. EPIC-4.
- **US-8.3** Modération : suppression de messages par l'organisateur/capitaine, signalement — **M**.

## EPIC-9 — Profil enrichi et historique (Phase 2)

**Objectif :** transformer les résultats de tournois en historique joueur.
- **US-9.1** Historique des tournois joués sur le profil (résultats, classements) — **M** — dép. US-3.9.
- **US-9.2** Statistiques par faction jouée (parties, victoires) — **M** — dép. US-9.1.

## EPIC-10 — Vérification poussée des listes (Phase 2)

**Objectif :** parsing des listes, contrôle des points et de la légalité GHB — dans le respect de la propriété intellectuelle de Games Workshop (saisie communautaire ou imports à étudier, décision reportée conformément au cahier des charges).
- **US-10.1** Étude de faisabilité juridique et technique (source des données de points) — **M**. **À instruire avant tout développement.**
- **US-10.2+** À définir après US-10.1.

## EPIC-11 — Phase 3

- **US-11.1** Classement ELO national — dép. EPIC-9.
- **US-11.2** Carte interactive des événements — dép. EPIC-2.
- **US-11.3** Statistiques méta (factions, taux de victoire) — dép. EPIC-9.
- **US-11.4** Publication App Store + Play Store (comptes développeur, assets, review).

---

## Prochaine itération recommandée

Dans l'ordre, chaque étape testable dans le navigateur :

1. **US-1.1 — Table `tournaments` (S)** : même schéma de travail que la migration `profiles` déjà réussie ; terrain connu, risque faible.
2. **US-1.2 — Formulaire de création (M)** : réutilise les patterns de `profile-form.tsx` ; premier écran « métier » de l'app.
3. **US-1.3 — Mes tournois (S)** : boucle complète créer → voir, très gratifiante et facile à tester.
4. **US-2.1 — Liste publique des événements (S)** : donne enfin du contenu à l'onglet Événements ; l'app devient montrable à la communauté.
5. **US-2.2 + US-2.3 — Fiche événement et inscription en un clic (S+M)** : première interaction entre deux utilisateurs (organisateur/joueur), testable avec deux comptes.

**Justification :** cette séquence livre le plus court chemin vers un scénario de bout en bout « un organisateur publie, un joueur s'inscrit », prérequis de toute la mécanique des rondes suisses (EPIC-3), qui est le morceau le plus complexe et qu'on abordera avec des fondations éprouvées.

---

## Architecture : deux applications

Depuis le 2026-07-25, le projet contient deux applications qui partagent le même projet Supabase et les mêmes comptes :

| Application | Dossier | Public | Contenu |
|---|---|---|---|
| App mobile EGIDE | racine (`src/`) | Joueurs | Annuaire d'événements, fiche, inscription, profil, équipes |
| Back office EGIDE | `backoffice/` | Organisateurs | Gestion des tournois : édition, annulation, puis inscrits, check-in, rondes & scores, listes d'armées |

Les US de gestion organisateur (US-1.4, US-2.6, US-3.x, US-5.3) sont donc à réaliser dans le **back office**. Les US joueur (US-2.x, US-4.x) restent dans l'app mobile.

Lancer le back office :

```bash
npm --prefix backoffice run dev
```

## EPIC-12 — Administration de la plateforme (Phase 2) — ✅ Livré (2026-08-22)

> **Les six US sont livrées** (migrations 0028 à 0034, Edge Function `admin-account`, `send-push` v5).
> Reste à faire avant de considérer l'EPIC clos pour de bon :
> 1. **Le parcours navigateur n'a jamais été fait** — aucun navigateur pilotable sur le poste de développement (Chrome absent, droits administrateur requis). Toute la couche données est vérifiée par assertions SQL et par des appels HTTP réels, mais personne n'a encore cliqué dans les écrans.
> 2. **Nommer le vrai compte admin.** `TesteurQA` a été promu pour le développement ; avant ouverture, basculer sur le compte du porteur (procédure documentée en tête de la migration 0028).
> 3. **Deux arbitrages en attente du PO** : ouvrir ou non le contenu des listes d'armées à l'administration (aujourd'hui privé entre le joueur et son organisateur), et livrer ou non la page « Journal » proposée par l'agent `ux-ui` — sa place est réservée dans la navigation, tout est déjà en base.
> 4. **Limite connue de la désactivation** : un bannissement bloque la connexion et le renouvellement de session, mais un jeton d'accès déjà émis reste valide jusqu'à son expiration (une heure). Comportement standard de Supabase ; le corriger demanderait de révoquer explicitement les sessions.


**Objectif :** donner au porteur du projet un rôle admin vérifié en base et une section d'administration dans le back office : supervision de tous les tournois, comptes et équipes, avec des actions d'urgence tracées et des garde-fous explicites.
**Valeur utilisateur :** dès que l'app est utilisée par de vrais joueurs, quelqu'un doit pouvoir intervenir (tournoi fantôme, nom d'équipe offensant, compte problématique) sans toucher au SQL à la main — condition de confiance pour ouvrir l'app au-delà du cercle de test.

**Décision du porteur du projet (2026-08-21) :** l'administration vit **uniquement dans le back office web**. Aucune page admin dans l'app mobile pour l'instant ; on pourra en ajouter plus tard si le besoin apparaît.

### US-12.1 — Rôle admin et journal d'audit en base — ✅ Livrée (2026-08-22)
> Migration 0028 : colonne `profiles.role` (`user` / `admin`), fonction `is_admin()` en security definer (seule source de vérité), table `admin_actions` (journal d'audit), fonctions `log_admin_action()` (inexécutable par tout rôle client) et `set_admin_role()`.
> **Piège de la 0016, revenu à l'identique** : la migration 0001 avait accordé `UPDATE` sur la table `profiles` **entière**. Toute colonne ajoutée depuis est donc écrivable par son propriétaire — n'importe qui se serait nommé admin d'un simple update sur son propre profil. Remède : `revoke update` puis `grant update` colonne par colonne, `role` exclu. Les colonnes déjà écrivables sont reconduites à l'identique (`id` compris : l'app l'envoie dans son upsert de création de profil, le retirer casserait la création de compte).
> Garde-fous : motif obligatoire, rôle inconnu refusé, profil introuvable refusé, et **impossible de retirer le dernier admin** (seule façon de s'enfermer dehors).
> Le premier admin est nommé à la main en SQL — procédure documentée en tête de la migration ; aucun chemin applicatif, et c'est voulu. Fait pour le développement sur le compte `TesteurQA`.
> **18 assertions SQL passées** (transaction annulée, base intacte) : auto-nomination refusée (42501) et nomination d'un tiers refusée, non-régression de la modification de pseudo, `is_admin()` des deux côtés, refus à un non-admin, journal invisible / non écrivable / non falsifiable par un joueur, `log_admin_action` inexécutable, dernier admin protégé, nomination et révocation tracées avec leur motif.
**En tant que** porteur du projet, **je veux** qu'un rôle admin existe en base, vérifié par la base elle-même, **afin que** les pouvoirs d'administration ne dépendent jamais de l'interface.
- Critères :
  1. Migration : colonne `role` sur `profiles` (`user` par défaut, `admin`), **non modifiable par l'utilisateur lui-même** (GRANT par colonne, comme le code d'invitation en 0016) ; fonction `is_admin()` en `security definer`, seule source de vérité.
  2. Le premier admin est nommé à la main en SQL via le dashboard Supabase (assumé) ; la procédure est documentée en commentaire de la migration.
  3. Migration : table `admin_actions` (admin, action, cible, détail, date), remplie **par les fonctions admin elles-mêmes**, jamais par le front ; lecture réservée aux admins.
  4. Garde-fou : une fonction ne peut pas retirer le rôle du **dernier** admin.
  5. Test SQL : un utilisateur normal qui tente `update profiles set role = 'admin'` est refusé.
- **Taille : M** — **Dépendances :** aucune.

### US-12.2 — Section « Administration » : tous les tournois — 🔶 Codée (2026-08-22), test navigateur en attente
> Conception validée par l'agent `ux-ui` avant écriture. Décisions structurantes : l'administration est un **troisième mode de sidebar** (comme le mode tournoi), sur des **routes `/admin/*` distinctes** — un lien copié-collé ne doit pas changer de sens selon qui clique dessus.
> Base : migration 0029 (politique de lecture « un admin voit tous les tournois », **additionnelle** — la règle publique de la 0002 reste lisible telle quelle) et 0030 (`admin_tournaments()`, qui descend le comptage des inscrits et la jointure organisateur dans la base : les embarquer dans la requête tirerait des milliers de lignes pour n'afficher que des nombres).
> Front : `pages/admin-tournois.tsx`, `hooks/use-admin.ts`, `components/admin-page-header.tsx` (coquille commune + refus d'accès + bandeau lecture seule), troisième mode dans `layout.tsx`, routes et garde dans `App.tsx`, styles `.content-inner--wide` / `.badge-admin` / `.admin-toolbar`.
> Recherche (nom, ville, région, organisateur — insensible aux accents) et filtre de statut cumulatifs, tri clavier-accessible (`<th aria-sort><button>`, défaut de date décroissante), pagination « Afficher 50 de plus », quatre états vides distincts, avertissement explicite si la limite de 300 est atteinte.
> **La lecture seule est vraie en base, pas seulement à l'écran** : la politique d'écriture de la 0002 n'a pas été touchée, un `update` admin sur le tournoi d'autrui touche zéro ligne (assertion 8 de la 0029). L'interface retire les actions plutôt que de les griser.
> **Écueil trouvé** : la RLS de la 0018 réserve le contenu d'une liste d'armées au joueur et à son organisateur. En vue admin la page aurait affiché tout le monde en « liste manquante » — un mensonge. La RLS n'a pas été élargie (le contenu reste privé) et la page le dit explicitement. **À trancher par le PO** : faut-il ouvrir les listes à l'administration ?
> 15 assertions SQL passées (8 sur la 0029, 7 sur la 0030). `tsc -b`, `vite build` et `oxlint` propres. **Reste : le parcours navigateur** — aucun navigateur pilotable sur ce poste (Chrome absent, droits admin requis).
**En tant qu'** admin, **je veux** voir tous les tournois de la plateforme, tous statuts et tous organisateurs confondus, **afin de** superviser l'activité et repérer les anomalies.
- Critères :
  1. Une entrée « Administration » apparaît dans la sidebar du back office **uniquement** si `is_admin()` répond vrai ; un non-admin qui force l'URL est renvoyé (et la RLS ne lui renvoie de toute façon que ses propres données).
  2. Tableau de tous les tournois : nom, organisateur (pseudo), date, statut, inscrits/capacité ; recherche par nom et filtre par statut. Les brouillons des autres organisateurs y sont visibles (nouvelle politique RLS de lecture réservée aux admins).
  3. Un clic ouvre la fiche de gestion existante **en lecture seule** : l'admin observe, il n'opère pas le tournoi à la place de l'organisateur.
- **Taille : M** — **Dépendances :** US-12.1.

### US-12.3 — Annulation d'un tournoi par l'admin — ✅ Livrée (2026-08-22)
> Migration 0031 : `admin_cancel_tournament()` (motif d'au moins 10 caractères, statut `cancelled` — jamais de suppression, action consignée dans `admin_actions`) et `admin_cancellation()` qui rend le motif, la date et l'auteur de la dernière annulation administrative. Un statut « Annulé » nu ne dit pas pourquoi : c'est le premier usage visible du journal d'audit.
> **Refus explicites** : tournoi terminé (son classement fait foi pour ceux qui l'ont disputé), tournoi déjà annulé (sinon on notifie deux fois les mêmes inscrits), tournoi introuvable, motif absent ou trop court.
> Notification (critère 4) : nouveau `kind` `tournament_cancelled` dans `push_outbox`, **le motif voyage dans le payload** (`tournaments` ne le stocke pas, et le journal n'est pas fait pour être relu à chaque envoi). `send-push` **v5** compose un message pour l'organisateur d'abord — c'est son événement qu'on retire — puis pour chaque inscrit, **liste d'attente comprise** : une place espérée qui disparaît est aussi une nouvelle à annoncer.
> UI : zone de danger en bas de la fiche d'administration, jamais dans le tableau (300 lignes de 52 px et une action irréversible : l'accident est certain). Bouton `btn-danger-outline`, jamais plein. Quand l'annulation est impossible, le bloc reste et **explique** au lieu de griser un bouton. Modale : motif obligatoire avec erreur au blur, case de confirmation supplémentaire **uniquement** pour un tournoi en cours (une friction, pas deux : empiler les obstacles produit un automatisme), « Conserver le tournoi » en premier dans le DOM pour qu'une frappe réflexe sur Entrée ne détruise rien.
> **20 assertions SQL** passées. Deux tests étaient faux avant le code : « trop court » fait exactement 10 caractères (donc valide), et `push_outbox` a la RLS active sans aucune politique — la file ne se lit qu'en dehors de tout rôle client.
> **Chaîne prouvée de bout en bout en HTTP réel** : refus du motif court retourné en français au client, annulation (204), vidage de la file par `send-push` v5, et **jeton d'appareil purgé par Expo** — preuve que les messages ont bien été composés et envoyés. Jeu d'essai retiré de la base ensuite.
**En tant qu'** admin, **je veux** annuler un tournoi manifestement problématique (faux événement, organisateur injoignable), **afin de** protéger les joueurs inscrits.
- Critères :
  1. Action « Annuler ce tournoi » depuis la vue US-12.2, avec confirmation qui énonce la conséquence et un motif obligatoire.
  2. Fonction SQL dédiée : vérifie `is_admin()`, passe le statut à « annulé » (jamais de suppression physique — même règle que US-1.4), écrit le motif dans `admin_actions`.
  3. Impossible d'annuler un tournoi « terminé » ; un tournoi « en cours » exige une double confirmation (case à cocher, comme la clôture US-3.9).
  4. Les inscrits reçoivent la notification d'annulation via la file `push_outbox` (EPIC-6 livré).
- **Taille : S** — **Dépendances :** US-12.2.

### US-12.4 — Annuaire des comptes : recherche et désactivation — ✅ Livrée (2026-08-22)
> Migration 0032 : `admin_accounts()` (l'e-mail vit dans `auth.users`, qu'aucun client ne peut lire — d'où le `security definer`), `admin_assert_can_disable()`, `admin_log_account_ban()` et `admin_account_history()`.
> **Décision structurante : pas de colonne miroir.** L'état « désactivé » est `auth.users.banned_until`, que seul GoTrue écrit. Une copie dans `profiles` aurait fini par diverger de la vérité.
> Edge Function **`admin-account`** (nouvelle) : le bannissement relève de l'API admin de Supabase Auth et exige la clé service, qui ne doit jamais atteindre un navigateur. **Elle ne décide rien** — elle interroge `admin_assert_can_disable()` en agissant *au nom de l'appelant* (client anon + JWT de l'admin, pour que `auth.uid()` réponde), puis exécute. Contourner l'interface ne contourne donc aucune règle. Déroulé : autoriser (base) → bannir (Auth) → consigner (base), dans cet ordre pour qu'un échec du bannissement ne laisse jamais une trace mensongère au journal.
> Garde-fous (critère 3) : ni soi-même, ni un autre administrateur — il faut d'abord lui retirer son rôle via `set_admin_role`, geste distinct et tracé lui aussi.
> UI : page `/admin/comptes` sur la coquille admin commune, recherche pseudo/e-mail insensible aux accents, filtres Tous / Actifs / Désactivés / Administrateurs, et **l'action dans un panneau latéral, jamais dans le tableau** (le tableau consulte, le détail agit). Le panneau montre l'activité du compte et les mesures déjà prises : sans cet historique, un compte réactivé ne garderait aucune trace visible de ce qui lui est arrivé.
> **17 assertions SQL** passées. Trois de mes tests étaient faux avant le code : dans une même instruction SQL, `exists(...)` ne voit pas la ligne que la fonction vient d'écrire (snapshot d'instruction), et deux actions écrites dans une même transaction partagent le `now()`, donc leur ordre est indéfini.
> **Cycle complet prouvé en HTTP réel** : motif court refusé, auto-désactivation refusée, désactivation → `banned_until` posé → connexion refusée (`user_banned`) → réactivation → connexion rétablie. **Critère 4 vérifié** : les inscriptions du compte étaient intactes après coup. Défenses confirmées depuis un compte joueur : annuaire vide (aucun e-mail ne fuit) et tentative de désactivation de l'admin refusée par la base.
**En tant qu'** admin, **je veux** rechercher un compte et le désactiver, **afin de** couper l'accès d'un utilisateur nuisible sans rien supprimer.
- Critères :
  1. Page « Comptes » : recherche par pseudo ou e-mail ; affiche pseudo, région, date de création, nombre de tournois organisés et d'inscriptions.
  2. Action « Désactiver » (bannissement via l'API admin de Supabase Auth, donc **Edge Function** avec clé service — même patron que `send-push`) : l'utilisateur ne peut plus se connecter ; réactivation possible ; motif obligatoire, tracé dans `admin_actions`.
  3. Un admin ne peut pas désactiver un autre admin ni lui-même.
  4. Aucune donnée du compte n'est supprimée : tournois, résultats et équipes restent intacts.
- **Taille : L** — **Dépendances :** US-12.1.

### US-12.5 — Gestion des équipes : renommer, dissoudre — ✅ Livrée (2026-08-22)
> Migration 0033 : `admin_teams()`, `admin_rename_team()`, `admin_disband_team()`, `admin_team_history()`.
> **Divergence assumée avec le critère 3.** Le backlog demandait d'« étendre `disband_team` aux admins ». On ne l'a pas fait : `disband_team` n'exige aucun motif, l'ouvrir aux admins aurait créé un chemin de dissolution **non tracé** — précisément ce que la fin du même critère interdit. `disband_team` reste donc au capitaine, et l'administration passe par sa propre porte, qui exige un motif. Vérifié par assertion : un capitaine ne peut toujours pas dissoudre l'équipe d'un autre.
> `admin_disband_team` **consigne avant de supprimer** : après le `delete`, le nom, le capitaine et l'effectif n'existent plus, et un journal qui ne dit pas ce qui a disparu ne sert à rien. Le renommage garde l'ancien et le nouveau nom dans son `detail`.
> Message d'erreur rédigé pour un nom déjà pris : le message brut de Postgres parlerait d'un index, illisible pour qui vient de taper un nom.
> UI : page `/admin/equipes`, recherche équipe/capitaine, filtre par région, panneau latéral à trois états (consultation → renommer → dissoudre). Confirmation renforcée (case à cocher) pour la seule action irréversible, bouton « Retour » en premier dans le DOM.
> **Bug réel trouvé par les assertions** : `FOR UPDATE` est interdit sur le côté nullable d'une jointure externe — corrigé en `for update of t`, la table des équipes étant celle qu'on verrouille.
> 18 assertions SQL passées, plus un cycle complet en HTTP réel (annuaire, renommage avec accent, dissolution, journal). Jeu d'essai retiré ensuite.

**En tant qu'** admin, **je veux** renommer une équipe au nom offensant ou dissoudre une équipe abandonnée, **afin de** garder l'annuaire des équipes sain.
- Critères :
  1. Page « Équipes » : toutes les équipes (nom, capitaine, membres, région), recherche par nom.
  2. Renommage avec motif obligatoire, tracé ; le capitaine constate le nouveau nom.
  3. Dissolution avec confirmation renforcée, via la fonction `disband_team` existante étendue aux admins, tracée. **Attention EPIC-7 :** quand les tournois par équipes existeront, la dissolution devra préserver l'historique — à re-trancher à ce moment-là.
- **Taille : S** — **Dépendances :** US-12.1.

### US-12.6 — Tableau de bord : statistiques globales — ✅ Livrée (2026-08-22)
> Migration 0034 : `admin_dashboard()` (une seule ligne — les compteurs par statut se lisent d'un `filter` en base, alors que côté client il faudrait rapatrier tous les tournois pour les compter) et `admin_recent_actions()`.
> « Publié » et non « créé » pour l'activité à 30 jours : un brouillon n'existe pour personne.
> UI : page d'accueil de l'administration (`/admin`), deux groupes de chiffres (Communauté, Tournois), les cinq dernières mesures d'administration, et **chaque chiffre principal mène à sa liste** — un nombre sans porte de sortie oblige à chercher où regarder ensuite. Aucun graphique, conformément au critère 3.
> 10 assertions SQL passées, dont une de cohérence : la somme des cinq statuts égale le total des tournois. Contrat vérifié en HTTP réel.
**En tant qu'** admin, **je veux** voir les chiffres clés de la plateforme, **afin de** suivre si EGIDE prend dans la communauté.
- Critères :
  1. Page d'accueil de la section Administration : nombre de comptes, de tournois (par statut), d'inscriptions, d'équipes — calculés par une fonction SQL réservée aux admins.
  2. Un chiffre d'activité récente : comptes créés et tournois publiés sur les 30 derniers jours.
  3. Lecture seule, aucun graphique exigé en v1 (des nombres et des libellés suffisent).
- **Taille : S** — **Dépendances :** US-12.1.

### Hors périmètre v1 (noté, à re-prioriser plus tard)
- Suppression physique de données, modification de scores/classements par l'admin, connexion « en tant que » un utilisateur, signalements utilisateurs (attendre le chat, EPIC-8), export de données, rôles intermédiaires (modérateur), et **toute page admin dans l'app mobile**.

### Garde-fous : ce qu'un admin ne doit PAS pouvoir faire
- Lire un mot de passe (impossible par construction : Supabase ne stocke que des hachés).
- Modifier un score ou le classement d'un tournoi **terminé** — le verrou de `close_tournament` s'applique aussi à l'admin.
- Soumettre ou modifier une liste d'armée à la place d'un joueur.
- Supprimer physiquement un tournoi ayant des inscrits (annulation seulement).
- Se retirer son propre rôle s'il est le dernier admin.

---

## Points d'attention (écarts et risques)

1. **Notifications push : tension dans le cahier des charges.** La phase 1 inclut « notifications push essentielles », mais la décision produit validée les classe « pas prioritaires ». Le backlog tranche en les plaçant en fin de phase 1 (EPIC-6). De plus, les push exigent un development build (pas Expo Go, pas navigateur) — impact outillage à valider.
2. **Carte des événements : incohérence de phasage.** Le pilier 2 mentionne « liste + carte », mais la carte interactive est explicitement en phase 3. Le backlog suit le phasage : liste + filtres en MVP (EPIC-2), carte en US-11.2.
3. **Barème du bye — TRANCHÉ le 2026-07-26 par le porteur du projet :** un joueur exempt (sans adversaire) remporte sa ronde avec **15 points de partie contre 5** au bye. C'est donc une victoire, avec un écart de 10 points.
4. **Tie-breakers non spécifiés.** Le cahier des charges dit « à préciser » (SoS, points cumulés…). Question à poser au porteur du projet, expert AOS, avant US-3.7 : ordre exact des départages et barème du bye (points de tournoi et points de partie attribués).
4. **Protocole d'appariement capitaines non spécifié** (ordre des picks, formats 3 vs 5–8) : à préciser avant la conception de l'EPIC-7.
5. **README générique.** Le README est encore celui par défaut d'Expo — amélioration non bloquante : le remplacer par une présentation d'EGIDE.
6. **Saisie des scores par les joueurs eux-mêmes** (avec confirmation de l'adversaire) : pratique courante en tournoi mais absente du cahier des charges. Volontairement exclue du MVP (l'organisateur saisit) — à noter pour une phase ultérieure si souhaité.
7. ~~Scénario de ronde absent du modèle.~~ **Tranché le 2026-07-30** : le scénario est saisi par l'organisateur en texte libre → US-3.14.
8. ~~Publication des appariements.~~ **Tranché le 2026-07-30** : affichage immédiat dès la génération de la ronde, pas de bouton « publier ». Un organisateur qui génère en avance expose donc les tables — accepté, cela évite un état supplémentaire à gérer partout.
9. **Temps réel écarté du MVP.** Les écrans joueur se rafraîchissent en tirant vers le bas, sans Supabase Realtime : dix fois moins coûteux à livrer et à tester, pour un usage où le joueur consulte son téléphone au moment de l'annonce. À reconsidérer si l'usage montre le contraire.
10. **EPIC-6 est bloqué par US-3.3/3.10.** Le critère 2 d'US-6.2 (« un tap sur la notification ouvre l'écran des appariements ») vise un écran qui n'existe pas encore. Les notifications ne peuvent pas être développées avant ce lot.
