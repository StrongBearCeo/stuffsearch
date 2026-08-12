/**
 * Structured item-history notes.
 *
 * Notes are stored in the DB as a compact, locale-neutral string so the same
 * row renders correctly in any language at display time:
 *
 *   `<key>|<param>=<value>|<param>=<value> ...`
 *
 * Examples:
 *   moved|from=Box A|to=Kitchen shelf
 *   moved|to=Kitchen shelf
 *   moved|from=Box A
 *   created|to=Kitchen shelf
 *   scanned_to|to=Kitchen shelf
 *   scanned_in|to=Box A
 *   scanned_new|to=New Box
 *
 * Place names may contain '=' or '|', so builders escape those characters and
 * parsers reverse it. Keep this module free of React/RN so it's unit-testable.
 */

/** The set of structured note keys. Display code maps these to i18n templates. */
export type HistoryNoteKey =
  | 'moved'
  | 'created'
  | 'scanned_to'
  | 'scanned_in'
  | 'scanned_new';

export interface ParsedNote {
  key: HistoryNoteKey;
  params: Record<string, string>;
}

const ESC = { '=': '\\=', '|': '\\|' };
const UNESC: Record<string, string> = { '\\=': '=', '\\|': '|' };

function escape(value: string): string {
  return value.replace(/[=|]/g, (ch) => ESC[ch as '=' | '|']);
}

function unescape(value: string): string {
  return value.replace(/\\=|\\\|/g, (seq) => UNESC[seq] ?? seq);
}

/** Build a structured note string from a key + named params. */
export function buildNote(key: HistoryNoteKey, params: Record<string, string> = {}): string {
  const parts: string[] = [key];
  for (const [k, v] of Object.entries(params)) {
    parts.push(`${escape(k)}=${escape(v)}`);
  }
  return parts.join('|');
}

/**
 * Parse a stored note into its key + params. Returns null for unstructured
 * notes (freeform text, or the legacy bare 'moved' string) so the caller can
 * fall back to rendering the raw value.
 */
export function parseNote(raw: string | null | undefined): ParsedNote | null {
  if (!raw) return null;
  // Split on '|' that isn't escaped ('\|'), so escaped pipes inside a value
  // survive the split and are restored by unescape() below.
  const segments = raw.split(/(?<!\\)\|/);
  // A structured note needs at least a key segment, and the key must be a
  // known value. Legacy 'moved' (a known key but with no params) is still
  // parsed so it can render via i18n.
  const key = segments[0] as HistoryNoteKey;
  const KNOWN: HistoryNoteKey[] = ['moved', 'created', 'scanned_to', 'scanned_in', 'scanned_new'];
  if (!KNOWN.includes(key)) return null;

  const params: Record<string, string> = {};
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    // The key/value separator is the first '=' that isn't escaped.
    const eq = seg.search(/(?<!\\)=/);
    if (eq === -1) continue; // malformed segment — skip
    const k = unescape(seg.slice(0, eq));
    const v = unescape(seg.slice(eq + 1));
    params[k] = v;
  }
  return { key, params };
}

/** Build a "moved" note capturing the from/to place names when available. */
export function buildMovedNote(opts: { from?: string | null; to?: string | null }): string {
  const params: Record<string, string> = {};
  if (opts.from) params.from = opts.from;
  if (opts.to) params.to = opts.to;
  return buildNote('moved', params);
}

/** The i18n template key + interpolation params to render a parsed note, or
 *  null if the note is unstructured (caller falls back to the raw string).
 *  Template keys live under the `history.*` namespace in the locale files. */
export function noteToTemplate(
  raw: string | null | undefined,
): { templateKey: string; params: Record<string, string> } | null {
  const parsed = parseNote(raw);
  if (!parsed) return null;
  const { key, params } = parsed;
  switch (key) {
    case 'moved':
      if (params.from && params.to) return { templateKey: 'history.movedFromTo', params };
      if (params.to) return { templateKey: 'history.movedTo', params };
      if (params.from) return { templateKey: 'history.movedFrom', params };
      return { templateKey: 'history.movedBare', params: {} };
    case 'created':
      return params.to
        ? { templateKey: 'history.created', params }
        : { templateKey: 'history.createdBare', params: {} };
    case 'scanned_to':
      return { templateKey: 'history.scannedTo', params };
    case 'scanned_in':
      return { templateKey: 'history.scannedIn', params };
    case 'scanned_new':
      return { templateKey: 'history.scannedNew', params };
    default:
      return null;
  }
}

