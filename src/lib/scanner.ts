/**
 * resolveScan — the scan resolution state machine (plan §"External barcode
 * binding model"). Given a raw payload, route it:
 *   1. StuffSearch deep-link → open/join target.
 *   2. Raw code → query `resolve_code` RPC across ALL the user's households.
 *      - match in active household → open (or scan-to-assign if a place is active).
 *      - match elsewhere → "switch and open?" prompt.
 *      - no match → offer "create with this code".
 */
import { supabase } from './supabase';
import { APP_SCHEME } from './constants';
import { sanitizeScanPayload } from './scanPayload';

/** A parsed StuffSearch deep-link. */
export interface DeepLinkTarget {
  kind: 'item' | 'place' | 'invite';
  token: string;
  householdShort?: string;
}

/** Try to parse a payload as a StuffSearch deep-link.
 * WHATWG URL treats custom-scheme hosts like `stuffsearch://item/<token>` with
 * `item` as the HOST and `<token>` as the first path segment, so we combine
 * host + pathname to recover the full path. */
export function parseDeepLink(payload: string): DeepLinkTarget | null {
  let url: URL;
  try {
    url = new URL(payload);
  } catch {
    return null;
  }
  if (url.protocol !== `${APP_SCHEME}:`) return null;
  // For custom schemes, `host` holds the first path segment (e.g. "item")
  // and pathname holds the rest. Combine both, accounting for either shape.
  const host = url.hostname; // "item" | "place" | "invite" (or empty on some parsers)
  const path = url.pathname.split('/').filter(Boolean);
  const seg = host ? [host, ...path] : path;
  if (seg.length !== 2) return null;
  const kind = seg[0];
  if (kind !== 'item' && kind !== 'place' && kind !== 'invite') return null;
  const householdShort = url.searchParams.get('h') ?? undefined;
  return { kind, token: seg[1], householdShort };
}

/** One row from the `resolve_code` RPC. */
export interface ResolvedCode {
  household_id: string;
  entity_type: 'item' | 'place';
  entity_id: string;
}

export type ScanOutcome =
  | { type: 'deep-link'; target: DeepLinkTarget }
  | {
      type: 'matched';
      inActiveHousehold: boolean;
      activeHouseholdId: string | null;
      matches: ResolvedCode[];
    }
  | { type: 'no-match'; codeValue: string };

/**
 * Resolve a scanned payload against the user's households.
 * @param payload raw scanned string (deep-link or code value)
 * @param userId  current user id (for the RPC)
 * @param activeHouseholdId the currently active household (null if none)
 */
export async function resolveScan(
  rawPayload: string,
  userId: string,
  activeHouseholdId: string | null,
): Promise<ScanOutcome> {
  // Sanitising is idempotent, so doing it here as well as at the camera costs
  // nothing and covers manual entry — and guarantees the value we look up is
  // byte-identical to the value binding would store.
  const payload = sanitizeScanPayload(rawPayload);
  const dl = parseDeepLink(payload);
  if (dl) return { type: 'deep-link', target: dl };

  const { data, error } = await supabase.rpc('resolve_code', {
    _code_value: payload,
    _user_id: userId,
  });
  if (error) throw error;
  const matches = (data ?? []) as ResolvedCode[];
  if (matches.length === 0) return { type: 'no-match', codeValue: payload };

  const inActive = activeHouseholdId
    ? matches.some((m) => m.household_id === activeHouseholdId)
    : false;
  return {
    type: 'matched',
    inActiveHousehold: inActive,
    activeHouseholdId,
    matches,
  };
}
