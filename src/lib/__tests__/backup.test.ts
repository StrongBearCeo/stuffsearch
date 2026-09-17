/** Unit tests for src/lib/backup.ts — pure SQL rendering, no I/O. */
import {
  insertStatements,
  isStorageFolder,
  joinStoragePrefix,
  publicStorageObjectUrl,
  quoteIdent,
  quoteQualifiedTable,
  safeStoragePath,
  sequenceReset,
  sqlLiteral,
  storageObjectSize,
  tableColumns,
} from '@/lib/backup';

describe('quoteIdent', () => {
  it('wraps a plain name in double quotes', () => {
    expect(quoteIdent('items')).toBe('"items"');
  });

  it('escapes embedded double quotes by doubling', () => {
    expect(quoteIdent('od"d')).toBe('"od""d"');
  });
});

describe('quoteQualifiedTable', () => {
  it('quotes each dot-separated part', () => {
    expect(quoteQualifiedTable('public.items')).toBe('"public"."items"');
  });

  it('handles an unqualified name', () => {
    expect(quoteQualifiedTable('items')).toBe('"items"');
  });
});

describe('sqlLiteral', () => {
  it('renders null and undefined as NULL', () => {
    expect(sqlLiteral(null)).toBe('NULL');
    expect(sqlLiteral(undefined)).toBe('NULL');
  });

  it('renders booleans as SQL true/false', () => {
    expect(sqlLiteral(true)).toBe('TRUE');
    expect(sqlLiteral(false)).toBe('FALSE');
  });

  it('renders finite numbers verbatim', () => {
    expect(sqlLiteral(0)).toBe('0');
    expect(sqlLiteral(42)).toBe('42');
    expect(sqlLiteral(-3.5)).toBe('-3.5');
  });

  it('throws on non-finite numbers', () => {
    expect(() => sqlLiteral(Number.NaN)).toThrow(/non-finite/);
    expect(() => sqlLiteral(Number.POSITIVE_INFINITY)).toThrow(/non-finite/);
  });

  it('single-quotes strings and doubles embedded single quotes', () => {
    expect(sqlLiteral('hello')).toBe("'hello'");
    expect(sqlLiteral("bob's box")).toBe("'bob''s box'");
  });

  it('leaves backslashes untouched (standard_conforming_strings on)', () => {
    expect(sqlLiteral('a\\b')).toBe("'a\\b'");
  });

  it('renders objects and arrays as jsonb literals with quoted content', () => {
    expect(sqlLiteral({ a: 1 })).toBe(`'{"a":1}'::jsonb`);
    expect(sqlLiteral([1, 'x'])).toBe(`'[1,"x"]'::jsonb`);
    expect(sqlLiteral({ note: "it's" })).toBe(`'{"note":"it''s"}'::jsonb`);
  });

  it('renders dates as ISO timestamp literals', () => {
    expect(sqlLiteral(new Date('2026-08-31T10:00:00.000Z'))).toBe(
      "'2026-08-31T10:00:00.000Z'"
    );
  });
});

describe('tableColumns', () => {
  it('returns the sorted union of keys across rows', () => {
    const rows = [{ id: 1, name: 'a' }, { id: 2, qty: 5 }];
    expect(tableColumns(rows)).toEqual(['id', 'name', 'qty']);
  });

  it('returns an empty list for no rows', () => {
    expect(tableColumns([])).toEqual([]);
  });
});

describe('insertStatements', () => {
  it('emits one statement per row with the column list', () => {
    const stmts = insertStatements('public.items', ['id', 'name'], [
      { id: 1, name: 'a' },
      { id: 2, name: 'b' },
    ]);
    expect(stmts).toEqual([
      'INSERT INTO "public"."items" ("id", "name") VALUES (1, \'a\');',
      'INSERT INTO "public"."items" ("id", "name") VALUES (2, \'b\');',
    ]);
  });

  it('emits NULL for keys missing from a row', () => {
    const stmts = insertStatements('t', ['a', 'b'], [{ a: 1 }]);
    expect(stmts).toEqual(['INSERT INTO "t" ("a", "b") VALUES (1, NULL);']);
  });

  it('escapes values and identifiers', () => {
    const stmts = insertStatements('public.t', ['na"me'], [{ "na\"me": "v'l" }]);
    expect(stmts).toEqual(
      ['INSERT INTO "public"."t" ("na""me") VALUES (\'v\'\'l\');']
    );
  });

  it('returns an empty array for zero rows', () => {
    expect(insertStatements('t', ['a'], [])).toEqual([]);
  });
});

