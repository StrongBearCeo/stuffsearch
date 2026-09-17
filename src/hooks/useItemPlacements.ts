/**
 * useItemPlacements — the EXTRA places an item is stored in.
 *
 * Ten pencils are one item with `quantity = 10`. `items.current_place_id` is
 * still the primary location (it drives history, search and the location card);
 * each additional location is an `item_placements` row carrying its own count.
 * The arithmetic — what's left in the primary place, whether the split
 * over-claims — lives in src/lib/quantity.ts.
 *
 * Cache note (see AGENTS.md): adding or removing a placement changes what a
 * place contains, so every mutation invalidates the whole `place_contents`
 * family — the old place id isn't known at the call site.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, type Tables } from '../lib/supabase';
import { useAuth } from '../lib/auth';

export type ItemPlacement = Tables<'item_placements'>;

const KEY = ['item_placements'] as const;

/** Every extra placement of an item, oldest first. */
export function useItemPlacements(itemId: string | undefined) {
  return useQuery<ItemPlacement[]>({
    queryKey: [...KEY, itemId],
    enabled: !!itemId,
    queryFn: async (): Promise<ItemPlacement[]> => {
      if (!itemId) return [];
      const { data, error } = await supabase
        .from('item_placements')
        .select('*')
        .eq('item_id', itemId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Every placement pointing INTO a place — used to list its contents. */
export function usePlacementsForPlace(placeId: string | undefined) {
  return useQuery<ItemPlacement[]>({
    queryKey: ['place_placements', placeId],
    enabled: !!placeId,
    queryFn: async (): Promise<ItemPlacement[]> => {
      if (!placeId) return [];
      const { data, error } = await supabase
        .from('item_placements')
        .select('*')
        .eq('place_id', placeId);
      if (error) throw error;
      return data ?? [];
    },
  });
}

function invalidatePlacement(qc: ReturnType<typeof useQueryClient>, itemId: string) {
  qc.invalidateQueries({ queryKey: [...KEY, itemId] });
  qc.invalidateQueries({ queryKey: ['place_placements'] });
  qc.invalidateQueries({ queryKey: ['place_contents'] });
  qc.invalidateQueries({ queryKey: ['items'] });
}

/**
 * Add a place to an item, or bump the count if it's already there.
 *
 * Upsert rather than insert: `item_placements` is unique on (item_id,
 * place_id), so picking the same place twice must read as "make it 5", not as
 * a 23505 the user has to decode.
 */
export function useAddPlacement() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      itemId,
      placeId,
      quantity,
      note,
    }: {
      itemId: string;
      placeId: string;
      quantity: number;
      note?: string | null;
    }) => {
      const { data, error } = await supabase
        .from('item_placements')
        .upsert(
          {
            item_id: itemId,
            place_id: placeId,
            quantity,
            note: note ?? null,
            created_by: user?.id,
          },
          { onConflict: 'item_id,place_id' },
        )
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => invalidatePlacement(qc, vars.itemId),
  });
}

export function useUpdatePlacement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      itemId: _itemId,
      quantity,
      note,
    }: {
      id: string;
      itemId: string;
      quantity?: number;
      note?: string | null;
    }) => {
      const { data, error } = await supabase
        .from('item_placements')
        .update({
          ...(quantity == null ? {} : { quantity }),
          ...(note === undefined ? {} : { note }),
        })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => invalidatePlacement(qc, vars.itemId),
  });
}

export function useRemovePlacement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, itemId: _itemId }: { id: string; itemId: string }) => {
      const { error } = await supabase.from('item_placements').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => invalidatePlacement(qc, vars.itemId),
  });
}
