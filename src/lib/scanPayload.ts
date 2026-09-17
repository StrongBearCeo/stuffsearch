/**
 * Sanitising a raw scanned payload.
 *
 * A barcode's payload is arbitrary bytes. Most of the time it's an ASCII
 * identifier, but a misread — or a genuinely binary Data Matrix / PDF417 —
 * hands back control characters, replacement characters and lone surrogates.
 * Three separate things then break:
 *
 *   1. SAVING FAILS. supabase-js JSON-encodes the row, so a NUL becomes the
 *      literal six-character escape for codepoint 0, and PostgreSQL refuses to
 *      parse that inside a JSON body: `unsupported Unicode escape sequence
 *      (22P05)`. The external_codes insert dies and takes the whole "add item"
 *      save down with it — nothing can be saved at all.
 *   2. DISPLAY IS GARBAGE. The code card renders the raw payload as monospace
 *      text, so the user sees a wall of boxes and diamonds.
 *   3. THE ROW MAY NOT EVEN BE STORABLE. A multi-kilobyte payload exceeds the
 *      btree row limit of `external_codes_household_value_uniq`, and is also
 *      too long for react-native-qrcode-svg to re-render for display.
 *
 * So the payload is cleaned once, at the boundary where it enters the app, and
 * everything downstream — display, `resolve_code`, binding — sees the clean
 * value. Two properties matter and are pinned by tests:
 *
 *   - IDEMPOTENT: cleaning a clean value changes nothing, so applying it at
 *     several boundaries is safe.
 *   - DETERMINISTIC: re-scanning the same physical label produces the same
 *     cleaned string, so a bound code keeps resolving.
 */

/**
 * Longest payload we keep. Comfortably above any label people actually stick
 * on a box (a QR holds ~300 useful characters, EAN 13, Code128 ~48) and well
 * under the ~2700-byte btree index row limit.
 */
export const MAX_SCAN_PAYLOAD = 512;

/**
 * Codepoints that must not survive:
 *   0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F  C0 controls (NUL is what causes 22P05)
 *   0x7F-0x9F                         DEL + C1 controls
 *   0xFFFD                            the replacement char a misread leaves
 *
 * Tab (0x09), newline (0x0A) and carriage return (0x0D) are deliberately NOT
 * here: they're real separators in some symbologies, and get folded to a
 * single space below rather than vanishing.
 *
 * Written as numeric comparisons rather than a regex character class so this
 * file carries no literal control bytes of its own — a source file full of raw
 * NULs is unreadable, un-greppable, and one careless editor away from silent
 * corruption.
 */
function isStrippable(code: number): boolean {
  if (code <= 0x08) return true;
  if (code === 0x0b || code === 0x0c) return true;
  if (code >= 0x0e && code <= 0x1f) return true;
  if (code >= 0x7f && code <= 0x9f) return true;
  if (code === 0xfffd) return true;
  return false;
}

const isHighSurrogate = (c: number) => c >= 0xd800 && c <= 0xdbff;
const isLowSurrogate = (c: number) => c >= 0xdc00 && c <= 0xdfff;

/**
 * Clean a raw scanned payload into something storable, displayable and
 * matchable. Returns '' when nothing usable is left.
 *
 * A single pass over UTF-16 code units rather than a regex, because the
 * lone-surrogate rule needs a lookbehind and Hermes — the engine this ships on
 * — does not support lookbehind assertions.
 */
export function sanitizeScanPayload(raw: string | null | undefined): string {
  if (raw == null) return '';
  const input = String(raw);
  const out: string[] = [];

  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);

    if (isStrippable(code)) continue;

    if (isHighSurrogate(code)) {
      // Keep a well-formed PAIR (a real emoji / astral character); drop a high
      // surrogate with nothing valid after it.
      const next = i + 1 < input.length ? input.charCodeAt(i + 1) : -1;
      if (isLowSurrogate(next)) {
        out.push(input[i], input[i + 1]);
        i++;
      }
      continue;
    }
    // A low surrogate reaching here has no high partner before it — a pair
    // would have consumed it above — so it is lone, and invalid.
    if (isLowSurrogate(code)) continue;

    out.push(input[i]);
  }

  // Fold every run of whitespace (including the tabs/newlines we kept) into a
  // single space, then trim.
  const cleaned = out.join('').replace(/\s+/g, ' ').trim();

  if (cleaned.length <= MAX_SCAN_PAYLOAD) return cleaned;

  // Cap without slicing a surrogate pair in half — that would manufacture
  // exactly the lone surrogate we just stripped.
  const capped = cleaned.slice(0, MAX_SCAN_PAYLOAD);
  return isHighSurrogate(capped.charCodeAt(capped.length - 1))
    ? capped.slice(0, -1)
    : capped;
}

/**
 * Is there anything left to bind after cleaning? A payload of pure binary
 * cleans away to nothing, and binding an empty `code_value` would create a row
 * that can never be scanned again — the caller should report an unreadable
 * code instead.
 */
export function isUsableScanPayload(raw: string | null | undefined): boolean {
  return sanitizeScanPayload(raw).length > 0;
}
