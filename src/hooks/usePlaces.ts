/** Places CRUD hooks, scoped to the active household. */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, type Place, type Item, type TablesInsert, type TablesUpdate } from '../lib/supabase';
import { useHousehold } from '../lib/household';
import { useAuth } from '../lib/auth';
import { generateQrToken } from '../lib/qrcode';

const KEY = ['places'] as const;

export function usePlaces(search?: string) {
  const { activeHouseholdId } = useHousehold();
  return useQuery<Place[]>({
    queryKey: [...KEY, activeHouseholdId, search ?? ''],
    enabled: !!activeHouseholdId,
    queryFn: async (): Promise<Place[]> => {
      if (!activeHouseholdId) return [];
      let q = supabase.from('places').select('*').eq('household_id', activeHouseholdId);
      if (search && search.trim()) {
        q = q.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
      }
      const { data, error } = await q.order('name', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePlace(id: string | undefined) {
  return useQuery<Place | null>({
    queryKey: [...KEY, id],
    enabled: !!id,
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase.from('places').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Items currently located in a place. */
export function usePlaceContents(placeId: string | undefined) {
  const { activeHouseholdId } = useHousehold();
  return useQuery<Item[]>({
    queryKey: ['place_contents', placeId],
    enabled: !!placeId && !!activeHouseholdId,
    queryFn: async (): Promise<Item[]> => {
      if (!placeId) return [];
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .eq('current_place_id', placeId)
        .order('name', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Places nested directly inside a place (parent_place_id = placeId). */
export function usePlaceChildren(placeId: string | undefined) {
  const { activeHouseholdId } = useHousehold();
  return useQuery<Place[]>({
    queryKey: ['place_children', placeId],
    enabled: !!placeId && !!activeHouseholdId,
    queryFn: async (): Promise<Place[]> => {
      if (!placeId) return [];
      const { data, error } = await supabase
        .from('places')
        .select('*')
        .eq('parent_place_id', placeId)
        .order('name', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreatePlace() {
  const qc = useQueryClient();
  const { activeHouseholdId } = useHousehold();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<TablesInsert<'places'>>) => {
      if (!activeHouseholdId) throw new Error('No active household.');
      const payload: TablesInsert<'places'> = {
        household_id: activeHouseholdId,
        name: input.name ?? 'Untitled',
        description: input.description,
        photo_url: input.photo_url,
        parent_place_id: input.parent_place_id,
        qr_token: input.qr_token ?? generateQrToken(),
        created_by: user?.id,
      };
      const { data, error } = await supabase.from('places').insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdatePlace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<'places'> }) => {
      const { data, error } = await supabase
        .from('places')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: [...KEY, data.id] });
      // Reparenting affects both the old and new parent's child lists.
      qc.invalidateQueries({ queryKey: ['place_children'] });
      qc.invalidateQueries({ queryKey: ['place_contents'] });
    },
  });
}

export function useDeletePlace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('places').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
