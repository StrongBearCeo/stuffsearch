/**
 * Chunked SecureStore adapter.
 *
 * expo-secure-store (iOS Keychain) has a practical ~2 KB value limit per key.
 * A Supabase auth session — access_token + refresh_token + user JSON — routinely
 * exceeds that, which is why SecureStore logs:
 *   "Value being stored in SecureStore is larger than 2048 bytes …"
 * and (in a future SDK) will throw.
 *
 * To stay under the limit we split a value larger than CHUNK_SIZE into N chunks,
 * stored under `${key}`, `${key}__1`, `${key}__2`, … The base key holds a small
 * manifest describing how many chunks follow, so reads stay self-describing and
 * a non-chunked legacy value (plain string with no manifest) still loads.
 */

/** Max bytes per keychain entry.保守 value; iOS Keychain items ~2 KB. */
export const CHUNK_SIZE = 1024;

/** Marker prefix on the base-key manifest so we can tell chunks from plain values. */
const MANIFEST_PREFIX = '__chunked__:';

export interface ChunkManifest {
  /** Number of chunks the value was split into. */
  chunks: number;
}

/**
 * Split a string into a base-key manifest plus chunk payloads.
 * - Values that fit in a single chunk are returned as one entry (no chunking),
 *   preserving backwards compatibility and minimising keychain writes.
 * - Larger values produce a manifest entry plus `n` chunk entries.
 *
 * Returns an ordered list of `[storageKey, value]` pairs ready for `setItemAsync`.
 */
export function splitIntoChunks(
  value: string,
  baseKey: string,
  chunkSize: number = CHUNK_SIZE,
): Array<[string, string]> {
  if (value.length <= chunkSize) {
    return [[baseKey, value]];
  }

  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += chunkSize) {
    chunks.push(value.slice(i, i + chunkSize));
  }

  const manifest: ChunkManifest = { chunks: chunks.length };
  const entries: Array<[string, string]> = [
    [baseKey, MANIFEST_PREFIX + JSON.stringify(manifest)],
  ];
  chunks.forEach((c, idx) => entries.push([`${baseKey}__${idx + 1}`, c]));
  return entries;
}

/**
 * Reassemble a value from the base-key entry plus any chunk entries.
 *
 * `read` is the function used to fetch a keychain entry by key (typically
 * `SecureStore.getItemAsync`). Returns the original string, or `null` if the
 * base key is absent.
 *
 * - Plain (non-manifest) base value → returned as-is (legacy / small values).
 * - Manifest base value → reads `chunks` follow-on keys and concatenates them.
 *   If any expected chunk is missing (partial write / cleared keychain), returns
 *   `null` rather than a truncated value: a corrupt session is worse than none.
 */
export async function readFromChunks(
  baseKey: string,
  read: (key: string) => Promise<string | null>,
): Promise<string | null> {
  const base = await read(baseKey);
  if (base === null) return null;

  if (!base.startsWith(MANIFEST_PREFIX)) {
    return base;
  }

  let manifest: ChunkManifest;
  try {
    manifest = JSON.parse(base.slice(MANIFEST_PREFIX.length)) as ChunkManifest;
  } catch {
    // Corrupt manifest — treat as missing.
    return null;
  }

  const parts: string[] = [];
  for (let i = 1; i <= manifest.chunks; i++) {
    const chunk = await read(`${baseKey}__${i}`);
    if (chunk === null) return null;
    parts.push(chunk);
  }
  return parts.join('');
}

/**
 * List every storage key that `splitIntoChunks` would produce for `baseKey`.
 * Used by `removeItem` to delete the base key and any chunk follow-ons.
 */
export function chunkKeysFor(
  baseKey: string,
  valueLength: number,
  chunkSize: number = CHUNK_SIZE,
): string[] {
  if (valueLength <= chunkSize) return [baseKey];
  const n = Math.ceil(valueLength / chunkSize);
  return [baseKey, ...Array.from({ length: n }, (_, i) => `${baseKey}__${i + 1}`)];
}
