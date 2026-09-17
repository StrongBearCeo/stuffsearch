/**
 * Extract a human-readable message from a thrown value.
 *
 * Supabase's `PostgrestError` is a plain object, not an `Error` instance, so a
 * naive `e instanceof Error ? e.message : String(e)` renders "[object Object]".
 * Pull `.message` off anything that has one and append the SQLSTATE `code`
 * when present (RLS violations surface as 42501). Used in screen catch blocks
 * to surface real failures instead of opaque objects.
 */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object') {
    const msg = (e as { message?: unknown }).message;
    const code = (e as { code?: unknown }).code;
    if (typeof msg === 'string' && msg.length > 0) {
      return typeof code === 'string' && code.length > 0 ? `${msg} (${code})` : msg;
    }
  }
  return typeof e === 'string' ? e : 'Unknown error';
}

/** Wrap any thrown value as an `Error` whose `.message` is `errorMessage(e)`. */
export function toError(e: unknown): Error {
  return e instanceof Error ? e : new Error(errorMessage(e));
}

/** The unique index that stops one code binding two things in a household. */
const CODE_UNIQ = 'external_codes_household_value_uniq';

/**
 * Is this the "that code is already taken" collision?
 *
 * Deleting a thing used to leave its bound codes behind, so re-binding the
 * same label later raised a raw `duplicate key value violates unique
 * constraint "external_codes_household_value_uniq" (23505)`. Migration 0010
 * sweeps and prevents those orphans, but the collision is still reachable
 * legitimately — the label really is on something else — and when it is, the
 * user should be told that in a sentence.
 *
 * Matched on the SQLSTATE where we have it, and on the constraint name where
 * we only have a message, so an unrelated unique violation isn't mislabelled.
 */
export function isDuplicateCodeError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const code = (e as { code?: unknown }).code;
  if (code === '23505') return true;
  const msg = (e as { message?: unknown }).message;
  return typeof msg === 'string' && msg.includes(CODE_UNIQ);
}

/**
 * Is this Postgres refusing text it cannot store?
 *
 *   22P05  unsupported Unicode escape sequence — a NUL survived into the JSON
 *          body supabase-js sends, which the server rejects while PARSING the
 *          request, before any row is touched.
 *   22021  untranslatable character.
 *
 * The scanner sanitises payloads at the camera boundary now
 * (`src/lib/scanPayload.ts`), so this should be unreachable for codes — but
 * text can still arrive from a paste or a model response, and the raw message
 * ("unsupported Unicode escape sequence (22P05)") is meaningless to a user
 * staring at a form that simply won't save.
 */
export function isUnstorableTextError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const code = (e as { code?: unknown }).code;
  if (code === '22P05' || code === '22021') return true;
  const msg = (e as { message?: unknown }).message;
  return (
    typeof msg === 'string' &&
    (msg.includes('unsupported Unicode escape sequence') ||
      msg.includes('untranslatable character'))
  );
}