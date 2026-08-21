# EGIDE — architecture des paiements

> Document de conception. À lire avant d'écrire la première ligne de code de paiement.
> Rédigé le 21 août 2026, à partir du schéma existant (migrations 0001 à 0022).

## 1. Deux rails, et pourquoi ils ne se mélangent pas

EGIDE encaisse deux choses de nature juridique différente. Apple et Google les traitent
différemment, et se tromper de rail vaut un refus à la revue de l'App Store.

| | Rail A — inscriptions | Rail B — premium |
|---|---|---|
| **Ce qu'on vend** | une place à un tournoi physique | badges, statistiques avancées |
| **Nature** | service rendu dans le monde réel | contenu numérique consommé dans l'app |
| **Moyen imposé** | prestataire externe (**Stripe**) | achat intégré (**IAP**) |
| **Commission store** | **0 %** | 15 % (programme petites entreprises) à 30 % |
| **Où ça se passe** | navigateur, via `expo-web-browser` | dans l'app, via `react-native-purchases` |

La règle Apple est la guideline 3.1.3(e) « Goods and Services Outside of the App » : un
service consommé hors de l'app **ne doit pas** passer par l'achat intégré. C'est le régime
de la billetterie (Eventbrite, Weezevent). Google applique la même logique.

Conséquence directe : **la commission que tu prélèveras sur les inscriptions t'appartient
entièrement.** C'est le vrai moteur économique du projet ; le premium est un complément.

---

## 2. Rail A — les inscriptions aux tournois

### 2.1 Le vrai problème n'est pas Stripe, c'est la place réservée

Aujourd'hui `register_for_tournament` donne le statut `registered` immédiatement. Si
l'inscription devient payante, une question se pose : **à quel moment la place est-elle
prise ?**

- Si on réserve après paiement, deux joueurs peuvent payer pour la même dernière place.
  Il faut alors en rembourser un — mauvaise expérience, et du travail pour l'organisateur.
- Si on réserve avant paiement sans limite de temps, un joueur qui abandonne au moment de
  sortir sa carte gèle une place indéfiniment. Un tournoi affiche complet alors qu'il ne
  l'est pas.

**La solution : une réservation temporaire.** Le joueur obtient la place tout de suite,
avec un délai pour payer. Passé le délai, la place repart automatiquement à la liste
d'attente. C'est ce que font tous les systèmes de billetterie, et ça réutilise le verrou
`for update` déjà écrit dans la migration 0004.

**Délai recommandé : 30 minutes.** Assez long pour aller chercher sa carte bancaire, assez
court pour ne pas bloquer un tournoi qui se remplit.

### 2.2 Où stocker les données de paiement — attention au piège n° 1

La table `registrations` est **en lecture publique** (`to authenticated, anon using (true)`),
parce que l'annuaire affiche les places restantes sans compte.

C'est exactement la situation du piège n° 1 du `RESUME_PROJET.md` : le `invite_code` des
équipes exposé par une politique « lecture pour tous ». **Ne pas ajouter les colonnes
Stripe à `registrations`** — l'identifiant de session Stripe et le montant payé se
retrouveraient publics.

→ Table séparée `registration_payments`, avec sa propre RLS restrictive.

### 2.3 Migration 0023 — proposition

```sql
-- Migration 0023 : paiement des inscriptions (Rail A — Stripe)
--
-- Les frais d'inscription rémunèrent un service rendu dans le monde réel
-- (une place à un tournoi physique) : ils passent par Stripe et non par
-- l'achat intégré, conformément à la guideline Apple 3.1.3(e).
--
-- Les données de paiement vivent dans une table à part : `registrations`
-- est en lecture publique pour l'annuaire, et on ne veut pas y exposer
-- les identifiants Stripe (cf. piège du `invite_code`, migration 0016).

-- Prix du tournoi. NULL ou 0 = tournoi gratuit : le parcours actuel
-- reste inchangé, aucune régression sur l'existant.
alter table public.tournaments
  add column price_cents integer check (price_cents is null or price_cents >= 0),
  add column currency text not null default 'eur';

-- Nouveau statut : la place est tenue, le paiement est attendu.
alter table public.registrations
  drop constraint registrations_status_check;

alter table public.registrations
  add constraint registrations_status_check
  check (status in (
    'pending_payment',  -- place réservée, en attente de paiement
    'registered',
    'waitlisted',
    'withdrawn',
    'checked_in'
  ));

-- Échéance de la réservation. NULL pour les tournois gratuits.
alter table public.registrations
  add column payment_deadline timestamptz;

create index registrations_deadline_idx
  on public.registrations (payment_deadline)
  where status = 'pending_payment';

create table public.registration_payments (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique
    references public.registrations (id) on delete cascade,
  stripe_session_id text unique,
  stripe_payment_intent_id text,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'eur',
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'refunded', 'failed', 'expired')),
  paid_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.registration_payments enable row level security;

-- Le joueur voit son propre paiement ; l'organisateur voit ceux de son tournoi
-- (il doit savoir qui a réglé). Personne d'autre, et surtout pas `anon`.
create policy "Le joueur ou l'organisateur consulte le paiement"
  on public.registration_payments for select
  to authenticated
  using (
    exists (
      select 1
      from public.registrations r
      join public.tournaments t on t.id = r.tournament_id
      where r.id = registration_id
        and ((select auth.uid()) = r.player_id
             or (select auth.uid()) = t.organizer_id)
    )
  );

-- Aucune politique d'écriture : seule l'Edge Function du webhook écrit ici,
-- avec la clé de service. Le client ne doit jamais pouvoir se déclarer payé.
revoke insert, update, delete on public.registration_payments from authenticated, anon;
```

