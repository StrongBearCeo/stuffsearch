/**
 * The place hierarchy, as a tree.
 *
 * Places are already nestable (`parent_place_id`), but the Places tab renders
 * them as one flat alphabetical list, which throws that structure away — you
 * can't see that the Loctite box is on the left shelf in the garage without
 * opening three screens. These helpers turn the flat rows into an indented
 * reading order the list can render directly.
 *
 * Pure and synchronous, like ./places.ts, which owns the cycle guard used when
 * REPARENTING; this module only has to survive a cycle that already exists in
 * the data (see `buildPlaceTree`).
 */

/** The minimum a place needs for the tree view. */
export interface TreePlace {
  id: string;
  name: string;
  parent_place_id: string | null;
}

export interface PlaceTreeNode<T extends TreePlace = TreePlace> {
  place: T;
  children: PlaceTreeNode<T>[];
  /** Every place nested anywhere below this one. Drives the "· 3" hint. */
  descendantCount: number;
}

/** One rendered row: the place plus where it sits in the tree. */
export interface PlaceTreeRow<T extends TreePlace = TreePlace> {
  place: T;
  /** 0 for a top-level place; each level of nesting adds one. */
  depth: number;
  /** True when this is the final sibling at its level. */
  isLast: boolean;
  hasChildren: boolean;
  descendantCount: number;
}

function byName<T extends TreePlace>(a: PlaceTreeNode<T>, b: PlaceTreeNode<T>): number {
  return a.place.name.localeCompare(b.place.name);
}

/**
 * Nest a flat list of places into roots + children, sorted by name at every
 * level.
 *
 * Two kinds of bad data are handled rather than crashed on, because both are
 * reachable: a place whose parent isn't in the list (mid-sync, or a parent in
 * another household) becomes a root, and a parent CYCLE — which the app's own
 * guards prevent but old rows might carry — is broken by treating the
 * unreachable places as roots, so they stay visible instead of disappearing
 * from the tab entirely.
 */
export function buildPlaceTree<T extends TreePlace>(places: T[]): PlaceTreeNode<T>[] {
  const nodes = new Map<string, PlaceTreeNode<T>>();
  for (const place of places) {
    nodes.set(place.id, { place, children: [], descendantCount: 0 });
  }

  /** Is `id` reachable from a real root by walking up? False inside a cycle. */
  const rooted = (id: string): boolean => {
    const seen = new Set<string>();
    let cur = nodes.get(id);
    while (cur) {
      if (seen.has(cur.place.id)) return false; // walked into a loop
      seen.add(cur.place.id);
      const parentId = cur.place.parent_place_id;
      if (!parentId) return true;
      const parent = nodes.get(parentId);
      if (!parent) return true; // parent isn't ours — treat as a root
      cur = parent;
    }
    return true;
  };

  const roots: PlaceTreeNode<T>[] = [];
  for (const node of nodes.values()) {
    const parentId = node.place.parent_place_id;
    const parent = parentId ? nodes.get(parentId) : undefined;
    if (!parent || !rooted(node.place.id)) {
      roots.push(node);
    } else {
      parent.children.push(node);
    }
  }

  // Sort every level, and total the descendants bottom-up in the same pass.
  const finish = (node: PlaceTreeNode<T>): number => {
    node.children.sort(byName);
    let total = 0;
    for (const child of node.children) total += 1 + finish(child);
    node.descendantCount = total;
    return total;
  };
  roots.sort(byName);
  for (const root of roots) finish(root);
  return roots;
}

/**
 * Depth-first reading order for a tree, one row per visible place.
 *
 * `collapsed` holds the ids whose children are hidden; the collapsed place
 * itself still renders (with `hasChildren` true) so it can be expanded again.
 */
export function flattenPlaceTree<T extends TreePlace>(
  roots: PlaceTreeNode<T>[],
  collapsed: ReadonlySet<string> = new Set(),
): PlaceTreeRow<T>[] {
  const rows: PlaceTreeRow<T>[] = [];
  const walk = (nodes: PlaceTreeNode<T>[], depth: number) => {
    nodes.forEach((node, i) => {
      rows.push({
        place: node.place,
        depth,
        isLast: i === nodes.length - 1,
        hasChildren: node.children.length > 0,
        descendantCount: node.descendantCount,
      });
      if (node.children.length > 0 && !collapsed.has(node.place.id)) {
        walk(node.children, depth + 1);
      }
    });
  };
  walk(roots, 0);
  return rows;
}
