/**
 * Unit tests for URL normalization helpers (src/lib/url.ts).
 */
import { hasScheme, normalizeUrl } from '../url';

describe('hasScheme', () => {
  it('flags http(s) URLs', () => {
    expect(hasScheme('https://example.com')).toBe(true);
    expect(hasScheme('http://example.com/path')).toBe(true);
  });

  it('flags other schemes', () => {
    expect(hasScheme('mailto:a@b.com')).toBe(true);
    expect(hasScheme('tel:+15551234')).toBe(true);
  });

  it('rejects bare domains', () => {
    expect(hasScheme('example.com')).toBe(false);
    expect(hasScheme('www.example.com/path')).toBe(false);
  });

  it('rejects strings that start with a non-alpha character', () => {
    expect(hasScheme('//example.com')).toBe(false);
    expect(hasScheme('1ttp://x')).toBe(false);
  });
});

describe('normalizeUrl', () => {
  it('returns null for empty / null / whitespace', () => {
    expect(normalizeUrl(null)).toBeNull();
    expect(normalizeUrl(undefined)).toBeNull();
    expect(normalizeUrl('')).toBeNull();
    expect(normalizeUrl('   ')).toBeNull();
  });

  it('leaves a full URL untouched', () => {
    expect(normalizeUrl('https://example.com/a')).toBe('https://example.com/a');
  });

  it('prefixes bare domains with https://', () => {
    expect(normalizeUrl('example.com')).toBe('https://example.com');
    expect(normalizeUrl('example.com/p?q=1')).toBe('https://example.com/p?q=1');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeUrl('  https://example.com  ')).toBe('https://example.com');
    expect(normalizeUrl('  example.com  ')).toBe('https://example.com');
  });
});
