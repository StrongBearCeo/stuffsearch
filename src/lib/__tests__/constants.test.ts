/**
 * Unit tests for the barcode code-type mapping and helpers in constants.ts.
 */
import {
  scannerTypeToCodeType,
  isProductBarcode,
  householdShortId,
  buildDeepLink,
  storagePath,
  APP_SCHEME,
} from '../constants';

describe('scannerTypeToCodeType', () => {
  it('maps qr', () => {
    expect(scannerTypeToCodeType('qr')).toBe('qr');
    expect(scannerTypeToCodeType('QR')).toBe('qr');
  });
  it('maps code128', () => {
    expect(scannerTypeToCodeType('code128')).toBe('code128');
    expect(scannerTypeToCodeType('org.iso.Code128')).toBe('code128');
  });
  it('maps code39 / code93', () => {
    expect(scannerTypeToCodeType('code39')).toBe('code39');
    expect(scannerTypeToCodeType('code93')).toBe('code93');
  });
  it('maps EAN-13 and EAN-8', () => {
    expect(scannerTypeToCodeType('ean13')).toBe('ean13');
    expect(scannerTypeToCodeType('ean8')).toBe('ean8');
  });
  it('maps UPC variants', () => {
    expect(scannerTypeToCodeType('upc_a')).toBe('upc_a');
    expect(scannerTypeToCodeType('upc')).toBe('upc_a'); // bare "upc" → upc_a
    expect(scannerTypeToCodeType('upc_e')).toBe('upc_e');
  });
  it('maps DataMatrix / PDF417 / Aztec', () => {
    expect(scannerTypeToCodeType('datamatrix')).toBe('data_matrix');
    expect(scannerTypeToCodeType('pdf417')).toBe('pdf417');
    expect(scannerTypeToCodeType('aztec')).toBe('aztec');
  });
  it('maps codabar and itf', () => {
    expect(scannerTypeToCodeType('codabar')).toBe('codabar');
    expect(scannerTypeToCodeType('itf')).toBe('itf');
    expect(scannerTypeToCodeType('interleaved2of5')).toBe('itf');
  });
  it('falls back to "other" for unknown types', () => {
    expect(scannerTypeToCodeType('unknownformat')).toBe('other');
    expect(scannerTypeToCodeType('')).toBe('other');
  });
});

describe('isProductBarcode', () => {
  it('returns true for EAN/UPC types', () => {
    expect(isProductBarcode('ean13')).toBe(true);
    expect(isProductBarcode('ean8')).toBe(true);
    expect(isProductBarcode('upc_a')).toBe(true);
    expect(isProductBarcode('upc_e')).toBe(true);
  });
  it('returns false for non-product types', () => {
    expect(isProductBarcode('qr')).toBe(false);
    expect(isProductBarcode('code128')).toBe(false);
    expect(isProductBarcode('other')).toBe(false);
  });
});

describe('householdShortId', () => {
  it('strips dashes and takes first 8 chars', () => {
    const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    expect(householdShortId(id)).toBe('a1b2c3d4');
  });
  it('returns the whole string if shorter than 8', () => {
    expect(householdShortId('abc123')).toBe('abc123');
  });
});

describe('buildDeepLink', () => {
  it('builds an item link with household short id', () => {
    const link = buildDeepLink('item', 'tok123', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    expect(link).toBe('stuffsearch://item/tok123?h=a1b2c3d4');
  });
  it('builds a place link', () => {
    expect(buildDeepLink('place', 'plc', 'abcdefgh-1234-5678-90ab-cdef12345678')).toBe(
      'stuffsearch://place/plc?h=abcdefgh',
    );
  });
  it('builds an invite link without household param', () => {
    expect(buildDeepLink('invite', 'invtok')).toBe('stuffsearch://invite/invtok');
  });
});

describe('storagePath', () => {
  it('builds the conventional storage key', () => {
    expect(storagePath('uid1', 'hh1', 'items', 'photo.jpg')).toBe('uid1/hh1/items/photo.jpg');
    expect(storagePath('uid1', 'hh1', 'places', 'tag.png')).toBe('uid1/hh1/places/tag.png');
  });
});

describe('APP_SCHEME', () => {
  it('is the stuffsearch scheme', () => {
    expect(APP_SCHEME).toBe('stuffsearch');
  });
});
