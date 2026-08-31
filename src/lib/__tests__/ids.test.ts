import { looksLikeUuid, lookupColumnFor } from '../ids';
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
