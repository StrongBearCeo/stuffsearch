#!/usr/bin/env python3
"""Verify generated label-sheet PDFs: render each label's exact cell region
at laser-print resolution and machine-decode its QR (pyzbar/zbar), asserting
the decoded value equals the spec value for that cell.

Whole-page scanning is NOT a valid check here: zbar's line-scan finder
detection drops symbols on large dense images, while real phone scanners
(ML Kit / AVFoundation) do dense full-frame detection. Cropping each cell
proves every printed QR is decodable AND sits in the right grid slot.

Usage: python verify-label-pdfs.py <spec.json> <pdf> [--dpi 600]
Exit 0 only if every QR decodes and matches its expected value.
"""
import argparse
import json
import sys

import pymupdf
from PIL import Image
from pyzbar import pyzbar

MM = 72 / 25.4


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("spec", help="label-sheet spec JSON (ground truth values)")
    ap.add_argument("pdf")
    ap.add_argument("--dpi", type=int, default=600)
    args = ap.parse_args()

    with open(args.spec, encoding="utf-8") as f:
        spec = json.load(f)
    grid, cell = spec["grid"], spec["cell"]

    doc = pymupdf.open(args.pdf)
    pages = {lbl["page"]: [] for lbl in spec["labels"]}
    for lbl in spec["labels"]:
        pages[lbl["page"]].append(lbl)

    total = bad = 0
    for page_no, labels in sorted(pages.items()):
        page = doc[page_no]
        for lbl in labels:
            x0 = grid["leftMm"] + lbl["col"] * cell["widthMm"]
            y0 = grid["topMm"] + lbl["row"] * cell["heightMm"]
            rect = pymupdf.Rect(x0 * MM, y0 * MM,
                                (x0 + cell["widthMm"]) * MM, (y0 + cell["heightMm"]) * MM)
            pix = page.get_pixmap(dpi=args.dpi, clip=rect, colorspace=pymupdf.csGRAY)
            img = Image.frombytes("L", (pix.width, pix.height), pix.samples)
            decoded = [r.data.decode("ascii") for r in pyzbar.decode(img) if r.type == "QRCODE"]
            total += 1
            if lbl["value"] not in decoded:
                bad += 1
                if bad <= 10:
                    print(f"MISMATCH page {page_no} cell ({lbl['col']},{lbl['row']}): "
                          f"expected {lbl['value']}, decoded {decoded}")
        print(f"page {page_no}: {len(labels)} labels checked "
              f"({total - bad} ok, {bad} bad so far)")

    status = "PASS" if bad == 0 else "FAIL"
    print(f"{status} {args.pdf}: {total - bad}/{total} QRs decode correctly at {args.dpi}dpi")
    return 0 if bad == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
