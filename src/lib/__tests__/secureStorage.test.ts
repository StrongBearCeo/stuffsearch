/**
 * Unit tests for secureStorage.ts — chunked SecureStore adapter logic.
 * Pure functions: no RN / SecureStore runtime required.
 */
import {
  splitIntoChunks,
  readFromChunks,
  chunkKeysFor,
  CHUNK_SIZE,
} from '../secureStorage';

/** In-memory key/value store used as the `read` callback in round-trip tests. */
function makeStore(entries: Record<string, string>) {
  const store = { ...entries };
  return {
    read: (key: string) => Promise.resolve(store[key] ?? null),
    write: (key: string, value: string) => {
      store[key] = value;
      return Promise.resolve();
    },
  };
}

describe('splitIntoChunks', () => {
  it('returns a single entry when the value fits in one chunk', () => {
    const value = 'x'.repeat(100);
    const entries = splitIntoChunks(value, 'k', CHUNK_SIZE);
    expect(entries).toEqual([['k', value]]);
  });

  it('returns exactly one entry when the value is exactly CHUNK_SIZE', () => {
    const value = 'y'.repeat(CHUNK_SIZE);
    expect(splitIntoChunks(value, 'k', CHUNK_SIZE)).toEqual([['k', value]]);
  });

  it('splits a value larger than CHUNK_SIZE into manifest + chunks', () => {
    const value = 'a'.repeat(CHUNK_SIZE + 5);
    const entries = splitIntoChunks(value, 'sess', CHUNK_SIZE);
    // [base manifest, chunk 1 (full), chunk 2 (remainder)]
    expect(entries).toHaveLength(3);
    const [base, c1, c2] = entries;
    expect(base[0]).toBe('sess');
    expect(base[1]).toBe('__chunked__:{"chunks":2}');
    expect(c1).toEqual(['sess__1', 'a'.repeat(CHUNK_SIZE)]);
    expect(c2).toEqual(['sess__2', 'aaaaa']);
  });

  it('produces the correct chunk count for a multi-boundary value', () => {
    // CHUNK_SIZE*3 + 1 chars → 4 value chunks (3 full + 1 of length 1) + 1 manifest.
    const value = 'b'.repeat(CHUNK_SIZE * 3 + 1);
    const entries = splitIntoChunks(value, 'k', CHUNK_SIZE);
    expect(entries).toHaveLength(5);
    expect(entries[0]).toEqual(['k', '__chunked__:{"chunks":4}']);
    expect(entries[1]).toEqual(['k__1', 'b'.repeat(CHUNK_SIZE)]);
    expect(entries[2]).toEqual(['k__2', 'b'.repeat(CHUNK_SIZE)]);
    expect(entries[3]).toEqual(['k__3', 'b'.repeat(CHUNK_SIZE)]);
    expect(entries[4]).toEqual(['k__4', 'b']);
  });

  it('honours a custom chunk size', () => {
    // 'hello world this is a test' = 26 chars, chunk size 5 → 6 chunks.
    const value = 'hello world this is a test';
    const entries = splitIntoChunks(value, 'k', 5);
    expect(entries[0]).toEqual(['k', '__chunked__:{"chunks":6}']);
    expect(entries[1][1]).toBe('hello');
    expect(entries.at(-1)).toEqual(['k__6', 't']);
  });

  it('handles empty string as a single small entry', () => {
    expect(splitIntoChunks('', 'k', CHUNK_SIZE)).toEqual([['k', '']]);
  });
});

describe('readFromChunks', () => {
  it('returns the plain value when the base key has no manifest', async () => {
    const { read } = makeStore({ k: 'plain-value' });
    await expect(readFromChunks('k', read)).resolves.toBe('plain-value');
  });

  it('returns null when the base key is absent', async () => {
    const { read } = makeStore({});
    await expect(readFromChunks('k', read)).resolves.toBeNull();
  });

  it('reassembles a chunked value', async () => {
    const value = 'z'.repeat(CHUNK_SIZE + 3);
    const entries = splitIntoChunks(value, 'sess', CHUNK_SIZE);
    const store = makeStore(Object.fromEntries(entries));
    await expect(readFromChunks('sess', store.read)).resolves.toBe(value);
  });

  it('reassembles a multi-chunk value exactly', async () => {
    const value = '0123456789'.repeat(500); // 5000 chars
    const entries = splitIntoChunks(value, 'big', CHUNK_SIZE);
    const store = makeStore(Object.fromEntries(entries));
    await expect(readFromChunks('big', store.read)).resolves.toBe(value);
  });

  it('returns null when a follow-on chunk is missing (corrupt store)', async () => {
    const value = 'q'.repeat(CHUNK_SIZE + 4);
    const entries = splitIntoChunks(value, 'sess', CHUNK_SIZE);
    const partial = Object.fromEntries(entries);
    delete partial['sess__2']; // lose the last chunk
    const store = makeStore(partial);
    await expect(readFromChunks('sess', store.read)).resolves.toBeNull();
  });

  it('returns null when the manifest is corrupt JSON', async () => {
    const store = makeStore({ k: '__chunked__:not-json' });
    await expect(readFromChunks('k', store.read)).resolves.toBeNull();
  });

  it('ignores extra unrelated keys that share the prefix', async () => {
    const value = 'm'.repeat(CHUNK_SIZE + 1);
    const entries = splitIntoChunks(value, 'sess', CHUNK_SIZE);
    const store = makeStore({
      ...Object.fromEntries(entries),
      'sess__unrelated': 'noise', // different suffix format — not read
    });
    await expect(readFromChunks('sess', store.read)).resolves.toBe(value);
  });
});

describe('round-trip', () => {
  it('split -> write -> read reproduces the original for any size', async () => {
    const cases = ['', 'short', 'x'.repeat(CHUNK_SIZE), 'y'.repeat(CHUNK_SIZE + 1), 'z'.repeat(4096)];
    for (const value of cases) {
      const entries = splitIntoChunks(value, 'sb-token', CHUNK_SIZE);
      const store = makeStore({});
      for (const [k, v] of entries) await store.write(k, v);
      await expect(readFromChunks('sb-token', store.read)).resolves.toBe(value);
    }
  });
});

describe('chunkKeysFor', () => {
  it('lists only the base key for small values', () => {
    expect(chunkKeysFor('k', 10)).toEqual(['k']);
  });

  it('lists base + N chunk keys for large values', () => {
    expect(chunkKeysFor('k', CHUNK_SIZE * 2 + 1)).toEqual([
      'k',
      'k__1',
      'k__2',
      'k__3',
    ]);
  });

  it('is consistent with the keys produced by splitIntoChunks', () => {
    const value = 'p'.repeat(CHUNK_SIZE * 3 + 7);
    const splitKeys = splitIntoChunks(value, 'tok').map(([k]) => k);
    // chunkKeysFor covers base + value chunks (no manifest), which is exactly
    // what we must delete; splitIntoChunks also returns the manifest entry.
    const toDelete = chunkKeysFor('tok', value.length);
    expect(toDelete).toEqual(expect.arrayContaining(splitKeys));
    expect(toDelete).toContain('tok');
    expect(toDelete).toContain('tok__3');
  });
});