describe('sequenceReset', () => {
  it('wraps the setval in a NULL-safe DO block', () => {
    const sql = sequenceReset('public.items', 'id');
    expect(sql).toContain("pg_get_serial_sequence('public.items', 'id')");
    expect(sql).toContain('IF seq IS NOT NULL THEN');
    expect(sql).toContain('SELECT max("id") FROM "public"."items"');
    expect(sql).toContain('END $$;');
  });
});

describe('safeStoragePath', () => {
  it('returns slash-joined segments for a normal object path', () => {
    expect(safeStoragePath('user-uuid/hh-uuid/items/photo 1.jpeg')).toBe(
      'user-uuid/hh-uuid/items/photo 1.jpeg'
    );
  });

  it('rejects parent-directory traversal', () => {
    expect(() => safeStoragePath('../etc/passwd')).toThrow(/Unsafe/);
    expect(() => safeStoragePath('a/../../b')).toThrow(/Unsafe/);
  });

  it('rejects empty and dot segments', () => {
    expect(() => safeStoragePath('a//b')).toThrow(/Unsafe/);
    expect(() => safeStoragePath('a/./b')).toThrow(/Unsafe/);
  });

  it('rejects filesystem-hostile characters', () => {
    expect(() => safeStoragePath('a/b<c')).toThrow(/filesystem-hostile/);
    expect(() => safeStoragePath('a\\b')).toThrow(/filesystem-hostile/);
  });
});

describe('publicStorageObjectUrl', () => {
  it('builds the public object URL, encoding each segment', () => {
    expect(publicStorageObjectUrl('https://x.supabase.co', 'b', 'u/h/a b.jpeg')).toBe(
      'https://x.supabase.co/storage/v1/object/public/b/u/h/a%20b.jpeg'
    );
  });

  it('encodes unicode and strips trailing slashes from the project URL', () => {
    expect(publicStorageObjectUrl('https://x.supabase.co//', 'b', 'Đồng Hồ.jpeg')).toBe(
      'https://x.supabase.co/storage/v1/object/public/b/%C4%90%E1%BB%93ng%20H%E1%BB%93.jpeg'
    );
  });

  it('encodes the bucket name', () => {
    expect(publicStorageObjectUrl('https://x.supabase.co', 'my bucket', 'a.png')).toBe(
      'https://x.supabase.co/storage/v1/object/public/my%20bucket/a.png'
    );
  });
});

describe('storage listing helpers (REST mode)', () => {
  describe('isStorageFolder', () => {
    it('treats a null id as a folder — that is how the API marks one', () => {
      expect(isStorageFolder({ name: 'user-uuid', id: null })).toBe(true);
    });

    it('treats a real id as an object', () => {
      expect(isStorageFolder({ name: 'photo.jpeg', id: 'abc-123' })).toBe(false);
    });

    it('treats a missing id as a folder', () => {
      expect(isStorageFolder({ name: 'user-uuid' })).toBe(true);
    });
  });

  describe('joinStoragePrefix', () => {
    it('joins a prefix and a name', () => {
      expect(joinStoragePrefix('a/b', 'c.jpg')).toBe('a/b/c.jpg');
    });

    it('returns the bare name at the root', () => {
      expect(joinStoragePrefix('', 'c.jpg')).toBe('c.jpg');
    });

    it('does not double the separator', () => {
      expect(joinStoragePrefix('a/b/', 'c.jpg')).toBe('a/b/c.jpg');
    });

    it('builds the real shape this app stores: uid/household/entity/file', () => {
      const p = joinStoragePrefix(
        joinStoragePrefix(joinStoragePrefix('', 'uid'), 'household'),
        'items',
      );
      expect(joinStoragePrefix(p, '123-abc.jpeg')).toBe('uid/household/items/123-abc.jpeg');
    });
  });

  describe('storageObjectSize', () => {
    it('reads the size out of metadata', () => {
      expect(storageObjectSize({ name: 'x', id: '1', metadata: { size: 2048 } })).toBe(2048);
    });

    it('returns -1 when the size is unknown, so verification is skipped', () => {
      expect(storageObjectSize({ name: 'x', id: '1' })).toBe(-1);
      expect(storageObjectSize({ name: 'x', id: '1', metadata: {} })).toBe(-1);
      expect(storageObjectSize({ name: 'x', id: '1', metadata: null })).toBe(-1);
    });

    it('returns -1 for a non-numeric size rather than NaN', () => {
      expect(storageObjectSize({ name: 'x', id: '1', metadata: { size: 'big' } })).toBe(-1);
    });
  });
});
