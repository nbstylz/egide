# Vérification des listes d'armées — étude de faisabilité (US-10.1)

> **Ce document instruit, il ne tranche pas.** L'EPIC-10 propose de vérifier
> automatiquement qu'une liste d'armée est légale : bon nombre de points, unités
> autorisées, contraintes du General's Handbook en vigueur. Cela suppose de
> disposer des **coûts en points** de chaque unité. Ces données appartiennent à
> Games Workshop. La question n'est donc pas d'abord technique.
>
> Rédigé le 27 août 2026. **Aucune ligne de code ne doit être écrite sur
> l'EPIC-10 avant que le porteur ait tranché le point 4.**

## 1. Ce que l'EPIC promet, et ce qu'il exige

| Niveau de vérification | Ce qu'il faut connaître | Difficulté |
|---|---|---|
| **A. Le total annoncé** | Rien : le joueur saisit son total, l'app le compare à la limite du tournoi | Triviale |
| **B. La somme des lignes** | Rien : parser « 2 × Liberators — 220 pts » et additionner | Faible |
| **C. Les coûts réels** | **Le coût officiel de chaque unité** | Bloquée par le point 4 |
| **D. La légalité complète** | Coûts, plus les règles de composition du GHB en cours | Élevée, et instable |

**Le niveau B est atteignable sans aucune donnée de Games Workshop** : il vérifie
la cohérence interne de ce que le joueur a écrit, pas la vérité des chiffres.
C'est déjà utile — l'erreur la plus fréquente en tournoi est une addition fausse
ou une ligne oubliée, pas une unité inventée.

Le niveau C est celui que l'EPIC vise. C'est lui qui pose la question juridique.

## 2. Les quatre sources possibles pour les coûts en points

**a. Saisie communautaire dans EGIDE.** Les organisateurs ou une poignée de
contributeurs renseignent les coûts, édition par édition. Aucune dépendance
externe, mais un travail de mise à jour à chaque battletome, et la même question
juridique qu'ailleurs : recopier un tableau de points reste une reproduction.

**b. Import d'un fichier fourni par le joueur.** Les applications de composition
(Warscroll Builder, New Recruit, Listforge…) exportent du texte ou du JSON.
EGIDE n'héberge alors aucune donnée de coûts : elle **lit ce que le joueur a
produit avec un outil qu'il a le droit d'utiliser**. C'est la piste la moins
exposée, et de loin.

**c. API ou base tierce.** Dépendance à un service dont ni la disponibilité ni la
licence ne dépendent de nous. Un service gratuit qui ferme emporte la
fonctionnalité avec lui.

**d. Extraction depuis un support officiel.** À écarter sans discussion.

## 3. Ce que je ne peux pas trancher

Je ne suis pas en mesure de dire si tel usage est licite. Trois éléments doivent
être vérifiés **à leur source actuelle**, et par quelqu'un dont c'est le métier
si l'app devient payante :

1. **La politique de propriété intellectuelle de Games Workshop** telle qu'elle
   est publiée aujourd'hui, et ce qu'elle autorise pour un outil gratuit,
   non commercial, non distributeur de contenu.
2. **Le statut des applications existantes** : plusieurs outils communautaires
   manipulent ces données depuis des années. Cela n'établit pas un droit — c'est
   une tolérance, pas une licence — mais cela renseigne sur le risque réel.
3. **Les conditions d'utilisation des outils d'export** (point 2.b), qui peuvent
   interdire l'usage automatisé de leurs sorties.

**Le risque n'est pas symétrique.** Le pire cas n'est pas une amende : c'est un
retrait des stores, du jour au lendemain, qui emporterait **toute l'application**
— y compris les tournois en cours. Une fonctionnalité de confort ne vaut pas ce
risque-là.

## 4. Ce que je recommande, et ce que ça implique

**Livrer le niveau B, et ne pas ouvrir le niveau C tant que le point 3 n'est pas
vérifié.**

Concrètement, une US-10.2 réalisable tout de suite, sans aucune donnée de Games
Workshop :

- le joueur colle sa liste comme aujourd'hui ;
- l'app **repère les lignes qui portent un nombre de points** et les additionne ;
- elle compare ce total à la limite du tournoi et signale l'écart, **sans jamais
  affirmer que la liste est légale** — seulement que l'addition tombe juste ou
  non ;
- l'organisateur garde le dernier mot : la relecture humaine de l'US-5.3 ne
  disparaît pas, elle est assistée.

Ce que cela apporte : l'erreur la plus fréquente disparaît, et l'organisateur
cesse de faire des additions à la main la veille du tournoi. Ce que cela
n'apporte pas : aucune garantie de légalité. **Et il faut le dire dans l'écran,
sinon l'app promet une vérification qu'elle ne fait pas** — ce serait exactement
« raconter une histoire fausse », à l'endroit le plus coûteux, puisqu'un joueur
s'y fierait pour un tournoi.

**Si le porteur veut le niveau C**, la voie la plus sûre est la piste 2.b :
importer un export produit par l'outil du joueur, et ne jamais stocker de
tableau de coûts dans EGIDE. Cela déplace la question sans l'annuler, et exige
tout de même la vérification du point 3.

## 5. Décision attendue du porteur

- [ ] Ouvrir l'US-10.2 (niveau B, addition vérifiée, aucune donnée externe) ?
- [ ] Faire vérifier le point 3 auprès d'une source à jour, avant d'envisager le
      niveau C ?
- [ ] Ou classer l'EPIC-10 sans suite, la relecture humaine de l'US-5.3 suffisant
      aux formats visés ?

Tant qu'aucune de ces cases n'est cochée, l'EPIC-10 reste fermé.
