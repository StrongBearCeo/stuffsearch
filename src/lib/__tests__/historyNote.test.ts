/**
 * Unit tests for structured item-history notes (src/lib/historyNote.ts).
 * Covers building, parsing, the '=' / '|' escaping edge case, and graceful
 * fallback for unstructured / legacy / null notes.
 */
import { buildNote, parseNote, buildMovedNote, noteToTemplate } from '../historyNote';

describe('buildNote', () => {
  it('builds a key-only note', () => {
    expect(buildNote('moved')).toBe('moved');
  });

  it('builds a note with params', () => {
    expect(buildNote('moved', { from: 'Box A', to: 'Kitchen' })).toBe('moved|from=Box A|to=Kitchen');
  });

  it('escapes "=" and "|" in values', () => {
    expect(buildNote('moved', { to: 'A=B|C' })).toBe('moved|to=A\\=B\\|C');
  });

  it('escapes "=" and "|" in keys (unusual but must round-trip)', () => {
    expect(buildNote('moved', { 'a=b': 'x' })).toBe('moved|a\\=b=x');
  });
});

describe('parseNote', () => {
  it('parses a key + params', () => {
    expect(parseNote('moved|from=Box A|to=Kitchen')).toEqual({
      key: 'moved',
      params: { from: 'Box A', to: 'Kitchen' },
    });
  });

  it('parses a key-only note', () => {
    expect(parseNote('moved')).toEqual({ key: 'moved', params: {} });
  });

  it('round-trips escaped "=" and "|" in values', () => {
    const n = buildNote('moved', { to: 'A=B|C' });
    const parsed = parseNote(n);
    expect(parsed).toEqual({ key: 'moved', params: { to: 'A=B|C' } });
  });

  it('parses created/scanned_* keys', () => {
    expect(parseNote('created|to=Shelf')?.key).toBe('created');
    expect(parseNote('scanned_to|to=Shelf')?.key).toBe('scanned_to');
    expect(parseNote('scanned_in|to=Box')?.key).toBe('scanned_in');
    expect(parseNote('scanned_new|to=New Box')?.key).toBe('scanned_new');
  });

  it('returns null for null/undefined/empty', () => {
    expect(parseNote(null)).toBeNull();
    expect(parseNote(undefined)).toBeNull();
    expect(parseNote('')).toBeNull();
  });

  it('returns null for an unknown key (freeform text)', () => {
    expect(parseNote('some random note')).toBeNull();
    expect(parseNote('Added to this place')).toBeNull();
  });

  it('treats the legacy bare "moved" as a structured note (renders via i18n)', () => {
    expect(parseNote('moved')).toEqual({ key: 'moved', params: {} });
  });

  it('skips malformed segments but keeps valid ones', () => {
    const parsed = parseNote('moved|from=Box A|badsegment|to=Kitchen');
    expect(parsed).toEqual({
      key: 'moved',
      params: { from: 'Box A', to: 'Kitchen' },
    });
  });
});

describe('buildMovedNote', () => {
  it('includes from + to when both present', () => {
    expect(buildMovedNote({ from: 'Box A', to: 'Kitchen' })).toBe('moved|from=Box A|to=Kitchen');
  });

  it('includes only to when from is absent', () => {
    expect(buildMovedNote({ to: 'Kitchen' })).toBe('moved|to=Kitchen');
    expect(buildMovedNote({ from: null, to: 'Kitchen' })).toBe('moved|to=Kitchen');
  });

  it('includes only from when to is absent (removed from a place)', () => {
    expect(buildMovedNote({ from: 'Box A' })).toBe('moved|from=Box A');
  });

  it('produces a bare "moved" when neither is present', () => {
    expect(buildMovedNote({})).toBe('moved');
  });

  it('omits empty-string names', () => {
    expect(buildMovedNote({ from: '', to: 'Kitchen' })).toBe('moved|to=Kitchen');
  });
});
