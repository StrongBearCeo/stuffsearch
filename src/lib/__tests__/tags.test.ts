import {
  MAX_TAG_LENGTH,
  normalizeTag,
  parseTagsInput,
  addTag,
  removeTag,
  collectTags,
  matchesTags,
} from '../tags';

describe('normalizeTag', () => {
  it('lowercases, trims and collapses inner whitespace', () => {
    expect(normalizeTag('  Return  ')).toBe('return');
    expect(normalizeTag('To   Return')).toBe('to return');
  });

  it('strips a leading hash', () => {
    expect(normalizeTag('#return')).toBe('return');
    expect(normalizeTag('##return')).toBe('return');
  });

  it('rejects empty input', () => {
    expect(normalizeTag('')).toBeNull();
    expect(normalizeTag('   ')).toBeNull();
    expect(normalizeTag('#')).toBeNull();
    expect(normalizeTag(null)).toBeNull();
  });

  it('truncates to the max length', () => {
    const long = 'a'.repeat(MAX_TAG_LENGTH + 10);
    expect(normalizeTag(long)).toHaveLength(MAX_TAG_LENGTH);
  });

  it('keeps non-latin scripts intact', () => {
    expect(normalizeTag(' Đồ Điện ')).toBe('đồ điện');
  });
});

describe('parseTagsInput', () => {
  it('splits on commas and newlines', () => {
    expect(parseTagsInput('return, fragile\nwinter')).toEqual(['return', 'fragile', 'winter']);
  });

  it('drops blanks and duplicates, preserving first-seen order', () => {
    expect(parseTagsInput('a,, b , A ,b')).toEqual(['a', 'b']);
  });

  it('returns an empty array for empty input', () => {
    expect(parseTagsInput('')).toEqual([]);
    expect(parseTagsInput(null)).toEqual([]);
  });
});

describe('addTag', () => {
  it('appends a normalized tag', () => {
    expect(addTag(['a'], ' B ')).toEqual(['a', 'b']);
  });

  it('is a no-op for a duplicate or invalid tag', () => {
    expect(addTag(['a'], 'A')).toEqual(['a']);
    expect(addTag(['a'], '  ')).toEqual(['a']);
  });

  it('accepts a comma-separated burst as several tags', () => {
    expect(addTag([], 'a, b')).toEqual(['a', 'b']);
  });
});

describe('removeTag', () => {
  it('removes by normalized value', () => {
    expect(removeTag(['a', 'b'], 'A')).toEqual(['b']);
  });

  it('leaves the list alone when absent', () => {
    expect(removeTag(['a'], 'z')).toEqual(['a']);
  });
});

describe('collectTags', () => {
  it('counts tag usage across entities, most used first', () => {
    expect(collectTags([{ tags: ['a', 'b'] }, { tags: ['b'] }, { tags: null }])).toEqual([
      { tag: 'b', count: 2 },
      { tag: 'a', count: 1 },
    ]);
  });

  it('breaks count ties alphabetically', () => {
    expect(collectTags([{ tags: ['z', 'a'] }])).toEqual([
      { tag: 'a', count: 1 },
      { tag: 'z', count: 1 },
    ]);
  });

  it('handles an empty input list', () => {
    expect(collectTags([])).toEqual([]);
  });
});

describe('matchesTags', () => {
  it('matches everything when nothing is selected', () => {
    expect(matchesTags(['a'], [])).toBe(true);
    expect(matchesTags(null, [])).toBe(true);
  });

  it('requires every selected tag to be present (AND)', () => {
    expect(matchesTags(['a', 'b'], ['a'])).toBe(true);
    expect(matchesTags(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(matchesTags(['a'], ['a', 'b'])).toBe(false);
    expect(matchesTags(null, ['a'])).toBe(false);
  });

  it('compares case-insensitively', () => {
    expect(matchesTags(['Return'], ['return'])).toBe(true);
  });
});
