/** Places CRUD hooks, scoped to the active household. */
import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, type Place, type Item, type TablesInsert, type TablesUpdate } from '../lib/supabase';
import { useHousehold } from '../lib/household';
import { useAuth } from '../lib/auth';
import { generateQrToken } from '../lib/qrcode';
import { rankBySearch, type SearchFields } from '../lib/search';
import { lookupColumnFor, newUuid } from '../lib/ids';

const KEY = ['places'] as const;

/** What `rankBySearch` looks at on a place. */
function placeSearchFields(place: Place): SearchFields {
  return { name: place.name, description: place.description, tags: place.tags };
}

/**
 * All places in the active household, optionally filtered. Like `useItems`,
 * the fetch is unfiltered and the search runs locally through the relevance
 * ranker so partial / extra-word queries still match.
 */
export function usePlaces(search?: string) {
  const select = useCallback(
    (rows: Place[]) => rankBySearch(rows, search ?? '', placeSearchFields),
    [search],
  );
  const { activeHouseholdId } = useHousehold();
  return useQuery<Place[], Error, Place[]>({
    queryKey: [...KEY, activeHouseholdId],
    enabled: !!activeHouseholdId,
    queryFn: async (): Promise<Place[]> => {
      if (!activeHouseholdId) return [];
      const { data, error } = await supabase
        .from('places')
        .select('*')
        .eq('household_id', activeHouseholdId)
        .order('name', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    select,
  });
}

/** One place by route parameter: uuid primary key OR app `qr_token`. See useItem. */
export function usePlace(id: string | undefined) {
  return useQuery<Place | null>({
    queryKey: [...KEY, id],
    enabled: !!id,
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('places')
        .select('*')
        .eq(lookupColumnFor(id), id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Items located in a place.
 *
 * Two sources, because an item can now live in several places at once: its
 * PRIMARY location (`items.current_place_id`) and any number of extra
 * `item_placements` rows. A place's contents is the union — otherwise "4 of
 * the 10 pencils are in the drawer" would be invisible from the drawer.
 */
export function usePlaceContents(placeId: string | undefined) {
  const { activeHouseholdId } = useHousehold();
  return useQuery<Item[]>({
    queryKey: ['place_contents', placeId],
    enabled: !!placeId && !!activeHouseholdId,
    queryFn: async (): Promise<Item[]> => {
      if (!placeId) return [];
      const [primary, placements] = await Promise.all([
        supabase.from('items').select('*').eq('current_place_id', placeId),
        supabase.from('item_placements').select('item_id').eq('place_id', placeId),
      ]);
      if (primary.error) throw primary.error;
      if (placements.error) throw placements.error;

      const rows: Item[] = primary.data ?? [];
      const have = new Set(rows.map((i) => i.id));
      const extraIds = (placements.data ?? [])
        .map((p) => p.item_id as string)
        .filter((id) => !have.has(id));

      if (extraIds.length > 0) {
        const { data: extras, error } = await supabase
          .from('items')
          .select('*')
          .in('id', extraIds);
        if (error) throw error;
        rows.push(...(extras ?? []));
      }
      return rows.sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}

/**
 * The place facet of an item, if it has one — i.e. the item is ALSO a place
 * you can store things in (a toolbox, a labelled crate). Null for an ordinary
 * item. See `convert_item_to_place`, which creates the facet without
 * destroying the item.
 */
export function usePlaceForItem(itemId: string | undefined) {
  return useQuery<Place | null>({
    queryKey: ['place_for_item', itemId],
    enabled: !!itemId,
    queryFn: async () => {
      if (!itemId) return null;
      const { data, error } = await supabase
        .from('places')
        .select('*')
        .eq('item_id', itemId)
        .maybeSingle();
      if (error) throw error;
      return data;
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

/**
 * Create a place.
 *
 * `alsoItem` makes it a place that IS an item too: a valuable toolbox is both
 * a thing worth £200 and a container things live in. That creates the item
 * first and links the place to it (`places.item_id`), after which a database
 * trigger keeps the pair's name / description / tags / photos / location in
 * sync from the item side — so there is exactly one source of truth.
 *
 * A plain shelf or room passes `alsoItem: false` and gets an ordinary place
 * with no item behind it.
 */
export function useCreatePlace() {
  const qc = useQueryClient();
  const { activeHouseholdId } = useHousehold();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (
      input: Partial<TablesInsert<'places'>> & { alsoItem?: boolean },
    ) => {
      if (!activeHouseholdId) throw new Error('No active household.');

      let itemId: string | null = input.item_id ?? null;
      if (input.alsoItem && !itemId) {
        const { data: item, error: itemErr } = await supabase
          .from('items')
          .insert({
            id: newUuid(),
            household_id: activeHouseholdId,
            name: input.name ?? 'Untitled',
            description: input.description,
            photo_urls: input.photo_urls ?? [],
            tags: input.tags ?? [],
            current_place_id: input.parent_place_id ?? null,
            created_by: user?.id,
          })
          .select()
          .single();
        if (itemErr) throw itemErr;
        itemId = item.id;
      }

      const payload: TablesInsert<'places'> = {
        household_id: activeHouseholdId,
        name: input.name ?? 'Untitled',
        description: input.description,
        photo_url: input.photo_url,
        photo_urls: input.photo_urls ?? [],
        parent_place_id: input.parent_place_id,
        tags: input.tags ?? [],
        item_id: itemId,
        // Codes are opt-in — see the note in useCreateItem.
        qr_token: input.qr_token ?? null,
        created_by: user?.id,
      };
      const { data, error } = await supabase.from('places').insert(payload).select().single();
      if (error) {
        // Don't strand a half-made pair: if the place insert fails, the item we
        // just created for it has no reason to exist.
        if (itemId && !input.item_id) {
          await supabase.from('items').delete().eq('id', itemId);
        }
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['place_children'] });
    },
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
      // A place backed by an item shows that item's fields; keep both fresh.
      if (data.item_id) {
        qc.invalidateQueries({ queryKey: ['items'] });
        qc.invalidateQueries({ queryKey: ['place_for_item', data.item_id] });
      }
    },
  });
}

/**
 * Take the app QR token off a place. See `useRemoveItemCode` — a generated
 * code was previously permanent, which left the screen advertising a QR the
 * user had no intention of printing.
 */
export function useRemovePlaceCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (placeId: string) => {
      const { data, error } = await supabase
        .from('places')
        .update({ qr_token: null })
        .eq('id', placeId)
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

/** Mint an app QR token for a place that doesn't have one. See useGenerateItemCode. */
export function useGeneratePlaceCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (placeId: string) => {
      const token = generateQrToken();
      const { data, error } = await supabase
        .from('places')
        .update({ qr_token: token })
        .eq('id', placeId)
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

export function useDeletePlace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('places').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['place_children'] });
      qc.invalidateQueries({ queryKey: ['place_contents'] });
    },
  });
}
