/** Places CRUD hooks, scoped to the active household. */
import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase, type Place, type Item, type TablesInsert, type TablesUpdate } from '../lib/supabase';
import { useHousehold } from '../lib/household';
import { useAuth } from '../lib/auth';
import { generateQrToken } from '../lib/qrcode';
import { rankBySearch, type SearchFields } from '../lib/search';
import { lookupColumnFor } from '../lib/ids';

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
        tags: input.tags ?? [],
        // Codes are opt-in — see the note in useCreateItem.
        qr_token: input.qr_token ?? null,
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
