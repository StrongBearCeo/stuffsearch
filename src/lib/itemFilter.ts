/**
 * "Needs attention" filters for the item list.
 *
 * The home screen advertises how many items still need a location or a value.
 * Tapping one of those tiles used to open the whole item list, answering a
 * different question than the tile asked — so the tile now carries a filter
 * through to the list, and the list shows exactly the rows it counted.
 */

export const ITEM_FILTERS = ['unplaced', 'unvalued'] as const;

export type ItemFilter = (typeof ITEM_FILTERS)[number];

/** Narrow an untrusted route parameter to a known filter. */
export function isItemFilter(value: unknown): value is ItemFilter {
  return typeof value === 'string' && (ITEM_FILTERS as readonly string[]).includes(value);
}

/** The item columns these filters read. */
export interface FilterableItem {
  current_place_id: string | null;
  estimated_value: number | null;
  [key: string]: unknown;
}

/**
 * Apply a filter, preserving order. A null/absent filter returns everything,
 * so the caller can pass the route param straight through.
 *
 * Note `estimated_value === 0` counts as VALUED: somebody typed a zero on
 * purpose, and hiding it under "not valued yet" would make it un-findable.
 */
export function applyItemFilter<T extends FilterableItem>(
  items: T[],
  filter: ItemFilter | null | undefined,
): T[] {
  if (!filter) return [...items];
  if (filter === 'unplaced') return items.filter((i) => !i.current_place_id);
  return items.filter((i) => i.estimated_value == null);
}
