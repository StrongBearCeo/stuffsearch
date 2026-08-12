/**
 * Unit tests for qrcode.ts (token generation + print HTML).
 * crypto.getRandomBytes is stubbed in jest.setup.ts for determinism.
 */
import { generateQrToken, appQrPayload, buildPrintHtml, type PrintableCode } from '../qrcode';

describe('generateQrToken', () => {
  it('returns a 36-char hex string (18 bytes)', () => {
    const token = generateQrToken();
    expect(token).toHaveLength(36);
    expect(token).toMatch(/^[0-9a-f]{36}$/);
  });

  it('is deterministic under the test stub', () => {
    // The stub fills bytes as (i*7+1)%256, so byte 0 = 1 → "01", byte 1 = 8 → "08", ...
    const token = generateQrToken();
    expect(token.slice(0, 4)).toBe('0108');
  });
});

describe('appQrPayload', () => {
  it('builds an item deep-link payload', () => {
    const payload = appQrPayload('item', 'mytoken', 'a1b2c3d4-eeee-ffff-0000-000000000000');
    expect(payload).toBe('stuffsearch://item/mytoken?h=a1b2c3d4');
  });

  it('builds a place deep-link payload', () => {
    const payload = appQrPayload('place', 'placetoken', 'abcd1234-abcd-abcd-abcd-abcdabcdabcd');
    expect(payload).toBe('stuffsearch://place/placetoken?h=abcd1234');
  });
});

describe('buildPrintHtml', () => {
  it('produces valid HTML with the codes embedded as real QR SVGs', async () => {
    const codes: PrintableCode[] = [
      { name: 'Hammer', payload: 'stuffsearch://item/t1?h=abcd1234', kind: 'item' },
      { name: 'Garage', payload: 'stuffsearch://place/t2?h=abcd1234', kind: 'place' },
    ];
    const html = await buildPrintHtml(codes);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Hammer');
    expect(html).toContain('Garage');
    // Each QR must be a real inline SVG, not an empty placeholder div.
    expect(html).toContain('<svg');
    expect(html).not.toContain('data-payload=');
    // kind labels
    expect(html).toContain('>item<');
    expect(html).toContain('>place<');
  });

  it('escapes HTML in names', async () => {
    const codes: PrintableCode[] = [
      { name: '<script>alert(1)</script>', payload: 'x', kind: 'item' },
    ];
    const html = await buildPrintHtml(codes);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders an empty grid for no codes', async () => {
    const html = await buildPrintHtml([]);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('StuffSearch codes');
  });
});
