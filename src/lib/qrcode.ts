/**
 * QR code generation for app-printed tokens + a printable HTML sheet.
 * App codes are ALWAYS auto-generated random tokens (never custom content).
 */
import Crypto from 'expo-crypto';
import { buildDeepLink } from './constants';

/** Generate an unguessable token for an app-QR code. */
export function generateQrToken(): string {
  // 18 random bytes → 36 hex chars. Same entropy as invite_token.
  const bytes = Crypto.getRandomBytes(18);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The payload encoded into an app-QR: a stuffsearch:// deep-link. */
export function appQrPayload(
  kind: 'item' | 'place',
  token: string,
  householdId: string,
): string {
  return buildDeepLink(kind, token, householdId);
}

/** Build a printable HTML page of QR labels for a set of entities. */
export interface PrintableCode {
  name: string;
  payload: string;
  kind: 'item' | 'place';
}

export function buildPrintHtml(codes: PrintableCode[]): string {
  const cards = codes
    .map(
      (c) => `
      <div class="card">
        <div class="qr" data-payload="${c.payload}"></div>
        <div class="label">${escapeHtml(c.name)}</div>
        <div class="sub">${c.kind}</div>
      </div>`,
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"/>
  <title>StuffSearch codes</title>
  <style>
    body{font-family:-apple-system,system-ui,sans-serif;margin:16px;}
    h1{font-size:18px;}
    .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;}
    .card{border:1px solid #ddd;border-radius:8px;padding:12px;text-align:center;page-break-inside:avoid;}
    .qr{width:120px;height:120px;margin:0 auto 8px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;}
    .label{font-weight:600;font-size:14px;}
    .sub{font-size:11px;color:#6b7280;text-transform:uppercase;}
    @media print{body{margin:0;}}
  </style></head>
  <body><h1>StuffSearch codes</h1><div class="grid">${cards}</div>
  <script>
    // QR rendering is done natively by expo-print's render; this is a fallback
    // for share-to-PDF. The native print path overlays real QR images.
  </script>
  </body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
