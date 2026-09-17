/**
 * Unit tests for the place hierarchy view.
 *
 * The Places tab shows a flat alphabetical list, which hides the structure the
 * data already has (a box in a shelf in a room). `flattenPlaceTree` turns the
 * flat rows into an indented, depth-annotated reading order.
 */
import { buildPlaceTree, flattenPlaceTree, type TreePlace } from '../placeTree';

function place(id: string, name: string, parent: string | null = null): TreePlace {
  return { id, name, parent_place_id: parent };
}

//   Garage
//   ├─ Left shelf
//   │  └─ Loctite box
//   └─ Right shelf
//   Living room
//   └─ Cabinet
const FLAT: TreePlace[] = [
  place('garage', 'Garage'),
  place('left', 'Left shelf', 'garage'),
  place('loctite', 'Loctite box', 'left'),
  place('right', 'Right shelf', 'garage'),
  place('living', 'Living room'),
  place('cabinet', 'Cabinet', 'living'),
];

describe('buildPlaceTree', () => {
  it('nests children under their parent', () => {
    const roots = buildPlaceTree(FLAT);
    expect(roots.map((r) => r.place.id)).toEqual(['garage', 'living']);
    expect(roots[0].children.map((c) => c.place.id)).toEqual(['left', 'right']);
    expect(roots[0].children[0].children.map((c) => c.place.id)).toEqual(['loctite']);
  });

  it('sorts siblings by name at every level', () => {
    const roots = buildPlaceTree([
      place('b', 'Bravo'),
      place('a', 'Alpha'),
      place('a2', 'Zulu', 'a'),
      place('a1', 'Anvil', 'a'),
    ]);
    expect(roots.map((r) => r.place.name)).toEqual(['Alpha', 'Bravo']);
    expect(roots[0].children.map((c) => c.place.name)).toEqual(['Anvil', 'Zulu']);
  });

  it('returns an empty list for no places', () => {
    expect(buildPlaceTree([])).toEqual([]);
  });

  it('treats a place whose parent is missing as a root', () => {
    // Can happen mid-sync, or when the parent lives in another household.
    const roots = buildPlaceTree([place('orphan', 'Orphan', 'gone')]);
    expect(roots.map((r) => r.place.id)).toEqual(['orphan']);
  });

  it('does not loop forever on a cycle in malformed data', () => {
    const roots = buildPlaceTree([place('a', 'A', 'b'), place('b', 'B', 'a')]);
    // Neither can be reached from a real root; both surface rather than vanish.
    expect(roots.length).toBeGreaterThan(0);
    expect(flattenPlaceTree(roots).length).toBe(2);
  });

  it('counts every descendant, not just direct children', () => {
    const roots = buildPlaceTree(FLAT);
    const garage = roots.find((r) => r.place.id === 'garage')!;
    expect(garage.descendantCount).toBe(3); // left + loctite + right
    expect(garage.children[0].descendantCount).toBe(1); // loctite
    expect(garage.children[1].descendantCount).toBe(0);
  });
});

describe('flattenPlaceTree', () => {
  it('produces depth-first reading order with a depth on each row', () => {
    const rows = flattenPlaceTree(buildPlaceTree(FLAT));
    expect(rows.map((r) => [r.place.id, r.depth])).toEqual([
      ['garage', 0],
      ['left', 1],
      ['loctite', 2],
      ['right', 1],
      ['living', 0],
      ['cabinet', 1],
    ]);
  });

  it('marks the last child at each level so a connector can be drawn', () => {
    const rows = flattenPlaceTree(buildPlaceTree(FLAT));
    const byId = Object.fromEntries(rows.map((r) => [r.place.id, r]));
    expect(byId.left.isLast).toBe(false);
    expect(byId.right.isLast).toBe(true);
    expect(byId.loctite.isLast).toBe(true);
  });

  it('skips the children of a collapsed node but keeps the node itself', () => {
    const rows = flattenPlaceTree(buildPlaceTree(FLAT), new Set(['garage']));
    expect(rows.map((r) => r.place.id)).toEqual(['garage', 'living', 'cabinet']);
  });

  it('reports whether a row has children, so a chevron only shows when useful', () => {
    const rows = flattenPlaceTree(buildPlaceTree(FLAT));
    const byId = Object.fromEntries(rows.map((r) => [r.place.id, r]));
    expect(byId.garage.hasChildren).toBe(true);
    expect(byId.loctite.hasChildren).toBe(false);
  });

  it('handles an empty tree', () => {
    expect(flattenPlaceTree([])).toEqual([]);
  });
});
