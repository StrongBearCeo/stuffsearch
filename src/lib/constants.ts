/** App-wide constants: deep-link scheme, storage paths, barcode type mapping. */
import type { ExternalCodeType } from './supabase';

export const APP_SCHEME = 'stuffsearch';

/** Household short id used in deep-links (first 8 chars of the uuid). */
export function householdShortId(id: string): string {
  return id.replace(/-/g, '').slice(0, 8);
}

/**
 * Build a deep-link for an app-generated token.
 *   stuffsearch://item/<token>?h=<short>
 *   stuffsearch://place/<token>?h=<short>
 *   stuffsearch://invite/<token>
 */
export function buildDeepLink(
  kind: 'item' | 'place' | 'invite',
  token: string,
  householdId?: string,
): string {
  const h = householdId ? `?h=${householdShortId(householdId)}` : '';
  return `${APP_SCHEME}://${kind}/${token}${h}`;
}

/** Map an expo-barcode-scanner `type` string to our external_code_type enum. */
export function scannerTypeToCodeType(type: string): ExternalCodeType {
  const t = type.toLowerCase();
  if (t.includes('qr')) return 'qr';
  if (t.includes('128')) return 'code128';
  if (t.includes('39')) return 'code39';
  if (t.includes('93')) return 'code93';
  if (t === 'ean13') return 'ean13';
  if (t === 'ean8') return 'ean8';
  if (t.includes('upc_a') || t === 'upc') return 'upc_a';
  if (t.includes('upc_e')) return 'upc_e';
  if (t.includes('codabar')) return 'codabar';
  if (t.includes('itf') || t.includes('interleaved')) return 'itf';
  if (t.includes('datamatrix')) return 'data_matrix';
  if (t.includes('pdf417')) return 'pdf417';
  if (t.includes('aztec')) return 'aztec';
  return 'other';
}

/** Is this code type a retail product barcode (EAN/UPC)? Drives product lookup. */
export function isProductBarcode(type: ExternalCodeType): boolean {
  return type === 'ean13' || type === 'ean8' || type === 'upc_a' || type === 'upc_e';
}

/** Storage path convention: <uid>/<householdId>/<entity>/<filename>. */
export function storagePath(
  userId: string,
  householdId: string,
  entity: 'items' | 'places',
  filename: string,
): string {
  return `${userId}/${householdId}/${entity}/${filename}`;
}
