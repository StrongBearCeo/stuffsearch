/**
 * Route-parameter identity.
 *
 * `/item/[id]` and `/place/[id]` are reached two ways: from a list (a real
 * `uuid` primary key) and from a scanned app QR, whose deep-link carries the
 * random `qr_token` instead (`stuffsearch://item/<token>`). The two are
 * distinguishable by shape — a token is 36 undashed hex characters, a uuid is
 * 36 characters WITH dashes — so the detail queries can pick the right column
 * rather than silently returning "not found" for every scanned code.
 */

import { getRandomBytes } from 'expo-crypto';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function looksLikeUuid(value: string | null | undefined): boolean {
  return !!value && UUID_RE.test(value);
}

/** Which column to match a route parameter against. */
export function lookupColumnFor(value: string): 'id' | 'qr_token' {
  return looksLikeUuid(value) ? 'id' : 'qr_token';
}

/**
 * Format 16 random bytes as an RFC-4122 v4 uuid string. Split out from
 * `newUuid` so the formatting is testable without stubbing the RNG.
 */
export function uuidFromBytes(bytes: Uint8Array | number[]): string {
  const b = Array.from(bytes).slice(0, 16);
  if (b.length < 16) throw new Error('uuidFromBytes needs 16 bytes');
  // Version 4 + RFC-4122 variant, per spec.
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = b.map((x) => (x & 0xff).toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}

/**
 * A client-generated primary key.
 *
 * Creating a row with an id the CLIENT picked makes the insert idempotent: a
 * double-tapped Save, or a retry after a flaky network, re-sends the SAME id
 * and the second insert bounces off the primary key instead of quietly
 * creating a duplicate item. See `createSubmitGuard` in ./submit for the
 * in-process half of the same guard.
 */
export function newUuid(): string {
  return uuidFromBytes(getRandomBytes(16));
}
