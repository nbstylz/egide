-- Migration 0029 : un admin voit tous les tournois (US-12.2)
--
-- La 0002 ne laisse voir un brouillon qu'à son organisateur. Superviser la
-- plateforme suppose de voir aussi ceux des autres : un faux événement se
-- prépare en brouillon avant d'être publié.
--
-- Politique additionnelle plutôt que réécriture de la 0002 : les politiques
-- permissives s'additionnent (OR). La règle publique reste donc intacte et
-- lisible telle qu'elle a été écrite — on ne relit pas une condition à
-- rallonge pour comprendre ce qu'un visiteur anonyme a le droit de voir.
--
-- `(select public.is_admin())` et non `public.is_admin()` : sans le
-- sous-select, la fonction est rappelée à chaque ligne examinée. Même
-- raison que le `(select auth.uid())` des politiques existantes.

create policy "Un admin voit tous les tournois"
  on public.tournaments for select
  to authenticated
  using ((select public.is_admin()));
