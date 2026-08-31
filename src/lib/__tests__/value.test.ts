import {
  DEFAULT_CURRENCY,
  parseValueInput,
  formatMoney,
  totalsByCurrency,
  summarizeValue,
  formatTotals,
} from '../value';

describe('parseValueInput', () => {
  it('parses a plain number', () => {
    expect(parseValueInput('12')).toBe(12);
    expect(parseValueInput('12.5')).toBe(12.5);
  });

  it('strips currency symbols and thousands separators', () => {
    expect(parseValueInput('$1,234.56')).toBe(1234.56);
    expect(parseValueInput('€ 1 234.5')).toBe(1234.5);
    expect(parseValueInput('1,000')).toBe(1000);
  });

  it('rounds to two decimals', () => {
    expect(parseValueInput('10.005')).toBe(10.01);
    expect(parseValueInput('3.333')).toBe(3.33);
  });

  it('returns null for empty / non-numeric / negative input', () => {
    expect(parseValueInput('')).toBeNull();
    expect(parseValueInput('   ')).toBeNull();
    expect(parseValueInput('abc')).toBeNull();
    expect(parseValueInput('-5')).toBeNull();
    expect(parseValueInput(null)).toBeNull();
    expect(parseValueInput(undefined)).toBeNull();
  });

  it('accepts zero', () => {
    expect(parseValueInput('0')).toBe(0);
  });
});

describe('formatMoney', () => {
  it('formats with the currency symbol and grouped thousands', () => {
    expect(formatMoney(1234.5, 'USD')).toBe('$1,234.50');
    expect(formatMoney(0, 'USD')).toBe('$0.00');
    expect(formatMoney(1234567.89, 'USD')).toBe('$1,234,567.89');
  });

  it('knows a few common symbols', () => {
    expect(formatMoney(10, 'EUR')).toBe('€10.00');
    expect(formatMoney(10, 'GBP')).toBe('£10.00');
    expect(formatMoney(10, 'VND')).toBe('₫10.00');
  });

  it('falls back to the code as a prefix for unknown currencies', () => {
    expect(formatMoney(10, 'XYZ')).toBe('XYZ 10.00');
  });

  it('defaults the currency when none is given', () => {
    expect(formatMoney(5, null)).toBe('$5.00');
    expect(DEFAULT_CURRENCY).toBe('USD');
  });
});

describe('totalsByCurrency', () => {
  const item = (estimated_value: number | null, value_currency: string | null = 'USD') => ({
    estimated_value,
    value_currency,
  });

  it('sums values per currency, biggest total first', () => {
    expect(totalsByCurrency([item(10), item(5), item(100, 'EUR')])).toEqual([
      { currency: 'EUR', total: 100, count: 1 },
      { currency: 'USD', total: 15, count: 2 },
    ]);
  });

  it('skips items with no value', () => {
    expect(totalsByCurrency([item(null), item(7)])).toEqual([
      { currency: 'USD', total: 7, count: 1 },
    ]);
  });

  it('treats a missing currency as the default', () => {
    expect(totalsByCurrency([item(3, null)])).toEqual([
      { currency: 'USD', total: 3, count: 1 },
    ]);
  });

  it('returns an empty list when nothing is valued', () => {
    expect(totalsByCurrency([item(null), item(null)])).toEqual([]);
    expect(totalsByCurrency([])).toEqual([]);
  });

  it('avoids float drift when summing cents', () => {
    expect(totalsByCurrency([item(0.1), item(0.2)])).toEqual([
      { currency: 'USD', total: 0.3, count: 2 },
    ]);
  });
});

describe('summarizeValue', () => {
  it('reports valued / unvalued counts alongside the totals', () => {
    const s = summarizeValue([
      { estimated_value: 10, value_currency: 'USD' },
      { estimated_value: null, value_currency: null },
      { estimated_value: 2, value_currency: 'USD' },
    ]);
    expect(s.valued).toBe(2);
    expect(s.unvalued).toBe(1);
    expect(s.totals).toEqual([{ currency: 'USD', total: 12, count: 2 }]);
  });
});

describe('formatTotals', () => {
  it('joins multiple currencies', () => {
    expect(
      formatTotals([
        { currency: 'USD', total: 12, count: 2 },
        { currency: 'EUR', total: 3, count: 1 },
      ]),
    ).toBe('$12.00 + €3.00');
  });

  it('returns an empty string when there is nothing to total', () => {
    expect(formatTotals([])).toBe('');
  });
});
