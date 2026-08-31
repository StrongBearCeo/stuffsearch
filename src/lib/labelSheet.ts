/**
 * Preprinted label-sheet planning for external-code labels.
 *
 * The app can bind ANY raw scanned value to a place/item (scan → no match →
 * "create with this code", or attach from a detail screen), so labels can be
 * printed BEFORE anything exists: each carries a unique random `SS-XXXXXXXX`
 * value, encoded as a small QR. Stick label → scan in app → attach/create.
 *
 * This module is the pure planning half (values + grid geometry); the actual
 * PDF drawing lives in `scripts/` and consumes the JSON spec produced here.
 */

/** Alphabet for the random body: digits + letters, minus visually ambiguous
 * 0/O, 1/I/L so a human can read a damaged label back correctly. */
export const LABEL_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/** Value shape: `SS-` + LABEL_BODY_LENGTH chars from LABEL_ALPHABET.
 *  31^8 ≈ 8.5e11 combos — collision odds across a household's worth of
 *  labels are negligible, and 11 chars still fits QR version 1 at ECC M
 *  (capacity 14 alphanumeric), keeping every label 21×21 modules. */
export const LABEL_PREFIX = 'SS';
export const LABEL_BODY_LENGTH = 8;

/** A QR version-1 symbol is 21×21 modules; `SS-XXXXXXXX` is 11 alnum chars,
 *  which fits version 1 with error correction M. */
export const LABEL_QR_MODULES = 21;

export interface GenerateLabelValuesOptions {
  /** Uniform random in [0, 1); injectable for deterministic tests. */
  rng?: () => number;
  /** Values to never emit (e.g. already-printed batches). */
  exclude?: Iterable<string>;
}

/** Generate `count` unique label values, e.g. `SS-7K2M9Q4T`. */
export function generateLabelValues(
  count: number,
  opts: GenerateLabelValuesOptions = {},
): string[] {
  const rng = opts.rng ?? Math.random;
  const taken = new Set<string>(opts.exclude ?? []);
  const out: string[] = [];
  // A degenerate rng (constant output) or an exclude list covering every
  // reachable value would otherwise retry the same candidate forever.
  const maxAttempts = 1000 * count + 10_000;
  let attempts = 0;
  while (out.length < count) {
    if (++attempts > maxAttempts) {
      throw new Error(
        'generateLabelValues: gave up finding unique values (rng too weak or exclude too large)',
      );
    }
    let body = '';
    for (let i = 0; i < LABEL_BODY_LENGTH; i++) {
      body += LABEL_ALPHABET[Math.floor(rng() * LABEL_ALPHABET.length)];
    }
    const value = `${LABEL_PREFIX}-${body}`;
    if (!taken.has(value)) {
      taken.add(value);
      out.push(value);
    }
  }
  return out;
}

export type PaperName = 'a4' | 'letter';

export interface PaperSize {
  name: PaperName;
  /** Width in mm (portrait). */
  widthMm: number;
  /** Height in mm (portrait). */
  heightMm: number;
}

export const PAPERS: Record<PaperName, PaperSize> = {
  a4: { name: 'a4', widthMm: 210, heightMm: 297 },
  letter: { name: 'letter', widthMm: 215.9, heightMm: 279.4 },
};

/** Default QR module size. 0.65mm → a 13.65mm QR: comfortably above the
 *  ~10mm floor for phone cameras, small enough to fit 11 columns on A4. */
export const DEFAULT_MODULE_MM = 0.65;

/** Quiet zone around the QR, in modules. The ISO spec says 4; phone ML
 * scanners work reliably with 3, which buys an extra column of labels. */
export const QUIET_MODULES = 3;

/** Text block height reserved under the QR (4.5pt line). */
export const TEXT_LINE_MM = 1.6;
export const TEXT_GAP_MM = 1.0;
export const BOTTOM_PAD_MM = 0.9;

/** Keep at least this much clear paper on every side (laser printable area
 *  typically starts ~4.2mm from the edge). */
export const MIN_MARGIN_MM = 5;

/** Extra room reserved below the grid for the page footer line. */
export const FOOTER_RESERVE_MM = 10;

export interface SheetMetrics {
  moduleMm: number;
  qrModules: number;
  /** Full QR pattern size incl. quiet zone, in mm. */
  patternMm: number;
  cellWidthMm: number;
  cellHeightMm: number;
}

export interface SheetPlan {
  paper: PaperSize;
  metrics: SheetMetrics;
  cols: number;
  rows: number;
  perPage: number;
  /** Left edge of the grid (grid is horizontally centered), mm. */
  gridLeftMm: number;
  /** Top edge of the grid, mm. */
  gridTopMm: number;
  minMarginMm: number;
}

export interface PlanSheetOptions {
  moduleMm?: number;
  qrModules?: number;
  minMarginMm?: number;
  footerReserveMm?: number;
}

/** Compute the label grid for one page: fit as many cells as possible while
 *  keeping min margins, a footer strip at the bottom, and centered slack. */
export function planSheet(paper: PaperSize, opts: PlanSheetOptions = {}): SheetPlan {
  const moduleMm = opts.moduleMm ?? DEFAULT_MODULE_MM;
  const qrModules = opts.qrModules ?? LABEL_QR_MODULES;
  const minMarginMm = opts.minMarginMm ?? MIN_MARGIN_MM;
  const footerReserveMm = opts.footerReserveMm ?? FOOTER_RESERVE_MM;

  const patternMm = (qrModules + 2 * QUIET_MODULES) * moduleMm;
  const cellWidthMm = patternMm;
  const cellHeightMm =
    QUIET_MODULES * moduleMm + // top quiet zone
    qrModules * moduleMm + // the QR itself
    TEXT_GAP_MM +
    TEXT_LINE_MM +
    BOTTOM_PAD_MM;

  const usableWidthMm = paper.widthMm - 2 * minMarginMm;
  const usableHeightMm = paper.heightMm - minMarginMm - footerReserveMm - minMarginMm;
  const cols = Math.max(1, Math.floor(usableWidthMm / cellWidthMm));
  const rows = Math.max(1, Math.floor(usableHeightMm / cellHeightMm));

  const gridWidthMm = cols * cellWidthMm;
  const gridHeightMm = rows * cellHeightMm;
  // Horizontal slack is split left/right; vertical slack goes above the grid
  // so the footer strip stays glued to the bottom margin.
  const gridLeftMm = (paper.widthMm - gridWidthMm) / 2;
  const gridTopMm = minMarginMm + (usableHeightMm - gridHeightMm) / 2;

  return {
    paper,
    metrics: { moduleMm, qrModules, patternMm, cellWidthMm, cellHeightMm },
    cols,
    rows,
    perPage: cols * rows,
    gridLeftMm,
    gridTopMm,
    minMarginMm,
  };
}

/** Top-left corner of the cell at (col, row), in mm from the page's
 *  top-left corner (the renderer converts to PDF bottom-left points). */
export function cellOrigin(plan: SheetPlan, col: number, row: number): { xMm: number; yMm: number } {
  return {
    xMm: plan.gridLeftMm + col * plan.metrics.cellWidthMm,
    yMm: plan.gridTopMm + row * plan.metrics.cellHeightMm,
  };
}

/** Split values into per-page chunks in row-major reading order. */
export function paginate<T>(items: T[], perPage: number): T[][] {
  if (perPage < 1) throw new Error('perPage must be >= 1');
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += perPage) pages.push(items.slice(i, i + perPage));
  return pages;
}
