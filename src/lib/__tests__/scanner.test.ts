/**
 * Unit tests for the deep-link parser in scanner.ts.
 * (resolveScan RPC is tested separately via a supabase mock.)
 */
import { parseDeepLink } from '../scanner';

describe('parseDeepLink', () => {
  it('parses an item deep-link', () => {
    expect(parseDeepLink('stuffsearch://item/abc123?h=1a2b3c4d')).toEqual({
      kind: 'item',
      token: 'abc123',
      householdShort: '1a2b3c4d',
    });
  });

  it('parses a place deep-link', () => {
    expect(parseDeepLink('stuffsearch://place/xyz789?h=abcd1234')).toEqual({
      kind: 'place',
      token: 'xyz789',
      householdShort: 'abcd1234',
    });
  });

  it('parses an invite deep-link (no household param)', () => {
    expect(parseDeepLink('stuffsearch://invite/invitetoken123')).toEqual({
      kind: 'invite',
      token: 'invitetoken123',
      householdShort: undefined,
    });
  });

  it('returns null for a non-deep-link payload (raw barcode)', () => {
    expect(parseDeepLink('0123456789012')).toBeNull();
  });

  it('returns null for a different scheme', () => {
    expect(parseDeepLink('https://example.com/item/abc')).toBeNull();
  });

  it('returns null for a stuffsearch:// link with unknown kind', () => {
    expect(parseDeepLink('stuffsearch://unknown/abc')).toBeNull();
  });

  it('returns null for a stuffsearch:// link with too few path segments', () => {
    expect(parseDeepLink('stuffsearch://item')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseDeepLink('')).toBeNull();
  });

  it('returns null for malformed input', () => {
    expect(parseDeepLink('not a url at all')).toBeNull();
  });
});