### 2.4 Libérer les places non payées

```sql
-- Rend à la liste d'attente les places dont le délai est dépassé.
-- Appelée par pg_cron toutes les 5 minutes.
create or replace function public.release_unpaid_registrations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tournament_id uuid;
  v_released int := 0;
begin
  for v_tournament_id in
    select distinct tournament_id
    from public.registrations
    where status = 'pending_payment'
      and payment_deadline < now()
  loop
    update public.registrations
    set status = 'withdrawn', updated_at = now()
    where tournament_id = v_tournament_id
      and status = 'pending_payment'
      and payment_deadline < now();

    get diagnostics v_released = row_count;

    -- La place libérée profite immédiatement au premier en attente.
    perform public.promote_waitlist(v_tournament_id);
  end loop;

  return v_released;
end;
$$;

revoke execute on function public.release_unpaid_registrations() from authenticated, anon;

select cron.schedule(
  'liberer-inscriptions-impayees',
  '*/5 * * * *',
  $$select public.release_unpaid_registrations()$$
);
```

`pg_cron` s'active dans le dashboard Supabase (Database → Extensions). Attention : sur le
palier gratuit, **le projet se met en veille après une semaine d'inactivité** (piège n° 8) —
le cron ne tourne pas pendant la veille. Sans conséquence en développement ; à surveiller
le jour où un vrai tournoi se remplit.

### 2.5 Le flux, côté joueur

1. Le joueur touche « S'inscrire » → `register_for_tournament` renvoie
   `pending_payment` avec `payment_deadline = now() + 30 min`.
2. L'app appelle une Edge Function `create-checkout` qui crée la session Stripe et renvoie
   son URL.
3. L'app ouvre l'URL avec `expo-web-browser` — **déjà dans tes dépendances**, rien à
   installer.
4. Stripe redirige vers un lien profond (`egide://inscription/{id}`) via `expo-linking`,
   également déjà présent.
5. En parallèle, Stripe appelle l'Edge Function `stripe-webhook` sur
   `checkout.session.completed` → statut `paid`, inscription en `registered`.

**Le webhook fait foi, jamais la redirection.** Un joueur peut fermer le navigateur avant
le retour, ou forger l'URL de retour. La redirection sert seulement à afficher l'écran de
confirmation.

Pendant l'attente, l'écran affiche le compte à rebours et un bouton « Reprendre le
paiement » : c'est la même session Stripe tant que le délai court.

### 2.6 Liste d'attente — et un cadeau pour l'EPIC-6

Quand `promote_waitlist` fait passer quelqu'un de `waitlisted` à `registered`, ce joueur
doit désormais payer lui aussi. Il faut donc le promouvoir en `pending_payment` avec une
nouvelle échéance — **et plutôt 24 h que 30 minutes**, car il ne s'y attendait pas et ne
regarde pas son téléphone.

Et il faut le prévenir. Ta chaîne de notifications est déjà en place : `push_outbox` +
triggers + Edge Function `send-push`. Il suffit d'un trigger de plus sur le passage à
`pending_payment` après promotion. **L'EPIC-6 devient une dépendance dure du paiement**, ce
qui est un argument de plus pour le finir en premier.

### 2.7 Remboursements

Un tournoi annulé (`status = 'cancelled'`) doit rembourser tout le monde. Un joueur qui se
désiste, cela dépend de la politique de l'organisateur — à trancher au niveau produit, pas
ici.

Techniquement : une Edge Function `refund-registration` appelle l'API Stripe, et le webhook
`charge.refunded` écrit `refunded_at`. **Ne jamais écrire « remboursé » avant la
confirmation de Stripe** — même principe qu'au paiement.

### 2.8 La décision qui reste à prendre

**Qui encaisse l'argent ?**

- **Stripe Connect** — chaque organisateur crée son compte, l'argent va directement chez
  lui, tu prélèves une commission au passage (`application_fee_amount`). Tu ne touches
  jamais les fonds : pas de responsabilité de remboursement, pas de contrainte
  réglementaire lourde. C'est le modèle Eventbrite.
