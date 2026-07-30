-- Migration 0021 : jetons de notification push (US-6.1)
--
-- Un jeton Expo Push par appareil, rattaché au profil. Un joueur peut avoir
-- plusieurs appareils ; un jeton révoqué côté système est simplement écrasé
-- ou supprimé au prochain lancement.

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_tokens_profile_idx on public.push_tokens (profile_id);

alter table public.push_tokens enable row level security;

-- Chacun ne voit et ne gère que ses propres jetons. L'envoi passe par une
-- Edge Function munie de la clé service : elle ignore la RLS.
create policy "Chacun lit ses jetons"
  on public.push_tokens for select to authenticated
  using (profile_id = auth.uid());

create policy "Chacun enregistre ses jetons"
  on public.push_tokens for insert to authenticated
  with check (profile_id = auth.uid());

create policy "Chacun met à jour ses jetons"
  on public.push_tokens for update to authenticated
  using (profile_id = auth.uid());

create policy "Chacun supprime ses jetons"
  on public.push_tokens for delete to authenticated
  using (profile_id = auth.uid());
