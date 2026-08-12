// Scratch QR tool: decode an existing PNG, generate a test QR, decode it back.
// Run with: node scripts/qr_tool.js
// Uses libs from the scratch npm dir resolved via NODE_PATH.
const path = require('path');
const fs = require('fs');
const PNG = require('pngjs').PNG;
const jsQR = require('jsqr');
const QRCode = require('qrcode');

const PROJ = 'C:/Users/hv/projects/stuffsearch';
const EXISTING = path.join(PROJ, 'expo_qr.png');
const OUT = path.join(PROJ, 'test_qr.png');

// A realistic test payload matching the app's deep-link format:
//   stuffsearch://item/<token>?h=<short>
const TEST_PAYLOAD = 'stuffsearch://item/1f3a9c0e7b2245d8a6f0c4e9b8a1d2f3e4a5b6c7?h=4a2b1c9d';

function decodePng(file) {
  const buf = fs.readFileSync(file);
  const png = PNG.sync.read(buf);
  const { data, width, height } = png;
  const code = jsQR(data, width, height);
  return code ? { text: code.data, width, height } : { text: null, width, height };
}

(async () => {
  // 1) Decode the existing expo_qr.png
  console.log('--- existing expo_qr.png ---');
  if (fs.existsSync(EXISTING)) {
    const d = decodePng(EXISTING);
    console.log('dimensions:', d.width + 'x' + d.height);
    console.log('decoded payload:', JSON.stringify(d.text));
  } else {
    console.log('not found');
  }

  // 2) Generate a fresh test QR from a known payload
  console.log('\n--- generating test_qr.png ---');
  console.log('intended payload:', JSON.stringify(TEST_PAYLOAD));
  await QRCode.toFile(OUT, TEST_PAYLOAD, {
    errorCorrectionLevel: 'M',
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
    width: 480,
  });
  console.log('written to:', OUT);

  // 3) Decode it back to confirm round-trip
  console.log('\n--- round-trip decode of test_qr.png ---');
  const d = decodePng(OUT);
  console.log('decoded payload:', JSON.stringify(d.text));
  console.log('matches intended:', d.text === TEST_PAYLOAD);
})();