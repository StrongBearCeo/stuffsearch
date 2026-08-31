/**
 * Product-link helpers.
 *
 * An item can carry several product links (`items.product_links`), with the
 * legacy single `items.product_link` column kept in sync as the first entry so
 * older data and older clients keep working.
 *
 * AI enrichment must never *replace* a link the user typed — `mergeLinks`
 * appends only what's genuinely new, comparing on a normalized key so
 * `https://www.a.com/x/` and `http://a.com/x` count as the same link.
 */
import { normalizeUrl } from './url';

/** Trim + add a scheme. Null for blank input. */
export function normalizeLink(raw: string | null | undefined): string | null {
  return normalizeUrl(raw);
}

/**
 * Comparison key for de-duplication: scheme, a leading `www.` and a trailing
 * slash are all ignored, and the host (but not the path) is lowercased.
 */
export function linkKey(url: string): string {
  const withoutScheme = url.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const slash = withoutScheme.indexOf('/');
  const host = (slash === -1 ? withoutScheme : withoutScheme.slice(0, slash))
    .toLowerCase()
    .replace(/^www\./, '');
  const rest = (slash === -1 ? '' : withoutScheme.slice(slash)).replace(/\/+$/, '');
  return `${host}${rest}`;
}

/**
 * Existing links first, in their original order, then any incoming link that
 * isn't already present. Blanks are dropped and bare domains get https://.
 */
export function mergeLinks(
  existing: string[] | null | undefined,
  incoming: string[] | null | undefined,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const list of [existing ?? [], incoming ?? []]) {
    for (const raw of list) {
      const link = normalizeLink(raw);
      if (!link) continue;
      const key = linkKey(link);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(link);
    }
  }
  return out;
}

/** The item columns this module reads. */
export interface LinkedItem {
  product_link?: string | null;
  product_links?: string[] | null;
}

/** Every link on an item: the legacy scalar first, then the array, deduped. */
export function itemLinks(item: LinkedItem): string[] {
  return mergeLinks(item.product_link ? [item.product_link] : [], item.product_links ?? []);
}

/** The link to mirror back into the legacy `product_link` column. */
export function primaryLink(links: string[]): string | null {
  return links.length > 0 ? links[0] : null;
}

/**
 * The two DB columns to write for a link list. `product_link` mirrors the
 * first entry so the legacy scalar column stays meaningful (older clients and
 * the convert-to-place RPC still read it).
 */
export function linkColumns(links: string[]): {
  product_links: string[];
  product_link: string | null;
} {
  const merged = mergeLinks(links, []);
  return { product_links: merged, product_link: primaryLink(merged) };
}
