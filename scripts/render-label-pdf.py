#!/usr/bin/env python3
"""Render a label-sheet spec JSON (from scripts/make-label-sheets.ts) into a
vector PDF using ReportLab. Pure drawing: all geometry comes from the spec,
which is produced by the tested logic in src/lib/labelSheet.ts.

Usage: python render-label-pdf.py <spec.json> -o <out.pdf>
"""
import argparse
import json
import sys

from reportlab.lib.colors import Color, black
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

# Cell text/block sizes (mm) — kept in sync with labelSheet.ts constants.
TEXT_SIZE_PT = 4.5
TEXT_GAP_MM = 1.0
CAP_HEIGHT_PT = TEXT_SIZE_PT * 0.72  # Helvetica cap height, places digit tops
FOOTER_SIZE_PT = 6
FOOTER_FROM_BOTTOM_MM = 7  # clear of the ~5mm worst-case laser unprintable zone


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("spec", help="label-sheet spec JSON path")
    ap.add_argument("-o", "--output", required=True, help="output PDF path")
    args = ap.parse_args()

    with open(args.spec, encoding="utf-8") as f:
        spec = json.load(f)

    paper = spec["paper"]
    W, H = paper["widthMm"], paper["heightMm"]
    grid, cell = spec["grid"], spec["cell"]
    cols, rows = grid["cols"], grid["rows"]
    cw, ch = cell["widthMm"], cell["heightMm"]
    left, top = grid["leftMm"], grid["topMm"]
    mod, quiet, nmod = cell["moduleMm"], cell["quietModules"], cell["qrModules"]

    c = canvas.Canvas(args.output, pagesize=(W * mm, H * mm))
    c.setTitle(f"StuffSearch preprinted label sheet ({paper['name'].upper()})")
    c.setAuthor("StuffSearch")
    c.setSubject("Preprinted QR labels for StuffSearch places and items")
    c.setCreator("StuffSearch label generator")

    # The spec uses top-left mm coordinates; PDF is bottom-left points.
    def X(x_mm: float) -> float:
        return x_mm * mm

    def Y(y_mm: float) -> float:
        return (H - y_mm) * mm

    gray_line = Color(0.72, 0.72, 0.72)
    gray_text = Color(0.45, 0.45, 0.45)

    pages: dict[int, list[dict]] = {}
    for lbl in spec["labels"]:
        pages.setdefault(lbl["page"], []).append(lbl)

    page_count = spec["pageCount"]
    for page in range(page_count):
        # Dashed cut guides across the whole grid, on the cell boundaries
        # (quiet zones inside each cell stay clean white).
        c.setStrokeColor(gray_line)
        c.setLineWidth(0.15 * mm)
        c.setDash(0.8 * mm, 0.8 * mm)
        for k in range(cols + 1):
            x = left + k * cw
            c.line(X(x), Y(top), X(x), Y(top + rows * ch))
        for k in range(rows + 1):
            y = top + k * ch
            c.line(X(left), Y(y), X(left + cols * cw), Y(y))
        c.setDash()

        for lbl in pages.get(page, []):
            ox = left + lbl["col"] * cw
            oy = top + lbl["row"] * ch  # top-left of the cell, mm from page top
            qx = ox + quiet * mod
            qy = oy + quiet * mod  # top of the QR pattern

            c.setFillColor(black)
            for r, rowstr in enumerate(lbl["qr"]):
                col = 0
                n = len(rowstr)
                while col < n:
                    if rowstr[col] == "1":
                        start = col
                        while col < n and rowstr[col] == "1":
                            col += 1
                        # Merge horizontal module runs into one filled rect.
                        c.rect(
                            X(qx + start * mod),
                            Y(qy + (r + 1) * mod),
                            (col - start) * mod * mm,
                            mod * mm,
                            stroke=0,
                            fill=1,
                        )
                    else:
                        col += 1

            # Human-readable value under the QR (lets the code be typed by
            # hand if a label is too damaged to scan).
            qr_bottom_mm = qy + nmod * mod
            baseline_mm = qr_bottom_mm + TEXT_GAP_MM + (CAP_HEIGHT_PT / 72) * 25.4
            c.setFont("Helvetica", TEXT_SIZE_PT)
            c.drawCentredString(X(ox + cw / 2), Y(baseline_mm), lbl["value"])

        c.setFont("Helvetica", FOOTER_SIZE_PT)
        c.setFillColor(gray_text)
        c.drawCentredString(
            X(W / 2),
            FOOTER_FROM_BOTTOM_MM * mm,
            f"StuffSearch preprinted labels · batch {spec['batchId']} · "
            f"page {page + 1}/{page_count} · cut on dashed lines · scan to attach",
        )
        c.showPage()

    c.save()
    return 0


if __name__ == "__main__":
    sys.exit(main())
