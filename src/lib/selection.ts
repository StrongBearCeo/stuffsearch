/**
 * Multi-selection for the list screens: tick several items, then move them all
 * into one place in a single action instead of opening each one in turn.
 *
 * A `Set` of ids is the state; every helper returns a NEW set so React sees a
 * changed reference and re-renders. "All" always means all *visible* rows, so
 * selecting all while a search or tag filter is applied acts on exactly what's
 * on screen — never on rows the user can't see.
 */

export function toggleSelected(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Select every currently visible id. */
export function selectAll(visibleIds: string[]): Set<string> {
  return new Set(visibleIds);
}

export function clearSelection(): Set<string> {
  return new Set();
}

/**
 * True when every visible row is selected. An empty list is NOT "all
 * selected" — otherwise the button would read as already done with nothing
 * to act on.
 */
export function isAllSelected(visibleIds: string[], selected: ReadonlySet<string>): boolean {
  if (visibleIds.length === 0) return false;
  return visibleIds.every((id) => selected.has(id));
}

/**
 * The selected rows, in the list's own order (not selection order), skipping
 * ids with no matching row — a row can vanish under the selection when a
 * refetch lands.
 */
export function selectedFrom<T>(
  rows: T[],
  selected: ReadonlySet<string>,
  idOf: (row: T) => string,
): T[] {
  if (selected.size === 0) return [];
  return rows.filter((row) => selected.has(idOf(row)));
}
