/**
 * Merging an AI enrichment suggestion into what the user already has.
 *
 * The rule that matters: enrichment ADDS, it does not clobber.
 *   - a product link the user typed is kept, and any link the model found is
 *     appended to the list rather than replacing it;
 *   - a value the user corrected by hand (`value_source = 'manual'`) is never
 *     overwritten by a later estimate;
 *   - suggested tags union with the existing ones;
 *   - text fields only change when the model actually returned something.
 */
import { mergeLinks } from './links';
import { addTag, parseTagsInput } from './tags';
import { parseValueInput, DEFAULT_CURRENCY } from './value';

/** The item as it currently stands in the form. */
export interface EnrichSnapshot {
  name: string;
  description: string;
  category: string;
  links: string[];
  tags: string[];
  estimatedValue: number | null;
  valueCurrency?: string | null;
  valueSource: 'ai' | 'manual' | null;
}

/** What the enrich-item Edge Function may return. Every field is optional. */
export interface EnrichSuggestion {
  name?: string;
  category?: string;
  description?: string;
  /** Legacy single-link field, still accepted. */
  product_link?: string;
  product_links?: string[];
  tags?: string[];
  estimated_value?: number;
  value_currency?: string;
}

export interface EnrichPatch {
  name: string;
  description: string;
  category: string;
  links: string[];
  tags: string[];
  estimatedValue: number | null;
  valueCurrency: string;
  valueSource: 'ai' | 'manual' | null;
}

/** Keep the current text unless the suggestion has something non-blank. */
function preferSuggested(current: string, suggested: string | undefined): string {
  const s = (suggested ?? '').trim();
  return s || current;
}

export function applyEnrichment(
  current: EnrichSnapshot,
  suggestion: EnrichSuggestion,
): EnrichPatch {
  const incomingLinks = [
    ...(suggestion.product_link ? [suggestion.product_link] : []),
    ...(suggestion.product_links ?? []),
  ];

  let tags = parseTagsInput(current.tags.join(','));
  for (const tag of suggestion.tags ?? []) tags = addTag(tags, tag);

  // A hand-set value is the user's answer; only fill in or refresh an estimate.
  const suggestedValue =
    suggestion.estimated_value == null
      ? null
      : parseValueInput(String(suggestion.estimated_value));
  const takeValue = current.valueSource !== 'manual' && suggestedValue != null;

  return {
    name: preferSuggested(current.name, suggestion.name),
    description: preferSuggested(current.description, suggestion.description),
    category: preferSuggested(current.category, suggestion.category),
    links: mergeLinks(current.links, incomingLinks),
    tags,
    estimatedValue: takeValue ? suggestedValue : current.estimatedValue,
    valueCurrency: (takeValue
      ? suggestion.value_currency || current.valueCurrency || DEFAULT_CURRENCY
      : current.valueCurrency || DEFAULT_CURRENCY
    ).toUpperCase(),
    valueSource: takeValue ? 'ai' : current.valueSource,
  };
}
