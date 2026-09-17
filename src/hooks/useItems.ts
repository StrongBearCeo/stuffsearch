/** Items CRUD hooks, scoped to the active household. */
import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, type Item, type ItemHistory, type TablesInsert, type TablesUpdate } from '../lib/supabase';
import { useHousehold } from '../lib/household';
import { useAuth } from '../lib/auth';
import { generateQrToken } from '../lib/qrcode';
import { rankBySearch, type SearchFields } from '../lib/search';
import { lookupColumnFor, newUuid } from '../lib/ids';
import { buildMovedNote, buildNote, type HistoryNoteKey } from '../lib/historyNote';

const KEY = ['items'] as const;

/** Resolve a place name by id, or null if id is null / not found. Used to write
 *  specific item-history notes ("Moved from X to Y") rather than bare 'moved'. */
async function placeNameById(id: string | null): Promise<string | null> {
  if (!id) return null;
  const { data, error } = await supabase.from('places').select('name').eq('id', id).maybeSingle();
  if (error || !data) return null;
  return data.name as string;
}

/** What `rankBySearch` looks at on an item. */
function itemSearchFields(item: Item): SearchFields {
  return {
    name: item.name,
    description: item.description,
    tags: item.tags,
  };
}

/**
 * All items in the active household, optionally filtered by a search string.
 *
 * The query itself is unfiltered and cached per household; filtering happens in
 * `select` via the token-scoring ranker. Server-side `ilike '%query%'` only
 * matched a contiguous substring, so "Husky tile cutter" missed "Tile cutter" —
 * see src/lib/search.ts. Ranking locally is also instant and works offline.
 */
