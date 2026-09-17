/**
 * Unit tests for searching WITHIN the tag filter bar.
 *
 * With ~40 tags in a household the chip bar becomes a horizontal scroll you
 * can't find anything in, so it gains its own search box.
 */
import { filterTagCounts, type TagCount } from '../tags';

const TAGS: TagCount[] = [
  { tag: 'construction', count: 8 },
  { tag: 'dewalt', count: 15 },
  { tag: 'drywall', count: 3 },
  { tag: 'used', count: 35 },
  { tag: 'cable-storage', count: 1 },
];

describe('filterTagCounts', () => {
  it('returns everything for a blank query', () => {
    expect(filterTagCounts(TAGS, '')).toEqual(TAGS);
    expect(filterTagCounts(TAGS, '   ')).toEqual(TAGS);
  });

  it('matches a prefix', () => {
    expect(filterTagCounts(TAGS, 'dry').map((t) => t.tag)).toEqual(['drywall']);
  });

  it('matches anywhere in the tag, not just the start', () => {
    expect(filterTagCounts(TAGS, 'wall').map((t) => t.tag)).toEqual(['drywall']);
    expect(filterTagCounts(TAGS, 'storage').map((t) => t.tag)).toEqual(['cable-storage']);
  });

  it('is case-insensitive', () => {
    expect(filterTagCounts(TAGS, 'DeWalt').map((t) => t.tag)).toEqual(['dewalt']);
  });

  it('ignores surrounding whitespace in the query', () => {
    expect(filterTagCounts(TAGS, '  dewalt  ').map((t) => t.tag)).toEqual(['dewalt']);
  });

  it('can match several tags at once', () => {
    expect(filterTagCounts(TAGS, 'd').map((t) => t.tag)).toEqual([
      'dewalt',
      'drywall',
      'used', // matched on the trailing 'd', not a prefix
    ]);
  });

  it('preserves the incoming order (most-used first)', () => {
    const out = filterTagCounts(TAGS, 'a');
    expect(out.map((t) => t.tag)).toEqual(['dewalt', 'drywall', 'cable-storage']);
  });

  it('returns nothing when nothing matches', () => {
    expect(filterTagCounts(TAGS, 'zzz')).toEqual([]);
  });

  it('handles an empty tag list', () => {
    expect(filterTagCounts([], 'x')).toEqual([]);
  });

  it('keeps a selected tag visible even when it does not match the query', () => {
    // Otherwise typing would silently hide a filter that is still applied.
    const out = filterTagCounts(TAGS, 'dry', ['used']);
    expect(out.map((t) => t.tag)).toEqual(['drywall', 'used']);
  });

  it('does not duplicate a selected tag that also matches', () => {
    const out = filterTagCounts(TAGS, 'dry', ['drywall']);
    expect(out.map((t) => t.tag)).toEqual(['drywall']);
  });
});
