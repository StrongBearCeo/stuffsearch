/**
 * "Recently used" ordering.
 *
 * Setting an item's location meant scrolling a picker containing every place
 * in the household, in alphabetical order, every time — even though a handful
 * of places absorb almost every move. These helpers keep a short most-recent
 * -first list of ids and lift those entries to the top of a picker.
 *
 * Pure: persistence lives in the hook that calls this (AsyncStorage), so the
 * ordering rules stay unit-testable.
 */

/** How many ids we remember. Long enough to be useful, short enough to scan. */
export const MAX_RECENT = 8;

/**
 * Put `id` at the front of the list, removing any earlier occurrence so an id
 * never appears twice, and trimming to `max`.
 */
export function pushRecent(
  list: string[] | null | undefined,
  id: string,
  max: number = MAX_RECENT,
): string[] {
  const clean = (id ?? '').trim();
  const current = list ?? [];
  if (!clean) return [...current];
  return [clean, ...current.filter((x) => x !== clean)].slice(0, Math.max(1, max));
}

/**
 * Reorder `entities` so the recently-used ones lead, in recency order, with
 * everything else following in its original order. Nothing is added or
 * dropped — a recent id with no matching entity (a deleted place) is skipped.
 */
export function orderByRecent<T>(
  entities: T[],
  recent: string[] | null | undefined,
  idOf: (entity: T) => string,
): T[] {
  const ids = recent ?? [];
  if (ids.length === 0) return [...entities];
  const byId = new Map(entities.map((e) => [idOf(e), e]));
  const lifted: T[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const entity = byId.get(id);
    if (!entity || seen.has(id)) continue;
    seen.add(id);
    lifted.push(entity);
  }
  return [...lifted, ...entities.filter((e) => !seen.has(idOf(e)))];
}
