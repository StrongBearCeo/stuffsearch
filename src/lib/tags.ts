/**
 * Tag helpers for items and places.
 *
 * Tags are stored lowercase in a `text[]` column so filtering is a plain array
 * containment check and "Return" / "return" never split into two tags. All
 * normalization lives here; components only ever hand raw user input in.
 */

/** Longest tag we keep. Long enough for "needs new batteries", short enough to chip. */
export const MAX_TAG_LENGTH = 32;

/**
 * Canonical form of a tag: trimmed, lowercased, inner whitespace collapsed,
 * leading `#` stripped, truncated. Returns null when nothing is left.
 */
export function normalizeTag(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const cleaned = raw
    .replace(/^#+/, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
  if (!cleaned) return null;
  return cleaned.slice(0, MAX_TAG_LENGTH);
}

/** Split a free-text field ("return, fragile") into normalized, unique tags. */
export function parseTagsInput(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(/[,\n]/)) {
    const tag = normalizeTag(part);
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

/**
 * Add one (or several comma-separated) tags to a list. Duplicates and blanks
 * are ignored; the existing order is preserved.
 */
export function addTag(tags: string[], raw: string): string[] {
  const incoming = parseTagsInput(raw);
  if (incoming.length === 0) return tags;
  const next = [...tags];
  for (const tag of incoming) {
    if (!next.includes(tag)) next.push(tag);
  }
  return next;
}

/** Remove a tag by its normalized value. */
export function removeTag(tags: string[], raw: string): string[] {
  const target = normalizeTag(raw);
  if (!target) return tags;
  return tags.filter((t) => normalizeTag(t) !== target);
}

/** Anything that can carry tags — items and places both do. */
export interface Taggable {
  tags?: string[] | null;
}

export interface TagCount {
  tag: string;
  count: number;
}

/**
 * Every tag used across a set of entities with its usage count, most used
 * first (ties alphabetical). Drives the filter bar on the list screens.
 */
export function collectTags(entities: Taggable[]): TagCount[] {
  const counts = new Map<string, number>();
  for (const e of entities) {
    for (const raw of e?.tags ?? []) {
      const tag = normalizeTag(raw);
      if (!tag) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/**
 * True if an entity satisfies the selected tag filter. AND semantics: picking
 * "return" and "fragile" shows only things that are both. An empty selection
 * matches everything.
 */
export function matchesTags(
  entityTags: string[] | null | undefined,
  selected: string[],
): boolean {
  if (selected.length === 0) return true;
  const have = new Set((entityTags ?? []).map((t) => normalizeTag(t)).filter(Boolean));
  return selected.every((s) => have.has(normalizeTag(s)));
}
