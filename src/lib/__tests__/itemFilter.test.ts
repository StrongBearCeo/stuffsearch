/**
 * Unit tests for the home screen's "needs attention" filters.
 *
 * Tapping "13 not in a place" used to open the full item list, which answered
 * a different question than the one the tile asked. The tile now carries a
 * filter into the list.
 */
import { ITEM_FILTERS, isItemFilter, applyItemFilter, type FilterableItem } from '../itemFilter';

const items: FilterableItem[] = [
  { id: 'a', current_place_id: 'p1', estimated_value: 10 },
  { id: 'b', current_place_id: null, estimated_value: 5 },
  { id: 'c', current_place_id: 'p2', estimated_value: null },
  { id: 'd', current_place_id: null, estimated_value: null },
];

describe('isItemFilter', () => {
  it('accepts the known filters', () => {
    expect(isItemFilter('unplaced')).toBe(true);
    expect(isItemFilter('unvalued')).toBe(true);
  });

  it('rejects anything else, so a stray route param is ignored', () => {
    expect(isItemFilter('nonsense')).toBe(false);
    expect(isItemFilter('')).toBe(false);
    expect(isItemFilter(undefined)).toBe(false);
    expect(isItemFilter(null)).toBe(false);
  });

  it('lists exactly the filters the UI offers', () => {
    expect(ITEM_FILTERS).toEqual(['unplaced', 'unvalued']);
  });
});

describe('applyItemFilter', () => {
  it('returns everything when no filter is set', () => {
    expect(applyItemFilter(items, null).map((i) => i.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(applyItemFilter(items, undefined).map((i) => i.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('unplaced → only items with no location', () => {
    expect(applyItemFilter(items, 'unplaced').map((i) => i.id)).toEqual(['b', 'd']);
  });

  it('unvalued → only items with no value', () => {
    expect(applyItemFilter(items, 'unvalued').map((i) => i.id)).toEqual(['c', 'd']);
  });

  it('treats a zero value as VALUED — someone deliberately wrote 0', () => {
    expect(applyItemFilter([{ id: 'z', current_place_id: null, estimated_value: 0 }], 'unvalued')).toEqual([]);
  });

  it('preserves the incoming order', () => {
    const reversed = [...items].reverse();
    expect(applyItemFilter(reversed, 'unplaced').map((i) => i.id)).toEqual(['d', 'b']);
  });

  it('does not mutate the input', () => {
    const copy = [...items];
    applyItemFilter(items, 'unplaced');
    expect(items).toEqual(copy);
  });

  it('handles an empty list', () => {
    expect(applyItemFilter([], 'unplaced')).toEqual([]);
  });

  it('counts match what the home tiles advertise', () => {
    // The tile says "N not in a place"; tapping it must show exactly N rows.
    const unplacedCount = items.filter((i) => !i.current_place_id).length;
    expect(applyItemFilter(items, 'unplaced')).toHaveLength(unplacedCount);
    const unvaluedCount = items.filter((i) => i.estimated_value == null).length;
    expect(applyItemFilter(items, 'unvalued')).toHaveLength(unvaluedCount);
  });
});
