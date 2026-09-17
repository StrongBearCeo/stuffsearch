import { looksLikeUuid, lookupColumnFor, uuidFromBytes, newUuid } from '../ids';
import { generateQrToken } from '../qrcode';

describe('looksLikeUuid', () => {
  it('accepts a canonical uuid, in either case', () => {
    expect(looksLikeUuid('0911575f-9065-4cd4-8fe6-8b0feed9fb96')).toBe(true);
    expect(looksLikeUuid('0911575F-9065-4CD4-8FE6-8B0FEED9FB96')).toBe(true);
  });

  it('rejects an app qr token (36 hex chars, no dashes)', () => {
    expect(looksLikeUuid('d2afcc77338b59ca2f90bbd1de02aead10bd')).toBe(false);
    expect(looksLikeUuid(generateQrToken())).toBe(false);
  });

  it('rejects junk', () => {
    expect(looksLikeUuid('')).toBe(false);
    expect(looksLikeUuid('not-a-uuid')).toBe(false);
    expect(looksLikeUuid(undefined)).toBe(false);
    expect(looksLikeUuid(null)).toBe(false);
    // Right shape, wrong characters.
    expect(looksLikeUuid('zzzzzzzz-9065-4cd4-8fe6-8b0feed9fb96')).toBe(false);
  });
});

describe('lookupColumnFor', () => {
  it('routes a uuid to the primary key', () => {
    expect(lookupColumnFor('0911575f-9065-4cd4-8fe6-8b0feed9fb96')).toBe('id');
  });

  it('routes anything else to qr_token', () => {
    // Scanning an app QR pushes /item/<token>, so the detail screen has to be
    // able to resolve a token as well as an id.
    expect(lookupColumnFor('d2afcc77338b59ca2f90bbd1de02aead10bd')).toBe('qr_token');
  });
});

describe('uuidFromBytes', () => {
  /** 16 ascending bytes — enough to check the layout deterministically. */
  const bytes = Uint8Array.from(Array.from({ length: 16 }, (_, i) => i * 16 + i));

  it('formats 8-4-4-4-12 lowercase hex', () => {
    expect(uuidFromBytes(bytes)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('produces something looksLikeUuid accepts — the insert needs a real uuid', () => {
    expect(looksLikeUuid(uuidFromBytes(bytes))).toBe(true);
    expect(lookupColumnFor(uuidFromBytes(bytes))).toBe('id');
  });

  it('stamps version 4 and the RFC-4122 variant', () => {
    const uuid = uuidFromBytes(bytes);
    expect(uuid[14]).toBe('4'); // version nibble
    expect('89ab').toContain(uuid[19]); // variant nibble
  });

  it('is deterministic for the same bytes', () => {
    expect(uuidFromBytes(bytes)).toBe(uuidFromBytes(bytes));
  });

  it('differs when the bytes differ', () => {
    const other = Uint8Array.from(Array.from({ length: 16 }, (_, i) => 255 - i));
    expect(uuidFromBytes(bytes)).not.toBe(uuidFromBytes(other));
  });

  it('accepts a plain number array too', () => {
    expect(uuidFromBytes(Array.from(bytes))).toBe(uuidFromBytes(bytes));
  });

  it('ignores extra bytes beyond the first 16', () => {
    const padded = Uint8Array.from([...Array.from(bytes), 1, 2, 3]);
    expect(uuidFromBytes(padded)).toBe(uuidFromBytes(bytes));
  });

  it('refuses to invent entropy it was not given', () => {
    expect(() => uuidFromBytes(new Uint8Array(15))).toThrow();
  });

  it('does not mutate the caller’s buffer', () => {
    const input = Uint8Array.from(bytes);
    uuidFromBytes(input);
    expect(Array.from(input)).toEqual(Array.from(bytes));
  });
});

describe('newUuid', () => {
  it('returns a usable primary key', () => {
    // The client picks the id so a retried insert collides on the PK instead
    // of creating a duplicate item.
    expect(looksLikeUuid(newUuid())).toBe(true);
  });
});
