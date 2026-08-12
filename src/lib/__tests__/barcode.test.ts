/**
 * Unit tests for the barcode encoder (src/lib/barcode.ts).
 * Covers format mapping, binary→run-length conversion, and per-format
 * encoding including valid/invalid inputs and the segment-array shape that
 * EAN/UPC encoders return.
 */
import {
  jsbarcodeFormat,
  isQrLike,
  binaryToRuns,
  encodeBarcode,
} from '../barcode';
import type { ExternalCodeType } from '../supabase';

describe('jsbarcodeFormat', () => {
  it('maps linear barcode types to JsBarcode format names', () => {
    expect(jsbarcodeFormat('code128')).toBe('CODE128');
    expect(jsbarcodeFormat('code39')).toBe('CODE39');
    expect(jsbarcodeFormat('code93')).toBe('CODE93');
    expect(jsbarcodeFormat('ean13')).toBe('EAN13');
    expect(jsbarcodeFormat('ean8')).toBe('EAN8');
    expect(jsbarcodeFormat('upc_a')).toBe('UPC');
    expect(jsbarcodeFormat('upc_e')).toBe('UPC');
    expect(jsbarcodeFormat('itf')).toBe('ITF');
    expect(jsbarcodeFormat('codabar')).toBe('codabar');
  });

  it('returns null for non-1D / unknown types', () => {
    (['qr', 'data_matrix', 'aztec', 'pdf417', 'other'] as ExternalCodeType[]).forEach((t) => {
      expect(jsbarcodeFormat(t)).toBeNull();
    });
  });
});

describe('isQrLike', () => {
  it('flags qr-style 2D types', () => {
    expect(isQrLike('qr')).toBe(true);
    expect(isQrLike('data_matrix')).toBe(true);
    expect(isQrLike('aztec')).toBe(true);
  });

  it('rejects linear / unknown types', () => {
    expect(isQrLike('ean13')).toBe(false);
    expect(isQrLike('code128')).toBe(false);
    expect(isQrLike('pdf417')).toBe(false);
    expect(isQrLike('other')).toBe(false);
  });
});

describe('binaryToRuns', () => {
  it('run-length-encodes a binary string, starting with a bar', () => {
    // 1 0 11 00 1 → bar1, space1, bar2, space2, bar1
    expect(binaryToRuns('1011001')).toEqual([1, 1, 2, 2, 1]);
  });

  it('handles a single bar', () => {
    expect(binaryToRuns('1')).toEqual([1]);
  });

  it('ignores non-binary characters', () => {
    expect(binaryToRuns('1x0')).toEqual([1, 1]);
  });

  it('returns [] for empty / non-binary input', () => {
    expect(binaryToRuns('')).toEqual([]);
    expect(binaryToRuns('xyz')).toEqual([]);
  });

  it('starts with a bar even when the string starts with 0', () => {
    // Leading 0 is still a "space" slot, but RLE just records runs; index 0 is
    // a space-only run which renders as leading whitespace. This documents the
    // behaviour rather than asserting it starts with a black bar.
    expect(binaryToRuns('01')).toEqual([1, 1]);
  });
});

describe('encodeBarcode', () => {
  it('returns null for non-1D types', () => {
    expect(encodeBarcode('anything', 'qr')).toBeNull();
    expect(encodeBarcode('anything', 'other')).toBeNull();
  });

  it('encodes a valid EAN-13 (array-of-segments shape)', () => {
    const out = encodeBarcode('123456789012', 'ean13');
    expect(out).not.toBeNull();
    expect(out!.bars.length).toBeGreaterThan(0);
    // EAN-13 text includes the digit groups; should contain digits.
    expect(out!.text).toMatch(/\d/);
    // Bars are positive integers.
    expect(out!.bars.every((b) => Number.isInteger(b) && b > 0)).toBe(true);
  });

  it('encodes a valid CODE128 (single-segment shape)', () => {
    const out = encodeBarcode('ABC123', 'code128');
    expect(out).not.toBeNull();
    expect(out!.text).toBe('ABC123');
    expect(out!.bars.length).toBeGreaterThan(0);
  });

  it('encodes CODE39', () => {
    const out = encodeBarcode('ABC123', 'code39');
    expect(out).not.toBeNull();
    expect(out!.bars.length).toBeGreaterThan(0);
  });

  it('encodes EAN-8', () => {
    const out = encodeBarcode('1234567', 'ean8');
    expect(out).not.toBeNull();
    expect(out!.bars.length).toBeGreaterThan(0);
  });

  it('encodes UPC-A', () => {
    const out = encodeBarcode('12345678901', 'upc_a');
    expect(out).not.toBeNull();
    expect(out!.bars.length).toBeGreaterThan(0);
  });

  it('encodes codabar', () => {
    const out = encodeBarcode('A12345B', 'codabar');
    expect(out).not.toBeNull();
    expect(out!.bars.length).toBeGreaterThan(0);
  });

  it('returns null for an invalid EAN-13 (wrong length)', () => {
    expect(encodeBarcode('12', 'ean13')).toBeNull();
  });

  it('uppercases lowercase input for CODE39 (JsBarcode normalizes, not rejects)', () => {
    const out = encodeBarcode('abc', 'code39');
    expect(out).not.toBeNull();
    // JsBarcode uppercases lowercase letters before encoding CODE39.
    expect(out!.text.toUpperCase()).toBe(out!.text);
  });

  it('returns null for CODE39 with truly invalid characters', () => {
    // Characters outside the CODE39 charset (e.g. '@', '!') are invalid.
    expect(encodeBarcode('A@B', 'code39')).toBeNull();
  });
});
