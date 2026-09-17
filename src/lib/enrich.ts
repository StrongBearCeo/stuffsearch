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
  links: string[];
  tags: string[];
  estimatedValue: number | null;
  valueCurrency?: string | null;
  valueSource: 'ai' | 'manual' | null;
}

/** What the enrich-item Edge Function may return. Every field is optional. */
export interface EnrichSuggestion {
  name?: string;
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

/** The fields the form offers a per-field ✨ button for. */
export const ENRICHABLE_FIELDS = [
  'name',
  'description',
  'tags',
  'links',
  'value',
] as const;

export type EnrichableField = (typeof ENRICHABLE_FIELDS)[number];

/**
 * Apply a suggestion to exactly ONE field, leaving the rest of the form alone.
 *
 * This backs the small ✨ button beside each field: "re-write just the
 * description", "just estimate the value". Everything `applyEnrichment`
 * guarantees still holds for the field being changed — links append rather
 * than replace, tags union — with one deliberate exception:
 *
 *   Asking for the VALUE explicitly overwrites a `value_source = 'manual'`
 *   number. Whole-form enrichment must never touch a value the user typed,
 *   because they didn't ask it to; tapping ✨ on the value field IS asking.
 *   That's what makes re-estimating an existing item possible at all — before,
 *   a value could only ever be set once, during creation.
 */
export function applyFieldEnrichment(
  current: EnrichSnapshot,
  suggestion: EnrichSuggestion,
  field: EnrichableField,
): EnrichPatch {
  const base: EnrichPatch = {
    name: current.name,
    description: current.description,
    links: [...current.links],
    tags: [...current.tags],
    estimatedValue: current.estimatedValue,
    valueCurrency: (current.valueCurrency || DEFAULT_CURRENCY).toUpperCase(),
    valueSource: current.valueSource,
  };

  switch (field) {
    case 'name':
      return { ...base, name: preferSuggested(current.name, suggestion.name) };
    case 'description':
      return { ...base, description: preferSuggested(current.description, suggestion.description) };
    case 'tags': {
      let tags = parseTagsInput(current.tags.join(','));
      for (const tag of suggestion.tags ?? []) tags = addTag(tags, tag);
      return { ...base, tags };
    }
    case 'links': {
      const incoming = [
        ...(suggestion.product_link ? [suggestion.product_link] : []),
        ...(suggestion.product_links ?? []),
      ];
      return { ...base, links: mergeLinks(current.links, incoming) };
    }
    case 'value': {
      const suggested =
        suggestion.estimated_value == null
          ? null
          : parseValueInput(String(suggestion.estimated_value));
      if (suggested == null) return base;
      return {
        ...base,
        estimatedValue: suggested,
        valueCurrency: (
          suggestion.value_currency ||
          current.valueCurrency ||
          DEFAULT_CURRENCY
        ).toUpperCase(),
        valueSource: 'ai',
      };
    }
  }
}
