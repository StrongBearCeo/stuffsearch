/**
 * Item value helpers — parsing what the user types, formatting money, and
 * totalling a household's estimated asset value.
 *
 * Money is held as a plain number of major units (dollars, not cents) in
 * `items.estimated_value`, matching the numeric(14,2) column. All arithmetic
 * here rounds through cents so a list of 0.1 + 0.2 totals 0.30, not
 * 0.30000000000000004.
 *
 * Formatting is deliberately hand-rolled rather than Intl.NumberFormat: Hermes
 * ships a partial Intl and the exact output would then differ per device,
 * which makes both the UI and these tests unpredictable.
 */

export const DEFAULT_CURRENCY = 'USD';

/** Currency code → prefix symbol. Anything unlisted prints as "CODE 1.00". */
const SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  VND: '₫',
  JPY: '¥',
  AUD: '$',
  CAD: '$',
};

/** Round to whole cents (away from zero on a .5 tie, like a receipt). */
function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Parse a user-typed value ("$1,234.56", "1 234.5", "12") into a number.
 * Returns null for blank, non-numeric or negative input — the caller treats
 * that as "no value set" rather than as an error.
 */
export function parseValueInput(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Drop everything that isn't a digit, a dot or a leading minus: currency
  // symbols, thin spaces, and thousands separators all disappear.
  const cleaned = trimmed.replace(/[^0-9.-]/g, '');
  if (!cleaned || !/^-?\d*\.?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return toCents(n) / 100;
}

/** Group digits into thousands: 1234567.5 → "1,234,567.50". */
function groupedFixed2(amount: number): string {
  const cents = toCents(Math.abs(amount));
  const whole = Math.floor(cents / 100).toString();
  const frac = (cents % 100).toString().padStart(2, '0');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${amount < 0 ? '-' : ''}${grouped}.${frac}`;
}

/** Format an amount for display, e.g. `$1,234.50`. */
export function formatMoney(amount: number, currency?: string | null): string {
  const code = (currency || DEFAULT_CURRENCY).toUpperCase();
  const symbol = SYMBOLS[code];
  const body = groupedFixed2(amount);
  return symbol ? `${symbol}${body}` : `${code} ${body}`;
}

/** The bits of an item this module cares about. */
export interface ValuedEntity {
  estimated_value: number | null;
  value_currency?: string | null;
}

export interface CurrencyTotal {
  currency: string;
  total: number;
  count: number;
}

/**
 * Sum estimated values per currency. Items with no value are skipped; a null
 * currency counts as the default. Sorted by total descending so the dominant
 * currency leads the summary line.
 */
export function totalsByCurrency(items: ValuedEntity[]): CurrencyTotal[] {
  const cents = new Map<string, { cents: number; count: number }>();
  for (const it of items) {
    const v = it?.estimated_value;
    if (v == null || !Number.isFinite(v)) continue;
    const code = (it.value_currency || DEFAULT_CURRENCY).toUpperCase();
    const acc = cents.get(code) ?? { cents: 0, count: 0 };
    acc.cents += toCents(v);
    acc.count += 1;
    cents.set(code, acc);
  }
  return [...cents.entries()]
    .map(([currency, { cents: c, count }]) => ({ currency, total: c / 100, count }))
    .sort((a, b) => b.total - a.total || a.currency.localeCompare(b.currency));
}

export interface ValueSummary {
  totals: CurrencyTotal[];
  /** How many items carry a value. */
  valued: number;
  /** How many don't — shown as "N not valued yet". */
  unvalued: number;
}

/** Totals plus the valued / unvalued split, for a list header. */
export function summarizeValue(items: ValuedEntity[]): ValueSummary {
  const totals = totalsByCurrency(items);
  const valued = totals.reduce((n, t) => n + t.count, 0);
  return { totals, valued, unvalued: items.length - valued };
}

/** Render totals as one line: "$12.00 + €3.00". Empty when nothing is valued. */
export function formatTotals(totals: CurrencyTotal[]): string {
  return totals.map((t) => formatMoney(t.total, t.currency)).join(' + ');
}
