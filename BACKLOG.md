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

### US-3.3 — Écran des appariements de la ronde
**En tant que** joueur, **je veux** voir ma table et mon adversaire dès la publication de la ronde **afin de** m'installer sans attendre l'annonce micro.
- Critères :
  1. La fiche du tournoi (côté joueur) affiche la ronde en cours : liste table / joueur A vs joueur B.
  2. Mon propre appariement est mis en évidence en haut de l'écran.
  3. Le bye est affiché clairement le cas échéant.
  4. Lecture seule pour les joueurs.
- **Taille : S** — **Dépendances :** US-3.2.

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

### US-3.6 — Génération automatique des rondes suivantes (suisse)
**En tant qu'** organisateur, **je veux** générer la ronde suivante en appariement suisse **afin d'** opposer les joueurs de score proche sans rematch.
- Critères :
  1. Bouton « Générer la ronde suivante » actif uniquement quand tous les scores de la ronde en cours sont saisis.
  2. Appariements par groupes de score (victoires, puis points de partie), sans jamais rejouer un adversaire déjà affronté.
  3. Le bye ne retombe pas deux fois sur le même joueur.
  4. Cas testable : 4 joueurs, 2 rondes — en ronde 2, les deux vainqueurs de ronde 1 s'affrontent.
  5. Blocage propre si le nombre de rondes configuré est atteint.
- **Taille : L** — **Dépendances :** US-3.4.

### US-3.7 — Tie-breakers standards
**En tant qu'** organisateur, **je veux** un départage conforme aux standards AOS **afin que** le classement final soit incontestable.
- Critères :
  1. Ordre de départage implémenté et affiché dans l'app (ex. : points de tournoi → SoS → points de partie).
  2. Le SoS (Strength of Schedule) est calculé sur les adversaires rencontrés.
  3. La règle exacte est visible sur l'écran de classement (transparence pour les joueurs).
- **Point métier :** le cahier des charges dit « à préciser en phase de conception ». **Question à poser au porteur du projet (expert AOS)** — ordre exact des tie-breakers et barème du bye — avant de développer cette US.
- **Taille : M** — **Dépendances :** US-3.5, US-3.6.

### US-3.8 — Abandon en cours de tournoi (drop)
**En tant qu'** organisateur, **je veux** retirer un joueur qui abandonne **afin que** les rondes suivantes restent cohérentes.
- Critères :
  1. Action « Drop » sur un joueur depuis la gestion du tournoi, avec confirmation.
  2. Le joueur droppé conserve ses résultats mais n'est plus apparié.
  3. Le classement le signale (mention « abandon »).
- **Taille : S** — **Dépendances :** US-3.6.

### US-3.9 — Clôture du tournoi et podium
**En tant qu'** organisateur, **je veux** clôturer le tournoi après la dernière ronde **afin de** figer le classement final.
- Critères :
  1. Bouton « Clôturer » disponible quand la dernière ronde est complètement saisie ; statut → « terminé ».
  2. Le classement final est figé, avec mise en avant du podium (top 3).
  3. Plus aucune modification de score possible après clôture.
  4. Le tournoi terminé reste consultable (résultats publics).
- **Taille : S** — **Dépendances :** US-3.7.

---

## EPIC-4 — Équipes comme entités sociales

**Objectif :** créer/rejoindre une équipe, roster, capitaine — sans tournois par équipes (phase 2).
**Valeur utilisateur :** les équipes existent, se structurent et fidélisent leurs membres dès le MVP.

