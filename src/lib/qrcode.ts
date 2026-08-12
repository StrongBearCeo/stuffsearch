/**
 * QR code generation for app-printed tokens + a printable HTML sheet.
 * App codes are ALWAYS auto-generated random tokens (never custom content).
 */
import { getRandomBytes } from 'expo-crypto';
import { buildDeepLink } from './constants';

/** Generate an unguessable token for an app-QR code. */
export function generateQrToken(): string {
  // 18 random bytes → 36 hex chars. Same entropy as invite_token.
  // Named import: expo-crypto ships ESM with named exports and no default
  // export, so `import Crypto from 'expo-crypto'` was `undefined` at runtime
  // (Metro) and `Crypto.getRandomBytes` threw "Cannot read property
  // 'getRandomBytes' of undefined".
  const bytes = getRandomBytes(18);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The payload encoded into an app-QR: a stuffsearch:// deep-link. */
export function appQrPayload(
  kind: 'item' | 'place',
  token: string,
  householdId?: string,
): string {
  return buildDeepLink(kind, token, householdId);
}

/** Build a printable HTML page of QR labels for a set of entities.
 *  Async because each QR is rendered to an inline SVG via the `qrcode` lib
 *  (so the resulting PDF actually contains scannable codes, not empty boxes). */
export interface PrintableCode {
  name: string;
  payload: string;
  kind: 'item' | 'place';
}

// qrcode is CommonJS with no __esModule/.default — use require to avoid the
// Metro/Babel interop trap where `import QR from 'qrcode'` resolves to undefined.
const QRCodeLib = require('qrcode') as { toString: (text: string, opts: { type: string }) => Promise<string> };

export async function buildPrintHtml(codes: PrintableCode[]): Promise<string> {
  // Render each payload to an inline SVG so the QR is baked into the HTML/PDF.
  const cards = await Promise.all(
    codes.map(async (c) => {
      const svg = await QRCodeLib.toString(c.payload, { type: 'svg' });
      return `
      <div class="card">
        <div class="qr">${svg}</div>
        <div class="label">${escapeHtml(c.name)}</div>
        <div class="sub">${c.kind}</div>
      </div>`;
    }),
  );
  return `<!doctype html><html><head><meta charset="utf-8"/>
  <title>StuffSearch codes</title>
  <style>
    body{font-family:-apple-system,system-ui,sans-serif;margin:16px;}
    h1{font-size:18px;}
    .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;}
    .card{border:1px solid #ddd;border-radius:8px;padding:12px;text-align:center;page-break-inside:avoid;}
    .qr{width:120px;height:120px;margin:0 auto 8px;display:flex;align-items:center;justify-content:center;}
    .qr svg{width:120px;height:120px;}
    .label{font-weight:600;font-size:14px;margin-top:4px;}
    .sub{font-size:11px;color:#6b7280;text-transform:uppercase;}
    @media print{body{margin:0;}}
  </style></head>
  <body><h1>StuffSearch codes</h1><div class="grid">${cards.join('')}</div>
  </body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
