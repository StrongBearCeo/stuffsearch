/**
 * make-label-sheets — generate printable preprinted label PDFs.
 *
 * Produces a JSON render spec (values + QR matrices + grid geometry) from the
 * tested logic in src/lib/labelSheet.ts, then shells out to the ReportLab
 * renderer (scripts/render-label-pdf.py) to draw the actual PDF.
 *
 * Usage:
 *   npx -y tsx scripts/make-label-sheets.ts [--paper a4|letter|both]
 *        [--pages N] [--module MM] [--out DIR]
 *
 * Output: dist/labels/stuffsearch-labels-<paper>.pdf + printed-values.json
 * (the manifest is re-read on the next run so batches never repeat a value).
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

import {
  PAPERS,
  generateLabelValues,
  paginate,
  planSheet,
  type PaperName,
} from '../src/lib/labelSheet';

// qrcode is CommonJS with no __esModule — require, same as src/lib/qrcode.ts.
const QRCodeLib = require('qrcode') as {
  create: (
    text: string,
    opts: { errorCorrectionLevel: string },
  ) => { modules: { size: number; data: Uint8Array } };
};

interface Args {
  paper: PaperName | 'both';
  pages: number;
  moduleMm: number;
  outDir: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { paper: 'both', pages: 4, moduleMm: 0.65, outDir: 'dist/labels' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--paper') {
      const v = next();
      if (v !== 'a4' && v !== 'letter' && v !== 'both') throw new Error(`--paper must be a4|letter|both, got ${v}`);
      args.paper = v;
    } else if (a === '--pages') {
      args.pages = Math.max(1, Math.floor(Number(next())));
    } else if (a === '--module') {
      args.moduleMm = Number(next());
      if (!(args.moduleMm >= 0.4 && args.moduleMm <= 1.2)) {
        throw new Error('--module must be between 0.4 and 1.2 (mm)');
      }
    } else if (a === '--out') {
      args.outDir = next();
    } else {
      throw new Error(`unknown argument: ${a}`);
    }
  }
  return args;
}

/** QR matrix as strings of '0'/'1', one per module row (top row first). */
function qrRows(value: string, qrModules: number): string[] {
  const qr = QRCodeLib.create(value, { errorCorrectionLevel: 'M' });
  if (qr.modules.size !== qrModules) {
    throw new Error(
      `value ${value} encodes as a ${qr.modules.size}-module QR; layout assumes ${qrModules}. ` +
        'Shorten LABEL_BODY_LENGTH or bump the layout constant.',
    );
  }
  const { size, data } = qr.modules;
  const rows: string[] = [];
  for (let r = 0; r < size; r++) {
    let row = '';
    for (let c = 0; c < size; c++) row += data[r * size + c] ? '1' : '0';
    rows.push(row);
  }
  return rows;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(args.outDir);
  mkdirSync(outDir, { recursive: true });

  const papers: PaperName[] = args.paper === 'both' ? ['a4', 'letter'] : [args.paper];
  const manifestPath = path.join(outDir, 'printed-values.json');
  const alreadyPrinted: string[] = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as string[])
    : [];

  const batchId = `${new Date().toISOString().slice(0, 10)}-${randomBytes(2).toString('hex')}`;

  // One value stream shared across papers would waste the overlap; instead
  // every paper size gets its own fresh, globally-unique set.
  const allValues = [...alreadyPrinted];
  const outputs: { paper: PaperName; pdf: string; labels: number }[] = [];

  for (const paperName of papers) {
    const paper = PAPERS[paperName];
    const plan = planSheet(paper, { moduleMm: args.moduleMm });
    const count = args.pages * plan.perPage;
    const values = generateLabelValues(count, { exclude: allValues });
    allValues.push(...values);

    const spec = {
      batchId,
      paper: { name: paper.name, widthMm: paper.widthMm, heightMm: paper.heightMm },
      grid: {
        cols: plan.cols,
        rows: plan.rows,
        leftMm: plan.gridLeftMm,
        topMm: plan.gridTopMm,
      },
      cell: {
        widthMm: plan.metrics.cellWidthMm,
        heightMm: plan.metrics.cellHeightMm,
        moduleMm: plan.metrics.moduleMm,
        qrModules: plan.metrics.qrModules,
        quietModules: 3,
      },
      labels: paginate(values, plan.perPage).flatMap((pageValues, page) =>
        pageValues.map((value, i) => ({
          value,
          page,
          col: i % plan.cols,
          row: Math.floor(i / plan.cols),
          qr: qrRows(value, plan.metrics.qrModules),
        })),
      ),
      pageCount: args.pages,
    };

    const specPath = path.join(outDir, `spec-${paperName}.json`);
    writeFileSync(specPath, JSON.stringify(spec));
    const pdfPath = path.join(outDir, `stuffsearch-labels-${paperName}.pdf`);
    const renderer = path.resolve(__dirname, 'render-label-pdf.py');
    // Windows py-launcher first (picks the interpreter that has ReportLab),
    // then plain names for other setups.
    const candidates: { cmd: string; args: string[] }[] = [
      { cmd: 'py', args: ['-3.13', renderer, specPath, '-o', pdfPath] },
      { cmd: 'python', args: [renderer, specPath, '-o', pdfPath] },
      { cmd: 'python3', args: [renderer, specPath, '-o', pdfPath] },
    ];
    let res: ReturnType<typeof spawnSync> | undefined;
    for (const cand of candidates) {
      res = spawnSync(cand.cmd, cand.args, { stdio: 'inherit' });
      if (res.error === undefined) break; // launcher existed; stop retrying
    }
    if (!res || res.status !== 0) {
      throw new Error(
        `PDF renderer failed for ${paperName} (exit ${res?.status ?? 'n/a'}). ` +
          'Needs Python 3 with reportlab: pip install reportlab',
      );
    }
    outputs.push({ paper: paperName, pdf: pdfPath, labels: count });
  }

  writeFileSync(manifestPath, JSON.stringify(allValues, null, 2));

  console.log(`\nBatch ${batchId}`);
  for (const o of outputs) {
    console.log(`  ${o.paper.toUpperCase()}: ${o.labels} labels -> ${o.pdf}`);
  }
  console.log(`  value manifest: ${manifestPath}`);
}

main();
