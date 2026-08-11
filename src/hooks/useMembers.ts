/** Household members + management hooks. */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useHousehold } from '../lib/household';

const KEY = ['members'] as const;

export interface MemberWithProfile {
  household_id: string;
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
  profiles: { display_name: string | null; avatar_url: string | null } | null;
}

export function useMembers() {
  const { activeHouseholdId } = useHousehold();
  return useQuery<MemberWithProfile[]>({
    queryKey: [...KEY, activeHouseholdId],
    enabled: !!activeHouseholdId,
    queryFn: async () => {
      if (!activeHouseholdId) return [];
      // No FK from household_members.user_id → profiles.id (FK targets auth.users),
      // so the typed client can't infer the join. Query raw then resolve profiles.
      const { data: rows, error } = await supabase
        .from('household_members')
        .select('*')
        .eq('household_id', activeHouseholdId)
        .order('joined_at', { ascending: true });
      if (error) throw error;
      if (!rows || rows.length === 0) return [];
      const userIds = rows.map((r) => r.user_id);
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', userIds);
      if (pErr) throw pErr;
      const byId = new Map(profiles?.map((p) => [p.id, p]));
      return rows.map((r) => ({
        ...r,
        profiles: byId.get(r.user_id)
          ? {
              display_name: byId.get(r.user_id)!.display_name,
              avatar_url: byId.get(r.user_id)!.avatar_url,
            }
          : null,
      }));
    },
  });
}

export function useUpdateMemberRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      householdId,
      userId,
      role,
    }: {
      householdId: string;
      userId: string;
      role: 'owner' | 'member';
    }) => {
      const { error } = await supabase
        .from('household_members')
        .update({ role })
        .eq('household_id', householdId)
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ householdId, userId }: { householdId: string; userId: string }) => {
      const { error } = await supabase
        .from('household_members')
        .delete()
        .eq('household_id', householdId)
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRotateInviteToken() {
  const qc = useQueryClient();
  const { refresh } = useHousehold();
  return useMutation({
    mutationFn: async (householdId: string) => {
      const token = Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) =>
        b.toString(16).padStart(2, '0'),
      ).join('');
      const { data, error } = await supabase
        .from('households')
        .update({ invite_token: token })
        .eq('id', householdId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await refresh();
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}
