import { tokenize, stem, scoreEntity, rankBySearch } from '../search';

describe('tokenize', () => {
  it('splits on whitespace and punctuation, lowercasing', () => {
    expect(tokenize('Husky Tile-Cutter')).toEqual(['husky', 'tile', 'cutter']);
  });

  it('drops single characters and duplicates', () => {
    expect(tokenize('a AA aa battery')).toEqual(['aa', 'battery']);
  });

  it('returns an empty array for blank input', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('   ')).toEqual([]);
    expect(tokenize(null)).toEqual([]);
  });
});

describe('stem', () => {
  it('strips a simple plural', () => {
    expect(stem('batteries')).toBe('batter');
    expect(stem('boxes')).toBe('box');
    expect(stem('cutters')).toBe('cutter');
  });

  it('leaves short or non-plural words alone', () => {
    expect(stem('gas')).toBe('gas');
    expect(stem('tile')).toBe('tile');
  });
});

describe('scoreEntity', () => {
  const tileCutter = { name: 'Tile cutter', description: 'Manual 24-inch' };

  it('scores a partial multi-word query above zero', () => {
    // The reported bug: "Husky tile cutter" found nothing while "tile cutter" worked.
    expect(scoreEntity(tileCutter, 'Husky tile cutter')).toBeGreaterThan(0);
  });

  it('ranks a fuller match higher than a partial one', () => {
    expect(scoreEntity(tileCutter, 'tile cutter')).toBeGreaterThan(
      scoreEntity(tileCutter, 'Husky tile cutter'),
    );
  });

  it('weights a name hit above a description-only hit', () => {
    const inDescription = { name: 'Widget', description: 'a tile cutter attachment' };
    expect(scoreEntity(tileCutter, 'tile')).toBeGreaterThan(scoreEntity(inDescription, 'tile'));
  });

  it('matches tags', () => {
    expect(scoreEntity({ name: 'Jacket', tags: ['return'] }, 'return')).toBeGreaterThan(0);
  });

  it('matches across a plural / singular difference', () => {
    expect(scoreEntity({ name: 'AA battery' }, 'batteries')).toBeGreaterThan(0);
    expect(scoreEntity({ name: 'Storage boxes' }, 'box')).toBeGreaterThan(0);
  });

  it('returns 0 when no token matches at all', () => {
    expect(scoreEntity(tileCutter, 'kayak paddle')).toBe(0);
  });

  it('treats a blank query as "everything matches"', () => {
    expect(scoreEntity(tileCutter, '')).toBeGreaterThan(0);
    expect(scoreEntity(tileCutter, '   ')).toBeGreaterThan(0);
  });

  it('is case-insensitive and copes with null fields', () => {
    expect(scoreEntity({ name: 'TILE CUTTER', description: null, tags: null }, 'tile')).toBeGreaterThan(0);
  });
});

describe('rankBySearch', () => {
  const items = [
    { id: '1', name: 'Tile cutter', description: null },
    { id: '2', name: 'Husky wrench', description: null },
    { id: '3', name: 'Kayak paddle', description: null },
  ];
  const fields = (i: (typeof items)[number]) => i;

  it('returns near matches for a query with an extra word', () => {
    const out = rankBySearch(items, 'Husky tile cutter', fields);
    expect(out.map((i) => i.id)).toEqual(['1', '2']);
  });

  it('puts the best match first', () => {
    expect(rankBySearch(items, 'tile cutter', fields)[0].id).toBe('1');
  });

  it('excludes non-matches', () => {
    expect(rankBySearch(items, 'wrench', fields).map((i) => i.id)).toEqual(['2']);
  });

  it('returns the input untouched for a blank query', () => {
    expect(rankBySearch(items, '', fields)).toEqual(items);
    expect(rankBySearch(items, '  ', fields)).toEqual(items);
  });

  it('returns an empty list when nothing matches', () => {
    expect(rankBySearch(items, 'zzzz', fields)).toEqual([]);
  });

  it('breaks score ties by name', () => {
    const tie = [
      { id: 'b', name: 'Box B' },
      { id: 'a', name: 'Box A' },
    ];
    expect(rankBySearch(tie, 'box', (x) => x).map((x) => x.id)).toEqual(['a', 'b']);
  });
});
