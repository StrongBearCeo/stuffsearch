/**
 * Item ↔ place "facets".
 *
 * A thing can be both: a labelled toolbox is an item worth money AND a place
 * other things live in. That's modelled as an `items` row plus a `places` row
 * whose `item_id` points at it (see migration 0010) — not as a conversion that
 * throws the item away.
 *
 * The consequence for scanning: a code bound to such an item must still work
 * as a LOCATION. `scanTargetPlaceId` is the pure decision — given what the
 * scan resolved to and whether the matched item has a place facet, which place
 * (if any) should be used.
 */

/** The bit of a resolved code this module needs. */
export interface ScanMatch {
  entity_type: 'item' | 'place';
  entity_id: string;
}

/**
 * The place a scanned code points at, or null when it points at nothing that
 * can hold things.
 *
 * - a place code → that place;
 * - an item code where the item is also a place → its place facet;
 * - an item code for an ordinary item → null (the caller reports "scan a
 *   place instead").
 *
 * `facetPlaceId` is the result of looking up `places.item_id = entity_id`;
 * pass null when there is no facet or the lookup wasn't needed.
 */
export function scanTargetPlaceId(
  match: ScanMatch | null | undefined,
  facetPlaceId: string | null | undefined,
): string | null {
  if (!match) return null;
  if (match.entity_type === 'place') return match.entity_id;
  return facetPlaceId ?? null;
}

/** True when a scan needs a facet lookup before it can be judged. */
export function needsFacetLookup(match: ScanMatch | null | undefined): boolean {
  return match?.entity_type === 'item';
}
