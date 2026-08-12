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