/**
 * Unit tests for the recently-used list.
 *
 * Setting an item's location means scrolling a picker of every place in the
 * household. In practice a handful of places absorb almost every move, so the
 * picker offers those first.
 */
import { pushRecent, orderByRecent, MAX_RECENT } from '../recent';

describe('pushRecent', () => {
  it('puts a new id at the front', () => {
    expect(pushRecent([], 'a')).toEqual(['a']);
    expect(pushRecent(['a'], 'b')).toEqual(['b', 'a']);
  });

  it('promotes an id that is already in the list instead of duplicating it', () => {
    expect(pushRecent(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b']);
  });

  it('keeps the most recent first when the same id is pushed twice', () => {
    expect(pushRecent(pushRecent(['a'], 'b'), 'b')).toEqual(['b', 'a']);
  });

  it('caps the list so it cannot grow without bound', () => {
    let list: string[] = [];
    for (let i = 0; i < MAX_RECENT + 5; i++) list = pushRecent(list, `id-${i}`);
    expect(list).toHaveLength(MAX_RECENT);
    expect(list[0]).toBe(`id-${MAX_RECENT + 4}`);
  });

  it('honours an explicit cap', () => {
    expect(pushRecent(['a', 'b', 'c'], 'd', 2)).toEqual(['d', 'a']);
  });

  it('ignores a blank id', () => {
    expect(pushRecent(['a'], '')).toEqual(['a']);
    expect(pushRecent(['a'], '   ')).toEqual(['a']);
  });

  it('tolerates a missing list', () => {
    expect(pushRecent(null, 'a')).toEqual(['a']);
    expect(pushRecent(undefined, 'a')).toEqual(['a']);
  });

  it('does not mutate the input list', () => {
    const list = ['a', 'b'];
    pushRecent(list, 'c');
    expect(list).toEqual(['a', 'b']);
  });
});

describe('orderByRecent', () => {
  const places = [
    { id: 'garage', name: 'Garage' },
    { id: 'attic', name: 'Attic' },
    { id: 'shed', name: 'Shed' },
  ];

  it('lifts recently used entries to the front, in recency order', () => {
    const out = orderByRecent(places, ['shed', 'garage'], (p) => p.id);
    expect(out.map((p) => p.id)).toEqual(['shed', 'garage', 'attic']);
  });

  it('keeps the original order of everything not recently used', () => {
    const out = orderByRecent(places, ['shed'], (p) => p.id);
    expect(out.map((p) => p.id)).toEqual(['shed', 'garage', 'attic']);
  });

  it('is a no-op with no recents', () => {
    expect(orderByRecent(places, [], (p) => p.id).map((p) => p.id)).toEqual([
      'garage',
      'attic',
      'shed',
    ]);
  });

  it('ignores recent ids that no longer exist (a deleted place)', () => {
    const out = orderByRecent(places, ['deleted', 'attic'], (p) => p.id);
    expect(out.map((p) => p.id)).toEqual(['attic', 'garage', 'shed']);
  });

  it('never drops or duplicates an entry', () => {
    const out = orderByRecent(places, ['shed', 'attic', 'garage'], (p) => p.id);
    expect(out).toHaveLength(places.length);
    expect(new Set(out.map((p) => p.id)).size).toBe(places.length);
  });

  it('does not mutate the input list', () => {
    const input = [...places];
    orderByRecent(input, ['shed'], (p) => p.id);
    expect(input.map((p) => p.id)).toEqual(['garage', 'attic', 'shed']);
  });
});
