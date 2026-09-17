/** useConvertItemToPlace — give an item the storage abilities of a place, via
 *  the `convert_item_to_place` Postgres RPC.
 *
 *  This is NOT destructive any more. The RPC used to copy a few of the item's
 *  fields onto a new place and then DELETE the item, silently discarding its
 *  value, product links and extra photos. It now creates a place
 *  FACET (`places.item_id` → the item) carrying the name, description, photos,
 *  tags and location across, and leaves the item entirely intact: the thing
 *  stays an item and additionally becomes somewhere you can store things.
 *  Codes stay bound to the item. Idempotent — calling it twice returns the
 *  same facet id. */
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
    onSuccess: (_placeId, itemId) => {
      // A new place exists and the item now has a facet; refresh every view
      // that shows either side of the pair.
      qc.invalidateQueries({ queryKey: ITEMS_KEY });
      qc.invalidateQueries({ queryKey: PLACES_KEY });
      qc.invalidateQueries({ queryKey: ['place_contents'] });
      qc.invalidateQueries({ queryKey: ['place_children'] });
      qc.invalidateQueries({ queryKey: ['place_for_item', itemId] });
      qc.invalidateQueries({ queryKey: ['external_codes'] });
    },
  });
}
