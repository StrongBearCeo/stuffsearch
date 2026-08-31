import {
  normalizeLink,
  linkKey,
  mergeLinks,
  itemLinks,
  primaryLink,
  linkColumns,
} from '../links';

describe('normalizeLink', () => {
  it('adds https:// to a bare domain', () => {
    expect(normalizeLink('example.com/x')).toBe('https://example.com/x');
  });

  it('keeps an existing scheme', () => {
    expect(normalizeLink('http://example.com')).toBe('http://example.com');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeLink('  https://example.com  ')).toBe('https://example.com');
  });

  it('returns null for empty input', () => {
    expect(normalizeLink('')).toBeNull();
    expect(normalizeLink('   ')).toBeNull();
    expect(normalizeLink(null)).toBeNull();
    expect(normalizeLink(undefined)).toBeNull();
  });
});

describe('linkKey', () => {
  it('ignores scheme, www and a trailing slash', () => {
    expect(linkKey('https://www.example.com/a/')).toBe(linkKey('http://example.com/a'));
  });

  it('lowercases the host but not the path', () => {
    expect(linkKey('https://Example.COM/Path')).toBe('example.com/Path');
  });

  it('keeps the query string (different products share a path)', () => {
    expect(linkKey('https://x.com/p?id=1')).not.toBe(linkKey('https://x.com/p?id=2'));
  });
});

describe('mergeLinks', () => {
  it('appends new links after the existing ones', () => {
    expect(mergeLinks(['https://a.com'], ['https://b.com'])).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });

  it('never drops or reorders an existing link', () => {
    expect(mergeLinks(['https://a.com', 'https://b.com'], ['https://b.com'])).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
  });

  it('deduplicates equivalent URLs', () => {
    expect(mergeLinks(['https://www.a.com/x/'], ['http://a.com/x'])).toEqual([
      'https://www.a.com/x/',
    ]);
  });

  it('normalizes and skips blanks in the incoming list', () => {
    expect(mergeLinks([], ['a.com', '', '   '])).toEqual(['https://a.com']);
  });

  it('deduplicates within the incoming list too', () => {
    expect(mergeLinks([], ['a.com', 'https://a.com'])).toEqual(['https://a.com']);
  });

  it('handles null/undefined inputs', () => {
    expect(mergeLinks(null, null)).toEqual([]);
    expect(mergeLinks(undefined, ['a.com'])).toEqual(['https://a.com']);
  });
});

describe('itemLinks', () => {
  it('unions the legacy scalar column with the array, legacy first', () => {
    expect(
      itemLinks({ product_link: 'https://legacy.com', product_links: ['https://new.com'] }),
    ).toEqual(['https://legacy.com', 'https://new.com']);
  });

  it('does not duplicate when the legacy link is already in the array', () => {
    expect(
      itemLinks({ product_link: 'https://a.com', product_links: ['https://www.a.com/'] }),
    ).toEqual(['https://a.com']);
  });

  it('copes with either side missing', () => {
    expect(itemLinks({ product_link: null, product_links: null })).toEqual([]);
    expect(itemLinks({ product_link: 'a.com', product_links: [] })).toEqual(['https://a.com']);
  });
});

describe('primaryLink', () => {
  it('returns the first link, or null when there are none', () => {
    expect(primaryLink(['https://a.com', 'https://b.com'])).toBe('https://a.com');
    expect(primaryLink([])).toBeNull();
  });
});

describe('linkColumns', () => {
  it('mirrors the first link into the legacy scalar column', () => {
    expect(linkColumns(['https://a.com', 'https://b.com'])).toEqual({
      product_links: ['https://a.com', 'https://b.com'],
      product_link: 'https://a.com',
    });
  });

  it('nulls the scalar column when there are no links', () => {
    expect(linkColumns([])).toEqual({ product_links: [], product_link: null });
  });

  it('normalizes and dedupes before writing', () => {
    expect(linkColumns(['a.com', 'https://www.a.com/', ' '])).toEqual({
      product_links: ['https://a.com'],
      product_link: 'https://a.com',
    });
  });
});