export function useItems(search?: string) {
  const select = useCallback(
    (rows: Item[]) => rankBySearch(rows, search ?? '', itemSearchFields),
    [search],
  );
  const { activeHouseholdId } = useHousehold();
  return useQuery<Item[], Error, Item[]>({
    queryKey: [...KEY, activeHouseholdId],
    enabled: !!activeHouseholdId,
    queryFn: async () => {
      if (!activeHouseholdId) return [];
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .eq('household_id', activeHouseholdId)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    select,
  });
}

/**
 * One item by route parameter. Accepts either the uuid primary key (from a
 * list) or an app `qr_token` (from a scanned deep-link, which routes to
 * `/item/<token>`) — see src/lib/ids.ts.
 */
export function useItem(id: string | undefined) {
  return useQuery<Item | null>({
    queryKey: [...KEY, id],
    enabled: !!id,
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .eq(lookupColumnFor(id), id)
        .maybeSingle();
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
        // A CLIENT-CHOSEN primary key makes the insert idempotent. The form
        // generates one id per editing session, so a double-tapped Save or a
        // retry after a flaky network re-sends the SAME id and the second
        // insert bounces off the primary key instead of quietly creating a
        // duplicate item. Callers that don't supply one still get a fresh id.
        id: input.id ?? newUuid(),
        household_id: activeHouseholdId,
        name: input.name ?? 'Untitled',
        description: input.description,
        photo_urls: input.photo_urls ?? [],
        product_link: input.product_link,
        product_links: input.product_links ?? [],
        tags: input.tags ?? [],
        quantity: input.quantity ?? 1,
        estimated_value: input.estimated_value,
        value_currency: input.value_currency,
        value_source: input.value_source,
        value_updated_at: input.value_updated_at,
        // An app QR code is OPTIONAL: a new item starts with no code at all.
        // The user generates one, or scans an existing label, from the item
        // screen. Only an explicitly supplied token is used here.
        qr_token: input.qr_token ?? null,
        current_place_id: input.current_place_id,
        metadata: input.metadata ?? {},
        created_by: user?.id,
        last_moved_by: input.current_place_id ? user?.id : null,
      };
      const { data, error } = await supabase.from('items').insert(payload).select().single();
      if (error) throw error;
      // If placed immediately, record history with a specific place name.
      if (payload.current_place_id && data) {
        const placeName = await placeNameById(payload.current_place_id);
        await supabase.from('item_history').insert({
          item_id: data.id,
          place_id: payload.current_place_id,
          moved_by: user?.id,
          note: buildNote('created', placeName ? { to: placeName } : {}),
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
      // A renamed/retagged item shows differently inside its place too.
      qc.invalidateQueries({ queryKey: ['place_contents'] });
    },
  });
}

/**
 * Give an item an app-generated QR token. Items are created without one now
 * (codes are opt-in), so this is how the "Generate code" action on the item
 * screen mints one. No-op semantics if the item already has a token: the
 * caller checks first, so a regenerate would orphan printed labels.
 */
export function useGenerateItemCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: string) => {
      const token = generateQrToken();
      const { data, error } = await supabase
        .from('items')
        .update({ qr_token: token })
        .eq('id', itemId)
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

/**
 * Take an app QR token OFF an item.
 *
 * The counterpart to `useGenerateItemCode`: a code generated by mistake — or
 * one whose printed label has been thrown away — could previously never be
 * removed, so the item screen was stuck showing a QR nobody would ever scan.
 * Externally-printed codes are unbound separately via `useUnbindExternalCode`.
 */
export function useRemoveItemCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: string) => {
      const { data, error } = await supabase
        .from('items')
        .update({ qr_token: null })
        .eq('id', itemId)
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

/** Move an item to a place: set current_place_id + last_moved_by + history row.
 *  The history note is specific — it resolves the source (the item's previous
 *  place) and destination names and writes e.g. "moved|from=Box A|to=Kitchen".
 *  Pass `noteKey` to label a scan-initiated move distinctly (scanned_to,
 *  scanned_in, scanned_new); it defaults to 'moved' for the manual picker. */
export function useMoveItem() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      itemId,
      placeId,
      noteKey = 'moved',
    }: {
      itemId: string;
      placeId: string | null;
      noteKey?: HistoryNoteKey;
    }) => {
      // Read the item's current place BEFORE updating, so the note can say
      // where it came from.
      const { data: before } = await supabase
        .from('items')
        .select('current_place_id')
        .eq('id', itemId)
        .maybeSingle();
      const fromId = (before?.current_place_id as string | null) ?? null;

      const [fromName, toName] = await Promise.all([
        placeNameById(fromId),
        placeNameById(placeId),
      ]);

      const { error: uErr } = await supabase
        .from('items')
        .update({ current_place_id: placeId, last_moved_by: user?.id })
        .eq('id', itemId);
      if (uErr) throw uErr;

      // Build the note for the recorded event type. For 'moved' use the from/to
      // helper; for the scan variants include the destination so the history
      // reads specifically.
      const note =
        noteKey === 'moved'
          ? buildMovedNote({ from: fromName, to: toName })
          : buildNote(noteKey, toName ? { to: toName } : {});

      const { error: hErr } = await supabase.from('item_history').insert({
        item_id: itemId,
        place_id: placeId,
        moved_by: user?.id,
        note,
      });
      if (hErr) throw hErr;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: KEY });
      // Keep the item's own detail cache fresh.
      qc.invalidateQueries({ queryKey: [...KEY, vars.itemId] });
      // The item left its old place and entered a new one; we don't know the
      // old place id here, so refresh every place_contents view.
      qc.invalidateQueries({ queryKey: ['place_contents'] });
    },
  });
}

/**
 * Move SEVERAL items into one place in a single action.
 *
 * Each item still gets its own history row, because "where has this been?" is
 * the question history exists to answer and a bulk move is not a special kind
 * of move. The destination name is resolved once rather than per item.
 *
 * Failures are collected rather than thrown on the first one: moving 20 items
 * and having number 3 fail should still move the other 19, and report what
 * didn't make it.
 */
export function useBulkMoveItems() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ itemIds, placeId }: { itemIds: string[]; placeId: string | null }) => {
      const toName = await placeNameById(placeId);
      const failed: string[] = [];
      let moved = 0;

      for (const itemId of itemIds) {
        try {
          const { data: before } = await supabase
            .from('items')
            .select('current_place_id')
            .eq('id', itemId)
            .maybeSingle();
          const fromId = (before?.current_place_id as string | null) ?? null;
          if (fromId === placeId) continue; // already there — nothing to record
          const fromName = await placeNameById(fromId);

          const { error: uErr } = await supabase
            .from('items')
            .update({ current_place_id: placeId, last_moved_by: user?.id })
            .eq('id', itemId);
          if (uErr) throw uErr;

          await supabase.from('item_history').insert({
            item_id: itemId,
            place_id: placeId,
            moved_by: user?.id,
            note: buildMovedNote({ from: fromName, to: toName }),
          });
          moved += 1;
        } catch {
          failed.push(itemId);
        }
      }
      return { moved, failed };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['place_contents'] });
    },
  });
}

export function useDeleteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['place_contents'] });
    },
  });
}
