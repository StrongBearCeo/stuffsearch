/** Tests for preprinted label-sheet planning (src/lib/labelSheet.ts). */
import {
  LABEL_ALPHABET,
  LABEL_BODY_LENGTH,
  LABEL_PREFIX,
  generateLabelValues,
  planSheet,
  cellOrigin,
  paginate,
  PAPERS,
} from '../labelSheet';

// qrcode ships CommonJS with no __esModule — require, same as src/lib/qrcode.ts.
const QRCodeLib = require('qrcode') as {
  create: (text: string, opts: { errorCorrectionLevel: string }) => { modules: { size: number } };
};

describe('generateLabelValues', () => {
  it('produces SS-<8 chars> from the unambiguous alphabet only', () => {
    const values = generateLabelValues(50);
    expect(values).toHaveLength(50);
    for (const v of values) {
      expect(v).toMatch(new RegExp(`^${LABEL_PREFIX}-[{${LABEL_ALPHABET}}]{${LABEL_BODY_LENGTH}}$`));
      // No visually ambiguous characters anywhere in the body.
      expect(v.slice(3)).not.toMatch(/[01ILO]/);
    }
  });

  it('never repeats a value within a run', () => {
    const values = generateLabelValues(500);
    expect(new Set(values).size).toBe(500);
  });

  it('honours exclude so re-runs cannot collide with previous batches', () => {
    // rng draws alphabet[15] ('H') for the first 8 calls, then alphabet[3]:
    // run 1 gets SS-HHHHHHHH; run 2 retries past the excluded value.
    const makeRng = (flipAt: number) => {
      let n = 0;
      return () => (n++ < flipAt ? 0.5 : 0.1);
    };
    const first = generateLabelValues(1, { rng: makeRng(8) });
    expect(first[0]).toBe('SS-HHHHHHHH');
    const second = generateLabelValues(1, { rng: makeRng(8), exclude: first });
    expect(second[0]).not.toBe(first[0]);
  });

  it('throws instead of hanging when the rng can only produce excluded values', () => {
    // A constant rng with the one reachable value excluded used to loop forever.
    expect(() =>
      generateLabelValues(1, { rng: () => 0.5, exclude: ['SS-HHHHHHHH'] }),
    ).toThrow(/gave up/);
  });

  it('is deterministic with an injected rng', () => {
    // Simple LCG so the sequence is stable across runs of the test itself.
    let seed = 42;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    expect(generateLabelValues(10, { rng })).toEqual(generateLabelValues(10, { rng: (() => {
      let s = 42;
      return () => {
        s = (s * 1103515245 + 12345) % 2147483648;
        return s / 2147483648;
      };
    })() }));
  });
});

describe('planSheet', () => {
  it('fits 11 x 14 = 154 default labels on A4', () => {
    const plan = planSheet(PAPERS.a4);
    expect(plan.cols).toBe(11);
    expect(plan.rows).toBe(14);
    expect(plan.perPage).toBe(154);
    // Cell = QR pattern incl. quiet zones: (21 + 2*3) * 0.65 = 17.55mm.
    expect(plan.metrics.cellWidthMm).toBeCloseTo(17.55, 6);
    expect(plan.metrics.cellHeightMm).toBeCloseTo(19.1, 6);
  });

  it('fits 11 x 13 = 143 default labels on Letter', () => {
    const plan = planSheet(PAPERS.letter);
    expect(plan.cols).toBe(11);
    expect(plan.rows).toBe(13);
    expect(plan.perPage).toBe(143);
  });

  it('keeps every cell inside the printable area with footer room on A4', () => {
    const plan = planSheet(PAPERS.a4);
    const rightEdge = plan.gridLeftMm + plan.cols * plan.metrics.cellWidthMm;
    const bottomEdge = plan.gridTopMm + plan.rows * plan.metrics.cellHeightMm;
    expect(plan.gridLeftMm).toBeGreaterThanOrEqual(plan.minMarginMm);
    expect(plan.gridTopMm).toBeGreaterThanOrEqual(plan.minMarginMm);
    expect(rightEdge).toBeLessThanOrEqual(PAPERS.a4.widthMm - plan.minMarginMm);
    expect(bottomEdge).toBeLessThanOrEqual(PAPERS.a4.heightMm - plan.minMarginMm - 10);
  });

  it('centers the grid horizontally and puts slack above, not below', () => {
    const plan = planSheet(PAPERS.a4);
    const slack = PAPERS.a4.widthMm - plan.cols * plan.metrics.cellWidthMm;
    expect(plan.gridLeftMm).toBeCloseTo(slack / 2, 6);
    // Vertical slack from centering is added on top of the min margin only.
    expect(plan.gridTopMm).toBeGreaterThanOrEqual(5);
  });

  it('scales the grid with a custom module size', () => {
    const bigger = planSheet(PAPERS.a4, { moduleMm: 0.8 });
    expect(bigger.metrics.cellWidthMm).toBeCloseTo(21.6, 6);
    expect(bigger.cols).toBeLessThan(planSheet(PAPERS.a4).cols);
  });

  it('clamps degenerate paper sizes to at least one cell', () => {
    const tiny = planSheet({ name: 'a4', widthMm: 15, heightMm: 15 });
    expect(tiny.cols).toBe(1);
    expect(tiny.rows).toBe(1);
  });
});

describe('cellOrigin', () => {
  it('places cells left-to-right, top-to-bottom inside the grid', () => {
    const plan = planSheet(PAPERS.a4);
    const first = cellOrigin(plan, 0, 0);
    const nextCol = cellOrigin(plan, 1, 0);
    const nextRow = cellOrigin(plan, 0, 1);
    expect(nextCol.xMm - first.xMm).toBeCloseTo(plan.metrics.cellWidthMm, 6);
    expect(nextRow.yMm - first.yMm).toBeCloseTo(plan.metrics.cellHeightMm, 6);
    expect(first).toEqual({ xMm: plan.gridLeftMm, yMm: plan.gridTopMm });
  });
});

describe('paginate', () => {
  it('chunks row-major with a partial last page', () => {
    expect(paginate([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns an empty list for no labels', () => {
    expect(paginate([], 10)).toEqual([]);
  });

  it('rejects an invalid page size', () => {
    expect(() => paginate([1], 0)).toThrow();
  });
});

describe('QR sizing assumption', () => {
  it('SS-XXXXXXXX values encode as version-1 (21 module) QR at ECC M', () => {
    // The whole layout is tuned to a 21x21 symbol; if a value ever pushed the
    // QR to version 2 (25 modules) the printed cells would be misaligned.
    const sample = [...generateLabelValues(20), 'SS-23456789'];
    for (const value of sample) {
      const qr = QRCodeLib.create(value, { errorCorrectionLevel: 'M' });
      expect(qr.modules.size).toBe(21);
    }
  });
});