### US-4.1 — Tables `teams` et `team_members`
**En tant que** joueur, **je veux** que les équipes soient stockées en base **afin de** construire les écrans dessus.
- Critères :
  1. Migration : `teams` (nom, description, capitaine, région) et `team_members` (équipe, joueur, rôle capitaine/membre) avec RLS.
  2. Un joueur ne peut être qu'une fois membre d'une même équipe (contrainte d'unicité).
  3. Lecture publique des équipes ; écriture selon le rôle.
- **Taille : S** — **Dépendances :** aucune (parallélisable avec EPIC-1 à 3).

### US-4.2 — Créer une équipe
**En tant que** joueur, **je veux** créer mon équipe depuis l'onglet Équipes **afin d'** en devenir le capitaine.
- Critères :
  1. Formulaire : nom (unique), description, région.
  2. Le créateur devient automatiquement capitaine et membre.
  3. L'équipe apparaît dans l'onglet Équipes (« Mon équipe » + annuaire des équipes).
- **Taille : M** — **Dépendances :** US-4.1.

### US-4.3 — Rejoindre une équipe par code d'invitation
**En tant que** joueur, **je veux** rejoindre une équipe via un code partagé par le capitaine **afin d'** intégrer mon groupe sans procédure lourde.
- Critères :
  1. Chaque équipe possède un code d'invitation court que le capitaine peut afficher et régénérer.
  2. Un champ « Rejoindre avec un code » ajoute le joueur au roster.
  3. Code invalide → message d'erreur clair.
- **Taille : M** — **Dépendances :** US-4.2.

### US-4.4 — Gestion du roster par le capitaine
**En tant que** capitaine, **je veux** gérer mon roster **afin de** garder une équipe à jour.
- Critères :
  1. Le capitaine peut retirer un membre (confirmation) et transférer le capitanat.
  2. Un membre peut quitter l'équipe de lui-même ; le capitaine doit d'abord transférer son rôle pour partir.
  3. Le capitaine peut dissoudre l'équipe (confirmation, suppression logique).
  4. Les membres non-capitaines ne voient pas ces actions (et la RLS les bloque).
- **Taille : M** — **Dépendances :** US-4.3.

---

## EPIC-5 — Soumission simple des listes d'armées

**Objectif :** conformité phase 1 du cahier des charges — soumission texte/PDF, validation manuelle par l'organisateur. L'architecture doit permettre la vérification poussée en phase 2.
**Valeur utilisateur :** l'organisateur collecte toutes les listes au même endroit au lieu de courir après les e-mails.

### US-5.1 — Soumettre sa liste en texte
**En tant que** joueur inscrit, **je veux** coller ma liste d'armée sur ma fiche d'inscription **afin de** la transmettre à l'organisateur.
- Critères :
  1. Migration : table `army_lists` (inscription, contenu texte, faction, statut : soumise / validée / refusée, commentaire organisateur) avec RLS.
  2. Champ multiligne accessible depuis la fiche du tournoi pour un joueur inscrit ; modifiable tant que la liste n'est pas validée.
  3. La fiche événement indique au joueur l'état de sa liste (non soumise / soumise / validée / refusée).
- **Taille : M** — **Dépendances :** US-2.3.

### US-5.2 — Joindre un PDF
**En tant que** joueur, **je veux** joindre ma liste en PDF **afin d'** utiliser l'export de mon outil de création de listes.
- Critères :
  1. Upload d'un PDF vers Supabase Storage (bucket privé, taille max définie, ex. 5 Mo).
  2. Seuls le joueur et l'organisateur du tournoi peuvent télécharger le fichier.
  3. Remplacement possible tant que la liste n'est pas validée.
- **Taille : M** — **Dépendances :** US-5.1.

### US-5.3 — Validation manuelle par l'organisateur
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

### US-6.1 — Infrastructure de notifications
**En tant que** joueur, **je veux** autoriser les notifications **afin de** recevoir les alertes du tournoi.
- Critères :
  1. Demande de permission au bon moment (pas au premier lancement) ; token Expo Push stocké en base lié au profil.
  2. Refus de permission géré proprement (pas de crash, possibilité de réactiver).
  3. Une notification de test peut être envoyée et reçue sur un vrai téléphone.
- **Point technique :** nécessite un development build (les push ne fonctionnent pas dans Expo Go ni dans le navigateur) — à anticiper.
- **Taille : L** — **Dépendances :** aucune fonctionnelle, mais à livrer après EPIC-3 pour avoir des événements à notifier.

### US-6.2 — Notification de début de ronde
**En tant que** joueur checked-in, **je veux** être notifié quand les appariements sont publiés **afin de** rejoindre ma table sans délai.
- Critères :
  1. À la génération d'une ronde, chaque joueur apparié reçoit une push « Ronde X : table Y contre Z ».
  2. Un tap sur la notification ouvre l'écran des appariements.
  3. Les joueurs droppés ne reçoivent rien.
- **Taille : M** — **Dépendances :** US-6.1, US-3.6.

### US-6.3 — Notifications d'inscription
**En tant que** joueur, **je veux** être notifié quand ma place est confirmée depuis la liste d'attente ou quand ma liste est validée/refusée **afin de** réagir vite.
- Critères :
  1. Push à la promotion liste d'attente → inscrit.
  2. Push au changement de statut de ma liste d'armée.
  3. L'organisateur est notifié d'une nouvelle inscription (activable/désactivable).
- **Taille : M** — **Dépendances :** US-6.1, US-2.4, US-5.3.

### US-6.4 — Alerte « tournoi près de chez moi »
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

## Points d'attention (écarts et risques)

1. **Notifications push : tension dans le cahier des charges.** La phase 1 inclut « notifications push essentielles », mais la décision produit validée les classe « pas prioritaires ». Le backlog tranche en les plaçant en fin de phase 1 (EPIC-6). De plus, les push exigent un development build (pas Expo Go, pas navigateur) — impact outillage à valider.
2. **Carte des événements : incohérence de phasage.** Le pilier 2 mentionne « liste + carte », mais la carte interactive est explicitement en phase 3. Le backlog suit le phasage : liste + filtres en MVP (EPIC-2), carte en US-11.2.
3. **Barème du bye — TRANCHÉ le 2026-07-26 par le porteur du projet :** un joueur exempt (sans adversaire) remporte sa ronde avec **15 points de partie contre 5** au bye. C'est donc une victoire, avec un écart de 10 points.
4. **Tie-breakers non spécifiés.** Le cahier des charges dit « à préciser » (SoS, points cumulés…). Question à poser au porteur du projet, expert AOS, avant US-3.7 : ordre exact des départages et barème du bye (points de tournoi et points de partie attribués).
4. **Protocole d'appariement capitaines non spécifié** (ordre des picks, formats 3 vs 5–8) : à préciser avant la conception de l'EPIC-7.
5. **README générique.** Le README est encore celui par défaut d'Expo — amélioration non bloquante : le remplacer par une présentation d'EGIDE.
6. **Saisie des scores par les joueurs eux-mêmes** (avec confirmation de l'adversaire) : pratique courante en tournoi mais absente du cahier des charges. Volontairement exclue du MVP (l'organisateur saisit) — à noter pour une phase ultérieure si souhaité.
