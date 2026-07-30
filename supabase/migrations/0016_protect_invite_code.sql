-- Migration 0016 : le code d'invitation ne doit pas fuiter
--
-- La 0015 rendait la table `teams` lisible par tous pour l'annuaire — ce qui
-- exposait aussi `invite_code`. N'importe qui pouvait donc rejoindre
-- n'importe quelle équipe. RLS filtre les lignes, jamais les colonnes : on
-- descend donc au niveau des GRANT par colonne, et on sert le code par une
-- fonction qui vérifie que l'appelant est bien le capitaine.

revoke select on public.teams from authenticated, anon;

grant select (id, name, description, region, captain_id, created_at, updated_at)
  on public.teams to authenticated, anon;

/** Le code d'invitation, lisible par le seul capitaine (NULL sinon). */
create or replace function public.get_invite_code(p_team_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select invite_code from public.teams
  where id = p_team_id and captain_id = auth.uid();
$$;

revoke execute on function public.get_invite_code(uuid) from public, anon;
grant execute on function public.get_invite_code(uuid) to authenticated;
