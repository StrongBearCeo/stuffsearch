/**
 * Unit tests for list multi-selection (select several items, then move them
 * all into one place in a single action).
 */
import {
  toggleSelected,
  selectAll,
  clearSelection,
  isAllSelected,
  selectedFrom,
} from '../selection';

const IDS = ['a', 'b', 'c'];

describe('toggleSelected', () => {
  it('adds an unselected id', () => {
    expect([...toggleSelected(new Set(), 'a')]).toEqual(['a']);
  });

  it('removes an already-selected id', () => {
    expect([...toggleSelected(new Set(['a', 'b']), 'a')]).toEqual(['b']);
  });

  it('returns a NEW set so React notices the change', () => {
    const before = new Set(['a']);
    const after = toggleSelected(before, 'b');
    expect(after).not.toBe(before);
    expect([...before]).toEqual(['a']);
  });
});

describe('selectAll', () => {
  it('selects every visible id', () => {
    expect([...selectAll(IDS)].sort()).toEqual(['a', 'b', 'c']);
  });

  it('handles an empty list', () => {
    expect(selectAll([]).size).toBe(0);
  });

  it('selects only what is VISIBLE, so a filter narrows the action', () => {
    // Filtering to ['b'] then "select all" must not re-select a and c.
    expect([...selectAll(['b'])]).toEqual(['b']);
  });
});

describe('clearSelection', () => {
  it('returns an empty set', () => {
    expect(clearSelection().size).toBe(0);
  });
});

describe('isAllSelected', () => {
  it('is true when every visible id is selected', () => {
    expect(isAllSelected(IDS, new Set(IDS))).toBe(true);
  });

  it('is false when some are missing', () => {
    expect(isAllSelected(IDS, new Set(['a']))).toBe(false);
  });

  it('is false for an empty list, so "Select all" is not shown as done', () => {
    expect(isAllSelected([], new Set())).toBe(false);
  });

  it('ignores selected ids that are no longer visible', () => {
    expect(isAllSelected(['a'], new Set(['a', 'gone']))).toBe(true);
  });
});

describe('selectedFrom', () => {
  const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('returns the rows whose id is selected, in list order', () => {
    expect(selectedFrom(rows, new Set(['c', 'a']), (r) => r.id)).toEqual([
      { id: 'a' },
      { id: 'c' },
    ]);
  });

  it('returns nothing for an empty selection', () => {
    expect(selectedFrom(rows, new Set(), (r) => r.id)).toEqual([]);
  });

  it('ignores selected ids with no matching row', () => {
    expect(selectedFrom(rows, new Set(['gone']), (r) => r.id)).toEqual([]);
  });
});
