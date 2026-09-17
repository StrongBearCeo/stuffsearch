import { applyEnrichment, type EnrichSnapshot } from '../enrich';

const base: EnrichSnapshot = {
  name: '',
  description: '',
  links: [],
  tags: [],
  estimatedValue: null,
  valueSource: null,
};

describe('applyEnrichment', () => {
  it('fills empty fields from the suggestion', () => {
    const out = applyEnrichment(base, {
      name: 'Husky tile cutter',
      description: '24-inch manual cutter',
    });
    expect(out.name).toBe('Husky tile cutter');
    expect(out.description).toBe('24-inch manual cutter');
  });

  it('leaves a field alone when the suggestion is empty', () => {
    const out = applyEnrichment({ ...base, name: 'Mine', description: 'Mine too' }, {
      name: '',
      description: '   ',
    });
    expect(out.name).toBe('Mine');
    expect(out.description).toBe('Mine too');
  });

  it('APPENDS suggested links instead of replacing the user’s', () => {
    const out = applyEnrichment({ ...base, links: ['https://mine.com/p'] }, {
      product_links: ['https://shop.com/x'],
    });
    expect(out.links).toEqual(['https://mine.com/p', 'https://shop.com/x']);
  });

  it('accepts the legacy single product_link field', () => {
    const out = applyEnrichment({ ...base, links: ['https://mine.com'] }, {
      product_link: 'https://shop.com',
    });
    expect(out.links).toEqual(['https://mine.com', 'https://shop.com']);
  });

  it('never duplicates a link the item already has', () => {
    const out = applyEnrichment({ ...base, links: ['https://www.a.com/x/'] }, {
      product_links: ['http://a.com/x'],
    });
    expect(out.links).toEqual(['https://www.a.com/x/']);
  });

  it('unions suggested tags with the existing ones, normalized', () => {
    const out = applyEnrichment({ ...base, tags: ['return'] }, { tags: ['Tools', 'RETURN'] });
    expect(out.tags).toEqual(['return', 'tools']);
  });

  it('takes an AI value when the item has none', () => {
    const out = applyEnrichment(base, { estimated_value: 129.99, value_currency: 'eur' });
    expect(out.estimatedValue).toBe(129.99);
    expect(out.valueCurrency).toBe('EUR');
    expect(out.valueSource).toBe('ai');
  });

  it('defaults the currency when the model omits it', () => {
    const out = applyEnrichment(base, { estimated_value: 10 });
    expect(out.valueCurrency).toBe('USD');
  });

  it('replaces an earlier AI estimate', () => {
    const out = applyEnrichment({ ...base, estimatedValue: 50, valueSource: 'ai' }, {
      estimated_value: 70,
    });
    expect(out.estimatedValue).toBe(70);
  });

  it('NEVER overwrites a value the user typed by hand', () => {
    const out = applyEnrichment({ ...base, estimatedValue: 50, valueSource: 'manual' }, {
      estimated_value: 70,
    });
    expect(out.estimatedValue).toBe(50);
    expect(out.valueSource).toBe('manual');
  });

  it('ignores a nonsense value from the model', () => {
    expect(applyEnrichment(base, { estimated_value: -5 }).estimatedValue).toBeNull();
    expect(
      applyEnrichment(base, { estimated_value: 'lots' as unknown as number }).estimatedValue,
    ).toBeNull();
  });

  it('is a no-op for an empty suggestion', () => {
    const current: EnrichSnapshot = {
      name: 'A',
      description: 'B',
      links: ['https://a.com'],
      tags: ['t'],
      estimatedValue: 1,
      valueSource: 'ai',
    };
    const out = applyEnrichment(current, {});
    expect(out).toEqual({
      name: 'A',
      description: 'B',
      links: ['https://a.com'],
      tags: ['t'],
      estimatedValue: 1,
      valueCurrency: 'USD',
      valueSource: 'ai',
    });
  });
});
