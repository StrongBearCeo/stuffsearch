/**
 * Pure barcode encoding helpers.
 *
 * Turns a scanned code value + our `ExternalCodeType` into a machine-readable
 * run-length description that a renderer can draw (1D bars) or delegates QR /
 * 2D-matrix types to a dedicated QR renderer (handled by the caller).
 *
 * Backed by `jsbarcode`'s pure encoder modules (no DOM/canvas needed). Kept
 * free of React/RN so it is unit-testable directly.
 */
// jsbarcode ships as CommonJS with no `__esModule`/`.default`, so an ESM
// default import resolves to `undefined` under Metro/Babel interop (the app
// crashes at runtime). Use require to get the function itself.
const JsBarcode = require('jsbarcode') as unknown as JsBarcodeWithModules;
import type { ExternalCodeType } from './supabase';

/** Result of a successful 1D encode: run lengths in module units, starting
 *  with a BAR (black). Even indices (0-based) are bars, odd indices are spaces.
 *  e.g. [2,1,1,2] → bar-2, space-1, bar-1, space-2. `text` is the human-readable
 *  value the barcode represents (may include a computed check digit). */
export interface BarcodeEncoding {
  bars: number[];
  text: string;
}

/** JsBarcode format name for a given external code type, or null if the type
 *  is not a 1D linear barcode this encoder can draw (e.g. qr / 2D matrix / unknown). */
export function jsbarcodeFormat(codeType: ExternalCodeType): string | null {
  switch (codeType) {
    case 'code128':
      return 'CODE128';
    case 'code39':
      return 'CODE39';
    case 'code93':
      return 'CODE93';
    case 'ean13':
      return 'EAN13';
    case 'ean8':
      return 'EAN8';
    case 'upc_a':
    case 'upc_e':
      // JsBarcode's UPC module renders UPC-A. UPC-E decodes to UPC-A; render as
      // UPC-A (still scannable as the same GTIN).
      return 'UPC';
    case 'itf':
      return 'ITF';
    case 'codabar':
      return 'codabar';
    default:
      // qr, data_matrix, pdf417, aztec, other → not a 1D linear barcode here.
      return null;
  }
}

/** Is this code type renderable as a QR-style 2D code by the QR renderer? */
export function isQrLike(codeType: ExternalCodeType): boolean {
  return codeType === 'qr' || codeType === 'data_matrix' || codeType === 'aztec';
}

/** A single segment returned by a JsBarcode encoder. */
interface Segment {
  data: string;
  text?: string;
}

/** Internal JsBarcode encoder surface (the public typings omit getModule,
 *  but it's a stable runtime export used here to access the pure encoders
 *  without a DOM/canvas). */
interface JsBarcodeEncoder {
  valid(): boolean;
  encode(): Segment | Segment[];
}
interface JsBarcodeWithModules {
  getModule(format: string): new (value: string, options: Record<string, unknown>) => JsBarcodeEncoder;
}

/** Convert a binary string ("10110...") to run lengths starting with a bar.
 *  RLE-encodes consecutive equal digits. */
export function binaryToRuns(binary: string): number[] {
  const runs: number[] = [];
  let prev: string | null = null;
  for (const ch of binary) {
    if (ch === '0' || ch === '1') {
      if (prev === null || ch !== prev) {
        runs.push(1);
        prev = ch;
      } else {
        runs[runs.length - 1]++;
      }
    }
  }
  return runs;
}

/** Normalize JsBarcode's encode() output (which is either a single segment
 *  object or an array of segments) into a flat run-length + text. */
function normalizeEncode(out: Segment | Segment[]): BarcodeEncoding | null {
  const segs: Segment[] = Array.isArray(out) ? out : [out];
  if (segs.length === 0) return null;
  const binary = segs.map((s) => s.data).join('');
  const text = segs.map((s) => s.text ?? '').join('');
  if (!binary) return null;
  return { bars: binaryToRuns(binary), text };
}

/**
 * Encode a 1D linear barcode. Returns null if the type isn't a renderable 1D
 * format or the value is invalid for the format.
 */
export function encodeBarcode(
  value: string,
  codeType: ExternalCodeType,
): BarcodeEncoding | null {
  const fmt = jsbarcodeFormat(codeType);
  if (!fmt) return null;
  try {
    const Module = JsBarcode.getModule(fmt);
    const enc = new Module(value, {});
    if (!enc.valid()) return null;
    const out = enc.encode();
    return normalizeEncode(out);
  } catch {
    // Invalid value for the format (wrong length, bad chars, etc.).
    return null;
  }
}
