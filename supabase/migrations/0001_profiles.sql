-- Migration 0001 : table des profils joueurs
-- Chaque compte (auth.users) possède un profil public : pseudo, région, faction favorite.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  pseudo text not null unique check (char_length(pseudo) between 3 and 24),
  region text,
  faction_favorite text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sécurité au niveau des lignes (RLS) : sans règle explicite, personne ne peut
-- lire ni écrire. On autorise uniquement ce qui est nécessaire.
alter table public.profiles enable row level security;

create policy "Les profils sont visibles par les utilisateurs connectés"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Chacun peut créer son propre profil"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "Chacun peut modifier son propre profil"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id);
