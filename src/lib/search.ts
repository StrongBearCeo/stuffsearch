/**
 * Relevance search over items and places.
 *
 * The list screens used to hand the raw query to PostgREST as a single
 * `name.ilike.%<query>%`, which only ever matched a contiguous substring — so
 * "Husky tile cutter" found nothing even though "Tile cutter" was right there.
 * This module scores each entity per *token* instead, so a query with an extra
 * (or missing, or misspelled-plural) word still surfaces the near match, best
 * first.
 *
 * Pure and synchronous: the household's items are already in the React Query
 * cache, so ranking them locally is both faster and offline-safe.
 */

/** ASCII punctuation + whitespace. Deliberately not a Unicode property escape:
 *  this keeps Vietnamese/CJK letters intact on every JS engine we ship to. */
const SPLIT_RE = /[\s!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]+/;

/** Lowercased, de-duplicated query tokens of two characters or more. */
export function tokenize(query: string | null | undefined): string[] {
  if (!query) return [];
  const out: string[] = [];
  for (const part of query.toLowerCase().split(SPLIT_RE)) {
    if (part.length < 2) continue;
    if (!out.includes(part)) out.push(part);
  }
  return out;
}

/**
 * Crude English de-pluralizer, enough to bridge "batteries"/"battery" and
 * "boxes"/"box". Words shorter than four characters are left alone so "gas"
 * doesn't become "ga".
 */
export function stem(word: string): string {
  if (word.length < 4) return word;
  if (word.endsWith('ies')) return word.slice(0, -3);
  if (word.endsWith('es')) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** The searchable surface of an item or a place. */
export interface SearchFields {
  name: string;
  description?: string | null;
  tags?: string[] | null;
}

/** A name hit counts for more than a hit anywhere else. */
const NAME_HIT = 3;
const OTHER_HIT = 1;
/** Bonus for the whole query appearing verbatim in the name, and for leading it. */
const PHRASE_BONUS = 5;
const PREFIX_BONUS = 3;
/** Scaled by the fraction of query tokens matched, so fuller matches win. */
const COVERAGE_BONUS = 2;

function contains(haystack: string, token: string): boolean {
  return haystack.includes(token) || haystack.includes(stem(token));
}

/**
 * Relevance of one entity to a query. 0 means "no token matched" — the caller
 * drops it. A blank query scores every entity equally (nothing is filtered).
 */
export function scoreEntity(fields: SearchFields, query: string): number {
  const tokens = tokenize(query);
  if (tokens.length === 0) return 1;

  const name = (fields.name ?? '').toLowerCase();
  const rest = [fields.description ?? '', (fields.tags ?? []).join(' ')]
    .join(' ')
    .toLowerCase();

  let score = 0;
  let hits = 0;
  for (const token of tokens) {
    if (contains(name, token)) {
      score += NAME_HIT;
      hits += 1;
    } else if (contains(rest, token)) {
      score += OTHER_HIT;
      hits += 1;
    }
  }
  if (hits === 0) return 0;

  score += (hits / tokens.length) * COVERAGE_BONUS;

  const phrase = query.trim().toLowerCase();
  if (phrase && name.includes(phrase)) {
    score += PHRASE_BONUS;
    if (name.startsWith(phrase)) score += PREFIX_BONUS;
  }
  return score;
}

/**
 * Filter + sort a list by relevance to `query`. A blank query returns the list
 * unchanged (same order), so the caller can use this unconditionally.
 */
export function rankBySearch<T>(
  entities: T[],
  query: string,
  toFields: (entity: T) => SearchFields,
): T[] {
  if (tokenize(query).length === 0) return [...entities];
  return entities
    .map((entity) => ({ entity, fields: toFields(entity), score: scoreEntity(toFields(entity), query) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || (a.fields.name ?? '').localeCompare(b.fields.name ?? ''))
    .map((r) => r.entity);
}
