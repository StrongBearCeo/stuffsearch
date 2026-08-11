/** Items CRUD hooks, scoped to the active household. */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, type Item, type ItemHistory, type TablesInsert, type TablesUpdate } from '../lib/supabase';
import { useHousehold } from '../lib/household';
import { useAuth } from '../lib/auth';
import { generateQrToken } from '../lib/qrcode';

const KEY = ['items'] as const;

export function useItems(search?: string) {
  const { activeHouseholdId } = useHousehold();
  return useQuery<Item[]>({
    queryKey: [...KEY, activeHouseholdId, search ?? ''],
    enabled: !!activeHouseholdId,
    queryFn: async () => {
      if (!activeHouseholdId) return [];
      let q = supabase.from('items').select('*').eq('household_id', activeHouseholdId);
      if (search && search.trim()) {
        q = q.or(`name.ilike.%${search}%,description.ilike.%${search}%,category.ilike.%${search}%`);
      }
      const { data, error } = await q.order('updated_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useItem(id: string | undefined) {
  return useQuery<Item | null>({
    queryKey: [...KEY, id],
    enabled: !!id,
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase.from('items').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useItemHistory(itemId: string | undefined) {
  return useQuery<ItemHistory[]>({
    queryKey: ['item_history', itemId],
    enabled: !!itemId,
    queryFn: async (): Promise<ItemHistory[]> => {
      if (!itemId) return [];
      const { data, error } = await supabase
        .from('item_history')
        .select('*')
        .eq('item_id', itemId)
        .order('moved_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateItem() {
  const qc = useQueryClient();
  const { activeHouseholdId } = useHousehold();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: Partial<TablesInsert<'items'>>) => {
      if (!activeHouseholdId) throw new Error('No active household.');
      const payload: TablesInsert<'items'> = {
        household_id: activeHouseholdId,
        name: input.name ?? 'Untitled',
        description: input.description,
        category: input.category,
        photo_urls: input.photo_urls ?? [],
        product_link: input.product_link,
        qr_token: input.qr_token ?? generateQrToken(),
        current_place_id: input.current_place_id,
        metadata: input.metadata ?? {},
        created_by: user?.id,
        last_moved_by: input.current_place_id ? user?.id : null,
      };
      const { data, error } = await supabase.from('items').insert(payload).select().single();
      if (error) throw error;
      // If placed immediately, record history.
      if (payload.current_place_id && data) {
        await supabase.from('item_history').insert({
          item_id: data.id,
          place_id: payload.current_place_id,
          moved_by: user?.id,
          note: 'created here',
        });
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useUpdateItem() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: TablesUpdate<'items'> }) => {
      const { data, error } = await supabase
        .from('items')
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
    },
  });
}

/** Move an item to a place: set current_place_id + last_moved_by + history row. */
export function useMoveItem() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ itemId, placeId, note }: { itemId: string; placeId: string | null; note?: string }) => {
      const { error: uErr } = await supabase
        .from('items')
        .update({ current_place_id: placeId, last_moved_by: user?.id })
        .eq('id', itemId);
      if (uErr) throw uErr;
      const { error: hErr } = await supabase.from('item_history').insert({
        item_id: itemId,
        place_id: placeId,
        moved_by: user?.id,
        note: note ?? 'moved',
      });
      if (hErr) throw hErr;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
