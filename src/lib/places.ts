/**
 * Pure helpers for the place tree. Kept free of React/RN so they can be unit
 * tested directly (see __tests__/places.test.ts).
 */

/** Minimal shape needed to walk the parent chain. */
export interface PlaceNode {
  id: string;
  parent_place_id: string | null;
}

/**
 * Build an id → node lookup from a list of places.
 */
export function indexPlaces<T extends PlaceNode>(places: T[]): Map<string, T> {
  return new Map(places.map((p) => [p.id, p]));
}

/**
 * Walk up the parent chain from `descendantId` and return every ancestor id
 * (excluding the descendant itself). Stops at a place whose parent is missing
 * from the index, or at `null`. Guards against cycles in malformed data with a
 * visited set.
 */
export function ancestorIds<T extends PlaceNode>(
  descendantId: string,
  index: Map<string, T>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let cur = index.get(descendantId);
  while (cur && cur.parent_place_id && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.push(cur.parent_place_id);
    cur = index.get(cur.parent_place_id);
  }
  return out;
}

/**
 * True if moving `candidateId` into `newParentId` would create a cycle.
 * That happens when:
 *   - the candidate is the new parent itself, OR
 *   - the new parent is the candidate itself or a descendant of it
 *     (i.e. the candidate is already an ancestor of the new parent).
 *
 * This is the guard used by place-detail's "scan a place → move it in here"
 * flow.
 */
export function wouldCreateCycle<T extends PlaceNode>(
  candidateId: string,
  newParentId: string,
  index: Map<string, T>,
): boolean {
  if (candidateId === newParentId) return true;
  // Reparenting candidate into newParent is only safe if newParent is not
  // inside candidate. newParent being inside candidate <=> candidate is an
  // ancestor of newParent.
  return ancestorIds(newParentId, index).includes(candidateId);
}
