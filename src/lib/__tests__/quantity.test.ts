/**
 * Unit tests for item quantity + multi-place storage arithmetic.
 *
 * The use case: ten pencils are ONE item with quantity 10, split across
 * places — six in the desk (the primary location) and four in the drawer.
 */
import {
  DEFAULT_QUANTITY,
  MAX_QUANTITY,
  parseQuantity,
  itemQuantity,
  placedQuantity,
  remainingQuantity,
  isOverAssigned,
  quantityInPlace,
  formatQuantity,
  type PlacementLike,
} from '../quantity';

const DESK = 'place-desk';
const DRAWER = 'place-drawer';
const SHELF = 'place-shelf';

describe('parseQuantity', () => {
  it('parses a plain integer', () => {
    expect(parseQuantity('10')).toBe(10);
    expect(parseQuantity('0')).toBe(0);
  });

  it('trims whitespace and strips stray characters', () => {
    expect(parseQuantity('  7  ')).toBe(7);
    expect(parseQuantity('12 pcs')).toBe(12);
  });

  it('returns null for blank input so a cleared box does not write 0', () => {
    expect(parseQuantity('')).toBeNull();
    expect(parseQuantity('   ')).toBeNull();
    expect(parseQuantity(null)).toBeNull();
    expect(parseQuantity(undefined)).toBeNull();
  });

  it('rejects non-numeric input', () => {
    expect(parseQuantity('abc')).toBeNull();
    expect(parseQuantity('-')).toBeNull();
  });

  it('rejects negatives', () => {
    expect(parseQuantity('-3')).toBeNull();
  });

  it('rejects fractional quantities — you cannot have 2.5 pencils', () => {
    // Stripping the dot would silently record 25.
    expect(parseQuantity('2.5')).toBeNull();
    expect(parseQuantity('0.5')).toBeNull();
  });

  it('reads a comma as a thousands separator, not a decimal point', () => {
    expect(parseQuantity('1,000')).toBe(1000);
  });

  it('rejects absurd quantities', () => {
    expect(parseQuantity(String(MAX_QUANTITY))).toBe(MAX_QUANTITY);
    expect(parseQuantity(String(MAX_QUANTITY + 1))).toBeNull();
  });
});

describe('itemQuantity', () => {
  it('defaults a missing quantity to 1', () => {
    expect(itemQuantity(null)).toBe(DEFAULT_QUANTITY);
    expect(itemQuantity(undefined)).toBe(1);
  });

  it('passes a real quantity through', () => {
    expect(itemQuantity(10)).toBe(10);
    expect(itemQuantity(0)).toBe(0);
  });

  it('falls back to 1 for nonsense', () => {
    expect(itemQuantity(-5)).toBe(1);
    expect(itemQuantity(Number.NaN)).toBe(1);
  });
});

describe('placedQuantity', () => {
  const placements: PlacementLike[] = [
    { place_id: DRAWER, quantity: 4 },
    { place_id: SHELF, quantity: 2 },
  ];

  it('sums the extra placements', () => {
    expect(placedQuantity(placements)).toBe(6);
  });

  it('is 0 with no placements', () => {
    expect(placedQuantity([])).toBe(0);
    expect(placedQuantity(null)).toBe(0);
    expect(placedQuantity(undefined)).toBe(0);
  });

  it('skips rows with a missing or negative count', () => {
    expect(
      placedQuantity([
        { place_id: DRAWER, quantity: null },
        { place_id: SHELF, quantity: -1 },
        { place_id: DESK, quantity: 3 },
      ]),
    ).toBe(3);
  });
});

describe('remainingQuantity', () => {
  it('is what is left in the primary place', () => {
    expect(remainingQuantity(10, [{ place_id: DRAWER, quantity: 4 }])).toBe(6);
  });

  it('is the whole quantity when nothing is split out', () => {
    expect(remainingQuantity(10, [])).toBe(10);
  });

  it('never goes negative when the split over-claims', () => {
    expect(remainingQuantity(3, [{ place_id: DRAWER, quantity: 8 }])).toBe(0);
  });

  it('treats a missing quantity as 1', () => {
    expect(remainingQuantity(null, [])).toBe(1);
  });
});

describe('isOverAssigned', () => {
  it('is false for a valid split', () => {
    expect(isOverAssigned(10, [{ place_id: DRAWER, quantity: 4 }])).toBe(false);
  });

  it('is false when the split exactly uses everything', () => {
    expect(isOverAssigned(4, [{ place_id: DRAWER, quantity: 4 }])).toBe(false);
  });

  it('is true when more units are placed than exist', () => {
    expect(isOverAssigned(3, [{ place_id: DRAWER, quantity: 4 }])).toBe(true);
  });
});

describe('quantityInPlace', () => {
  const item = { current_place_id: DESK, quantity: 10 };
  const placements: PlacementLike[] = [{ place_id: DRAWER, quantity: 4 }];

  it('returns the placement count for an extra location', () => {
    expect(quantityInPlace(item, placements, DRAWER)).toBe(4);
  });

  it('returns the remainder for the primary location', () => {
    expect(quantityInPlace(item, placements, DESK)).toBe(6);
  });

  it('returns null for a place the item is not in', () => {
    expect(quantityInPlace(item, placements, SHELF)).toBeNull();
  });

  it('prefers an explicit placement over the primary remainder', () => {
    // The same place appearing as both primary and a placement reads as the
    // placement's number, not a double count.
    expect(quantityInPlace(item, [{ place_id: DESK, quantity: 2 }], DESK)).toBe(2);
  });

  it('handles an item with no location', () => {
    expect(quantityInPlace({ current_place_id: null, quantity: 3 }, [], DESK)).toBeNull();
  });
});

describe('formatQuantity', () => {
  it('stays quiet for a single unit', () => {
    expect(formatQuantity(1)).toBe('');
    expect(formatQuantity(null)).toBe('');
  });

  it('renders a multiplier for several', () => {
    expect(formatQuantity(10)).toBe('×10');
    expect(formatQuantity(0)).toBe('×0');
  });
});
