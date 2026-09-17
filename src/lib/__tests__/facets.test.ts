/**
 * Unit tests for item↔place facet resolution.
 *
 * A toolbox is an item AND a place. Scanning its label from inside another
 * item ("set my location") has to work — before, the scan was rejected with
 * "you can't store an item inside another item".
 */
import { scanTargetPlaceId, needsFacetLookup } from '../facets';

describe('scanTargetPlaceId', () => {
  it('returns the place itself for a place code', () => {
    expect(scanTargetPlaceId({ entity_type: 'place', entity_id: 'p1' }, null)).toBe('p1');
  });

  it('ignores a facet id when the code already points at a place', () => {
    expect(scanTargetPlaceId({ entity_type: 'place', entity_id: 'p1' }, 'other')).toBe('p1');
  });

  it('returns the facet for an item that is ALSO a place', () => {
    expect(scanTargetPlaceId({ entity_type: 'item', entity_id: 'i1' }, 'facet-1')).toBe('facet-1');
  });

  it('returns null for an ordinary item — nothing can be stored inside it', () => {
    expect(scanTargetPlaceId({ entity_type: 'item', entity_id: 'i1' }, null)).toBeNull();
    expect(scanTargetPlaceId({ entity_type: 'item', entity_id: 'i1' }, undefined)).toBeNull();
  });

  it('returns null for no match at all', () => {
    expect(scanTargetPlaceId(null, 'facet-1')).toBeNull();
    expect(scanTargetPlaceId(undefined, null)).toBeNull();
  });
});

describe('needsFacetLookup', () => {
  it('is true only for an item match', () => {
    expect(needsFacetLookup({ entity_type: 'item', entity_id: 'i1' })).toBe(true);
  });

  it('is false for a place match — the answer is already known', () => {
    expect(needsFacetLookup({ entity_type: 'place', entity_id: 'p1' })).toBe(false);
  });

  it('is false with nothing to look up', () => {
    expect(needsFacetLookup(null)).toBe(false);
    expect(needsFacetLookup(undefined)).toBe(false);
  });
});
