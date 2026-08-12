/**
 * Unit tests for the place-tree helpers in places.ts.
 * Covers ancestor walking and the cycle guard used by place-detail's
 * "scan a place → move it in here" flow.
 */
import {
  indexPlaces,
  ancestorIds,
  wouldCreateCycle,
  type PlaceNode,
} from '../places';

function node(id: string, parent: string | null = null): PlaceNode {
  return { id, parent_place_id: parent };
}

// Tree used across tests:
//   root
//   ├─ room
//   │  ├─ shelf
//   │  └─ boxA
//   └─ boxB
//       └─ boxC   (boxC lives inside boxB)
const TREE: PlaceNode[] = [
  node('root'),
  node('room', 'root'),
  node('shelf', 'room'),
  node('boxA', 'room'),
  node('boxB', 'root'),
  node('boxC', 'boxB'),
];

describe('indexPlaces', () => {
  it('builds an id → node map', () => {
    const idx = indexPlaces(TREE);
    expect(idx.size).toBe(TREE.length);
    expect(idx.get('room')?.parent_place_id).toBe('root');
  });

  it('returns an empty map for an empty list', () => {
    expect(indexPlaces([]).size).toBe(0);
  });
});

describe('ancestorIds', () => {
  it('walks the full parent chain to the root', () => {
    const idx = indexPlaces(TREE);
    // boxC → boxB → root
    expect(ancestorIds('boxC', idx)).toEqual(['boxB', 'root']);
  });

  it('returns [] for a top-level place', () => {
    const idx = indexPlaces(TREE);
    expect(ancestorIds('root', idx)).toEqual([]);
  });

  it('returns [] for an unknown id', () => {
    const idx = indexPlaces(TREE);
    expect(ancestorIds('does-not-exist', idx)).toEqual([]);
  });

  it('does not loop forever on a malformed cycle', () => {
    // a → b → a (corrupt data). Must terminate, not recurse.
    const cyclic: PlaceNode[] = [node('a', 'b'), node('b', 'a')];
    const idx = indexPlaces(cyclic);
    expect(ancestorIds('a', idx)).toEqual(['b', 'a']);
  });
});

describe('wouldCreateCycle', () => {
  const idx = indexPlaces(TREE);

  it('flags moving a place into itself', () => {
    expect(wouldCreateCycle('room', 'room', idx)).toBe(true);
  });

  it('flags moving an ancestor into its own descendant (creates a loop)', () => {
    // root is an ancestor of boxC; moving root into boxC would orphan the tree.
    expect(wouldCreateCycle('root', 'boxC', idx)).toBe(true);
    expect(wouldCreateCycle('room', 'shelf', idx)).toBe(true); // room owns shelf
    expect(wouldCreateCycle('boxB', 'boxC', idx)).toBe(true); // boxB owns boxC
  });

  it('allows moving a descendant into an ancestor (just moves it up)', () => {
    // boxC into root: boxC is not an ancestor of root → safe.
    expect(wouldCreateCycle('boxC', 'root', idx)).toBe(false);
  });

  it('allows moving a sibling into a sibling', () => {
    // shelf into boxA: neither is an ancestor of the other → safe.
    expect(wouldCreateCycle('shelf', 'boxA', idx)).toBe(false);
  });

  it('allows moving an unrelated branch in', () => {
    // boxB (under root) into room (under root): safe.
    expect(wouldCreateCycle('boxB', 'room', idx)).toBe(false);
  });

  it('handles an unknown candidate id (treated as a new place → safe)', () => {
    expect(wouldCreateCycle('brand-new', 'room', idx)).toBe(false);
  });
});
