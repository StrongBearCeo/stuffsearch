/**
 * Item quantity + multi-place storage.
 *
 * Ten identical pencils are ONE item with `quantity = 10`, not ten rows. Those
 * ten can then be split across places: `items.current_place_id` holds the
 * primary location and each extra location is an `item_placements` row with its
 * own count. This module owns the arithmetic — how many are accounted for,
 * how many are still sitting in the primary place, and whether the split adds
 * up — so the screens only render.
 */

export const DEFAULT_QUANTITY = 1;
/** Sanity cap: a household inventory, not a warehouse ledger. */
export const MAX_QUANTITY = 1_000_000;

/**
 * Parse a user-typed quantity. Blank, non-numeric, negative and fractional
 * inputs all fall back to `null` ("leave it alone"), so a half-typed value
 * never silently writes 0.
 */
export function parseQuantity(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  // A decimal point is a FRACTION, not noise: rejecting "2.5" is the only safe
  // reading. Stripping the dot would silently record 25 pencils.
  if (/\d\.\d/.test(trimmed)) return null;
  // A comma at that position is a thousands separator, so "1,000" is 1000.
  const cleaned = trimmed.replace(/,/g, '').replace(/[^0-9-]/g, '');
  if (!cleaned || !/^-?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isInteger(n) || n < 0 || n > MAX_QUANTITY) return null;
  return n;
}

/** The quantity to show: a missing/invalid stored value reads as 1. */
export function itemQuantity(quantity: number | null | undefined): number {
  if (quantity == null || !Number.isFinite(quantity) || quantity < 0) return DEFAULT_QUANTITY;
  return Math.floor(quantity);
}

/** The bits of an item_placements row this module cares about. */
export interface PlacementLike {
  place_id: string;
  quantity: number | null;
}

/** How many units are accounted for by the EXTRA placements. */
export function placedQuantity(placements: PlacementLike[] | null | undefined): number {
  let total = 0;
  for (const p of placements ?? []) {
    const q = p?.quantity;
    if (q == null || !Number.isFinite(q) || q < 0) continue;
    total += Math.floor(q);
  }
  return total;
}

/**
 * How many are left in the item's primary place — the total minus everything
 * assigned to an extra location. Never negative: an over-assigned item reports
 * 0 here and is flagged by `isOverAssigned`.
 */
export function remainingQuantity(
  total: number | null | undefined,
  placements: PlacementLike[] | null | undefined,
): number {
  return Math.max(0, itemQuantity(total) - placedQuantity(placements));
}

/** True when the extra placements claim more units than the item has. */
export function isOverAssigned(
  total: number | null | undefined,
  placements: PlacementLike[] | null | undefined,
): boolean {
  return placedQuantity(placements) > itemQuantity(total);
}

/**
 * The count to show next to an item inside a given place: its placement count
 * there, or the remainder when the place is the item's primary location.
 * Returns null when the item isn't in that place at all.
 */
export function quantityInPlace(
  item: { current_place_id: string | null; quantity?: number | null },
  placements: PlacementLike[] | null | undefined,
  placeId: string,
): number | null {
  const placement = (placements ?? []).find((p) => p.place_id === placeId);
  if (placement) return itemQuantity(placement.quantity);
  if (item.current_place_id === placeId) return remainingQuantity(item.quantity, placements);
  return null;
}

/** "×3" — or nothing at all when there's just one, to keep lists quiet. */
export function formatQuantity(quantity: number | null | undefined): string {
  const q = itemQuantity(quantity);
  return q === 1 ? '' : `×${q}`;
}
