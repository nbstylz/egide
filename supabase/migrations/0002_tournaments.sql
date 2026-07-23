-- Migration 0002 : table des tournois (US-1.1)
-- Un tournoi est créé et administré par un organisateur (son profil).

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 3 and 80),
  city text not null,
  region text,
  event_date date not null,
  points_limit integer not null default 2000 check (points_limit > 0),
  rounds_count integer not null default 5 check (rounds_count >= 1),
  capacity integer not null check (capacity > 0),
  type text not null default 'individual' check (type in ('individual', 'team')),
  status text not null default 'open'
    check (status in ('draft', 'open', 'in_progress', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index pour les listes : "Mes tournois" et l'annuaire trié par date.
create index tournaments_organizer_idx on public.tournaments (organizer_id);
create index tournaments_status_date_idx on public.tournaments (status, event_date);

alter table public.tournaments enable row level security;

-- Lecture publique (même sans compte) des tournois non-brouillon ;
-- l'organisateur voit aussi ses propres brouillons.
create policy "Les tournois publiés sont visibles par tous"
  on public.tournaments for select
  to authenticated, anon
  using (status <> 'draft' or (select auth.uid()) = organizer_id);

create policy "Un utilisateur connecté peut créer son tournoi"
  on public.tournaments for insert
  to authenticated
  with check ((select auth.uid()) = organizer_id);

create policy "Seul l'organisateur peut modifier son tournoi"
  on public.tournaments for update
  to authenticated
  using ((select auth.uid()) = organizer_id);