- **Compte centralisé** — tout arrive chez toi, tu reverses aux organisateurs. Plus simple
  à coder, mais tu deviens dépositaire de l'argent d'autrui : obligations comptables,
  fiscales, et remboursements à ta charge si un organisateur disparaît.

**Recommandation : Stripe Connect Express.** L'inscription d'un organisateur prend cinq
minutes, et ça t'évite un statut réglementaire que tu ne veux pas assumer sur un projet
naissant. Le surcoût de développement est d'environ une US.

---

## 3. Rail B — le premium (badges, statistiques)

### 3.1 Ici, pas le choix

Badges et statistiques avancées sont du contenu numérique consommé dans l'app :
**achat intégré obligatoire**, 15 à 30 % de commission. Proposer Stripe pour ça vaut un
refus immédiat à la revue.

Inscris-toi au **Small Business Program** d'Apple : 15 % au lieu de 30 % tant que tu es
sous le million de dollars annuel. C'est une case à cocher, et personne ne pense à le
faire.

### 3.2 RevenueCat plutôt que StoreKit à la main

`react-native-purchases` unifie App Store et Play Store, gère les restaurations d'achat
(obligatoires, et pénibles à écrire soi-même) et envoie un webhook à chaque changement.
Gratuit jusqu'à 2 500 $ de revenu mensuel.

C'est une **dépendance native** : elle ne fonctionne pas dans Expo Go, il faut un
development build. Le même que celui qu'il te faut pour l'EPIC-6 — une seule manipulation
pour les deux.

### 3.3 Migration 0024 — les droits d'accès

```sql
-- Migration 0024 : droits premium (Rail B — achat intégré)
--
-- Alimentée exclusivement par le webhook RevenueCat. Une ligne par joueur
-- et par droit ; l'absence de ligne active vaut « pas premium ».

create table public.entitlements (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles (id) on delete cascade,
  product_id text not null,
  store text not null check (store in ('app_store', 'play_store')),
  is_active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_id, product_id)
);

create index entitlements_player_idx
  on public.entitlements (player_id)
  where is_active;

alter table public.entitlements enable row level security;

-- Chacun ne voit que ses propres droits.
create policy "Un joueur consulte ses droits"
  on public.entitlements for select
  to authenticated
  using ((select auth.uid()) = player_id);

revoke insert, update, delete on public.entitlements from authenticated, anon;

-- Lecture unique côté app : le hook `use-premium` appelle cette fonction.
create or replace function public.has_premium()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.entitlements
    where player_id = (select auth.uid())
      and is_active
      and (expires_at is null or expires_at > now())
  );
$$;

grant execute on function public.has_premium() to authenticated;
```

**Ne jamais faire confiance au SDK côté client pour ouvrir une fonctionnalité.** RevenueCat
répond dans l'app, mais un appareil modifié peut mentir. La base fait foi, via
`has_premium()`.

---

## 4. Les pièges de la revue App Store

1. **Expliquer le rail A au relecteur.** Une app qui ouvre un navigateur pour payer se fait
   refuser par défaut. Dans les notes de revue, écrire noir sur blanc : *« Les frais
   d'inscription concernent des tournois physiques se déroulant dans des lieux réels. Ils
   relèvent de la guideline 3.1.3(e). Le contenu numérique de l'app passe par l'achat
   intégré. »* Joindre la capture d'une fiche tournoi avec sa date et son adresse.
2. **Ne jamais orienter vers le web pour le premium.** Pas de « moins cher sur notre site »
   dans l'app.
3. **Le bouton « Restaurer mes achats » est obligatoire** pour le rail B. Refus automatique
   sans lui.
4. **Prévoir un compte de test payant** pour le relecteur, avec un tournoi payant en cours.

---

## 5. Ordre de mise en œuvre

| # | Étape | Pourquoi maintenant |
|---|---|---|
| 1 | **Finir l'EPIC-6** (development build) | Prérequis des deux rails : notifications de promotion et dépendance native RevenueCat |
| 2 | **EPIC-12 Administration** | Encaisser de l'argent d'inconnus sans supervision est le vrai risque |
| 3 | **Rail A** — migration 0023, Connect, Edge Functions | La valeur économique est ici |
| 4 | **Rail B** — migration 0024, RevenueCat | Complément ; sans base de joueurs, il ne rapporte rien |

Le premium avant les inscriptions serait une erreur : les badges se vendent à des joueurs
déjà présents, et ce sont les tournois qui les amènent.

---

## 6. À vérifier avant de coder

- [ ] Statut Stripe Connect choisi (Express recommandé)
- [ ] Politique de remboursement en cas de désistement — décision produit
- [ ] Commission EGIDE sur les inscriptions : montant fixe ou pourcentage
- [ ] `pg_cron` activé sur le projet Supabase
- [ ] Small Business Program Apple demandé
- [ ] Tournois gratuits toujours possibles (`price_cents` NULL) — non-régression
