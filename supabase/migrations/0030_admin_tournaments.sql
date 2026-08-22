-- Migration 0030 : la liste de supervision des tournois (US-12.2)
--
-- « Mes tournois » compte ses inscrits côté client, en embarquant
-- `registrations(status)` dans la requête. À une poignée de tournois c'est
-- gratuit ; sur toute la plateforme, cela tirerait des milliers de lignes
-- d'inscription pour n'en garder qu'un nombre. Le comptage descend donc
-- dans la base, avec la jointure vers l'organisateur.
--
-- `where public.is_admin()` : à qui n'est pas admin, la fonction ne renvoie
-- rien du tout. L'interface a sa propre garde, mais elle n'est qu'un confort
-- — c'est ici que la règle est vraie.

create or replace function public.admin_tournaments(p_limit int default 300)
returns table (
  id uuid,
  name text,
  city text,
  region text,
  event_date date,
  status text,
  type text,
  capacity integer,
  points_limit integer,
  rounds_count integer,
  created_at timestamptz,
  organizer_id uuid,
  organizer_pseudo text,
  registered_count bigint
)
language sql
security definer
stable
set search_path = public
as $$
  select
    t.id, t.name, t.city, t.region, t.event_date, t.status, t.type,
    t.capacity, t.points_limit, t.rounds_count, t.created_at,
    t.organizer_id, p.pseudo,
    count(r.id) filter (where r.status in ('registered', 'checked_in'))
  from public.tournaments t
  -- `left join` sur le profil : un organisateur dont le compte a disparu ne
  -- doit pas faire disparaître son tournoi de la supervision.
  left join public.profiles p on p.id = t.organizer_id
  left join public.registrations r on r.tournament_id = t.id
  where public.is_admin()
  group by t.id, p.pseudo
  order by t.event_date desc
  limit greatest(p_limit, 1);
$$;

revoke execute on function public.admin_tournaments(int) from public, anon;
grant execute on function public.admin_tournaments(int) to authenticated;
