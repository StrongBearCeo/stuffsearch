/**
 * Unit tests for SINGLE-FIELD enrichment.
 *
 * The ✨ button next to each field asks the model to fill in just that field.
 * Everything else on the form must come back untouched — including a link the
 * user typed and a value they corrected by hand, which whole-form enrichment
 * already promises to preserve.
 */
import { applyFieldEnrichment, ENRICHABLE_FIELDS, type EnrichSnapshot } from '../enrich';

const current: EnrichSnapshot = {
  name: 'Old name',
  description: 'Old description',
  links: ['https://mine.com/p'],
  tags: ['mine'],
  estimatedValue: 5,
  valueCurrency: 'USD',
  valueSource: 'manual',
};

const suggestion = {
  name: 'Husky tile cutter',
  description: '24-inch manual cutter',
  product_links: ['https://shop.com/x'],
  tags: ['tools', 'tiling'],
  estimated_value: 120,
  value_currency: 'USD',
};

describe('applyFieldEnrichment', () => {
  it('updates ONLY the named field', () => {
    const out = applyFieldEnrichment(current, suggestion, 'name');
    expect(out.name).toBe('Husky tile cutter');
    expect(out.description).toBe('Old description');
    expect(out.links).toEqual(['https://mine.com/p']);
    expect(out.tags).toEqual(['mine']);
    expect(out.estimatedValue).toBe(5);
  });

  it('updates the description alone', () => {
    const out = applyFieldEnrichment(current, suggestion, 'description');
    expect(out.description).toBe('24-inch manual cutter');
    expect(out.name).toBe('Old name');
  });

  it('APPENDS links rather than replacing the user’s', () => {
    const out = applyFieldEnrichment(current, suggestion, 'links');
    expect(out.links).toEqual(['https://mine.com/p', 'https://shop.com/x']);
    expect(out.name).toBe('Old name');
  });

  it('UNIONS tags rather than replacing them', () => {
    const out = applyFieldEnrichment(current, suggestion, 'tags');
    expect(out.tags).toEqual(['mine', 'tools', 'tiling']);
    expect(out.name).toBe('Old name');
  });

  it('OVERWRITES a hand-set value when the value field is asked for explicitly', () => {
    // Whole-form enrichment must never clobber a manual value, but tapping ✨
    // on the value field IS the user asking for a fresh estimate.
    const out = applyFieldEnrichment(current, suggestion, 'value');
    expect(out.estimatedValue).toBe(120);
    expect(out.valueCurrency).toBe('USD');
    expect(out.valueSource).toBe('ai');
    expect(out.name).toBe('Old name');
  });

  it('leaves the value alone when the model returned none', () => {
    const out = applyFieldEnrichment(current, { name: 'x' }, 'value');
    expect(out.estimatedValue).toBe(5);
    expect(out.valueSource).toBe('manual');
  });

  it('leaves a text field alone when the suggestion is blank', () => {
    const out = applyFieldEnrichment(current, { name: '   ' }, 'name');
    expect(out.name).toBe('Old name');
  });

  it('never returns the same object it was given', () => {
    const out = applyFieldEnrichment(current, suggestion, 'name');
    expect(out).not.toBe(current);
    expect(current.name).toBe('Old name');
  });

  it('normalizes the currency to upper case', () => {
    const out = applyFieldEnrichment(
      { ...current, valueSource: null },
      { estimated_value: 9, value_currency: 'eur' },
      'value',
    );
    expect(out.valueCurrency).toBe('EUR');
  });

  it('covers every field the UI offers a ✨ button for', () => {
    expect(ENRICHABLE_FIELDS).toEqual([
      'name',
      'description',
      'tags',
      'links',
      'value',
    ]);
    // Each one must be applicable without throwing.
    for (const field of ENRICHABLE_FIELDS) {
      expect(() => applyFieldEnrichment(current, suggestion, field)).not.toThrow();
    }
  });
});
