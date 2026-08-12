/** Print/share helpers for app-QR codes.
 *
 *  Uses expo-print to render a one-code PDF label and expo-sharing to surface
 *  the system share sheet (AirPrint / save / send). The PDF is built from the
 *  existing buildPrintHtml, which lays out a scannable QR + name + kind. */
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { buildPrintHtml, type PrintableCode } from './qrcode';

/**
 * Render a single entity's QR to a PDF and open the share sheet.
 * Returns true if shared, false if sharing is unavailable on this device.
 */
export async function printAndShareCode(code: PrintableCode): Promise<boolean> {
  const html = await buildPrintHtml([code]);
  const { uri } = await Print.printToFileAsync({ html });
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'StuffSearch codes' });
  return true;
}
