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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function looksLikeUuid(value: string | null | undefined): boolean {
  return !!value && UUID_RE.test(value);
}

/** Which column to match a route parameter against. */
export function lookupColumnFor(value: string): 'id' | 'qr_token' {
  return looksLikeUuid(value) ? 'id' : 'qr_token';
}
