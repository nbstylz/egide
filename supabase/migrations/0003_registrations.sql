-- Migration 0003 : inscriptions des joueurs aux tournois (US-2.3)
-- Une ligne par couple (tournoi, joueur). La désinscription est un changement
-- de statut (pas de suppression) pour garder l'historique.

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'registered'
    check (status in ('registered', 'waitlisted', 'withdrawn', 'checked_in')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Impossible de s'inscrire deux fois au même tournoi.
  unique (tournament_id, player_id)
);

create index registrations_tournament_idx on public.registrations (tournament_id, status);
create index registrations_player_idx on public.registrations (player_id);

alter table public.registrations enable row level security;

-- Lecture publique : nécessaire pour afficher les places restantes dans
-- l'annuaire (même sans compte) et la liste des inscrits (US-2.4).
create policy "Les inscriptions sont visibles par tous"
  on public.registrations for select
  to authenticated, anon
  using (true);

create policy "Un joueur gère sa propre inscription"
  on public.registrations for insert
  to authenticated
  with check ((select auth.uid()) = player_id);

-- Le joueur peut modifier sa propre inscription (ex. se désinscrire) ;
-- l'organisateur du tournoi peut aussi la modifier (retrait, check-in — US-2.6/3.1).
create policy "Le joueur ou l'organisateur modifie l'inscription"
  on public.registrations for update
  to authenticated
  using (
    (select auth.uid()) = player_id
    or (select auth.uid()) = (
      select t.organizer_id from public.tournaments t where t.id = tournament_id
    )
  );
