/** useConvertItemToPlace — atomically convert an item into a place via the
 *  `convert_item_to_place` Postgres RPC (one transaction, no partial failure).
 *
 *  The RPC carries over the item's name, description, first photo, household,
 *  and location (item.current_place_id → place.parent_place_id); re-points all
 *  its bound external_codes at the new place; and deletes the item (history
 *  rows cascade). Returns the new place id so the caller can navigate to it. */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

const ITEMS_KEY = ['items'] as const;
const PLACES_KEY = ['places'] as const;

export function useConvertItemToPlace() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (itemId: string): Promise<string> => {
      if (!user) throw new Error('Sign in first.');
      const { data, error } = await supabase.rpc('convert_item_to_place', {
        _item_id: itemId,
        _user_id: user.id,
      });
      if (error) throw error;
      // RPC returns the new place id (a uuid string).
      return data as string;
    },
    onSuccess: () => {
      // The item is gone and a new place exists; refresh every affected view.
      qc.invalidateQueries({ queryKey: ITEMS_KEY });
      qc.invalidateQueries({ queryKey: PLACES_KEY });
      qc.invalidateQueries({ queryKey: ['place_contents'] });
      qc.invalidateQueries({ queryKey: ['external_codes'] });
    },
  });
}
