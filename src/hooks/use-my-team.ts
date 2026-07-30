import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

export type TeamMember = {
  id: string;
  player_id: string;
  role: 'captain' | 'member';
  joined_at: string;
  profile: { pseudo: string; faction_favorite: string | null } | null;
};

export type Team = {
  id: string;
  name: string;
  description: string | null;
  region: string | null;
  captain_id: string;
  created_at: string;
  members: TeamMember[];
};

/** Le capitaine d'abord, puis les autres par ordre d'arrivée. */
function byRoleThenArrival(a: TeamMember, b: TeamMember) {
  if (a.role !== b.role) return a.role === 'captain' ? -1 : 1;
  return a.joined_at.localeCompare(b.joined_at);
}

/**
 * L'équipe du joueur connecté, avec son roster. Un joueur n'appartient qu'à
 * une équipe à la fois : il n'y a donc rien à choisir.
 */
export function useMyTeam(userId: string | undefined) {
  const [team, setTeam] = useState<Team | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!supabase || !userId) {
      setTeam(null);
      setInviteCode(null);
      setLoading(false);
      return;
    }
    setLoading(true);

    const { data: membership } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('player_id', userId)
      .maybeSingle<{ team_id: string }>();

    if (!membership) {
      setTeam(null);
      setInviteCode(null);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('teams')
      .select(
        'id, name, description, region, captain_id, created_at, members:team_members(id, player_id, role, joined_at, profile:profiles(pseudo, faction_favorite))'
      )
      .eq('id', membership.team_id)
      .maybeSingle<Team>();

    if (data) {
      setTeam({ ...data, members: [...data.members].sort(byRoleThenArrival) });
      // Le code n'est lisible que par le capitaine : la base s'en assure.
      if (data.captain_id === userId) {
        const { data: code } = await supabase.rpc('get_invite_code', {
          p_team_id: data.id,
        });
        setInviteCode((code as string) ?? null);
      } else {
        setInviteCode(null);
      }
    } else {
      setTeam(null);
      setInviteCode(null);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const isCaptain = Boolean(team && userId && team.captain_id === userId);

  return { team, inviteCode, setInviteCode, isCaptain, loading, refresh };
}

export type TeamSummary = {
  id: string;
  name: string;
  region: string | null;
  captain: { pseudo: string } | null;
  members: { count: number }[];
};

/** Annuaire public des équipes, par ordre alphabétique. */
export function useTeams() {
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setTeams([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    const { data, error: dbError } = await supabase
      .from('teams')
      .select('id, name, region, captain:profiles(pseudo), members:team_members(count)')
      .order('name');
    if (dbError) {
      setError(true);
    } else {
      setTeams((data as unknown as TeamSummary[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { teams, loading, error, refresh };
}
