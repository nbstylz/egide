import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

export type ArmyListStatus = 'submitted' | 'approved' | 'rejected';

export type ArmyList = {
  id: string;
  registration_id: string;
  content: string;
  faction: string | null;
  status: ArmyListStatus;
  organizer_comment: string | null;
  submitted_at: string;
  reviewed_at: string | null;
};

/**
 * Ma liste d'armée pour un tournoi. La RLS ne laisse passer que la mienne
 * (et celles de l'organisateur côté back office) : on filtre simplement par
 * inscription.
 */
export function useArmyList(registrationId: string | undefined) {
  const [list, setList] = useState<ArmyList | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!supabase || !registrationId) {
      setList(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from('army_lists')
      .select('id, registration_id, content, faction, status, organizer_comment, submitted_at, reviewed_at')
      .eq('registration_id', registrationId)
      .maybeSingle<ArmyList>();
    setList(data ?? null);
    setLoading(false);
  }, [registrationId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { list, loading, refresh };
}
