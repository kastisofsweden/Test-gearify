import { describe, expect, it } from "vitest";

import {
  CONTENT_WIDTH_MM,
  LABEL,
  LABEL_FOOTER,
  categoryText,
  labelGrid,
  layoutBatch,
  layoutLabel,
  lineInk,
  pdfSafe,
  printInstruction,
  truncate,
  unitIdText,
  wrapName,
  type LabelLayout,
  type TextLine,
} from "./productLabel";

// Code 128 widths without quiet zones: "DCB100" = 101 modules, "DCB001CE001" = 156, "4C5F1C4281" = 134.
const SHORT = 101;
const SN = 156;
const PRODUCT = 134;
// QR sizes without quiet zone: version 1 (short code) and version 4 (https://renthub.se/i/<32 hex>).
const QR_V1 = 21;
const QR_V4 = 33;
const LONG_NAME =
  "Confidence monitor 65″ på lågt stativ med extra lång beskrivning som aldrig tar slut";
const UNIT_ID = "S/N: DCB001CE001";
const PRODUCT_ID = "S/N: 4C5F1C4281";
const MIN_MODULE = (2 / 300) * 25.4;

/** Every template/size the app can produce. */
const SAMPLES: [string, LabelLayout][] = [
  [
    "30 side, product",
    layoutLabel("Stativkjol", PRODUCT, undefined, "accessories", QR_V1, PRODUCT_ID)!,
  ],
  [
    "30 side, unit long name",
    layoutLabel(LONG_NAME, SN, undefined, "stands-mounts", QR_V4, UNIT_ID)!,
  ],
  ["40 side (forced)", layoutLabel("Stativkjol", PRODUCT, 40, "accessories", QR_V1, PRODUCT_ID)!],
  ["40 stacked (long code)", layoutLabel(LONG_NAME, 300, undefined, "cables", QR_V4, UNIT_ID)!],
];

const textLines = (l: LabelLayout): TextLine[] => [
  l.id,
  ...l.name,
  ...(l.category ? [l.category] : []),
];

describe("Renthub label grid (DK-22205, 62 mm continuous)", () => {
  it("produces 62 x 30 side labels and 62 x 40 reserve labels", () => {
    expect(SAMPLES.map(([, l]) => [l.heightMm, l.mode])).toEqual([
      [30, "side"],
      [30, "side"],
      [40, "side"],
      [40, "stacked"],
    ]);
  });

  it("uses 2.5 mm padding left, right and bottom and a 5 mm content top on every size", () => {
    for (const h of [30, 40]) {
      const g = labelGrid(h);
      expect(g.left).toBe(2.5);
      expect(LABEL.widthMm - g.right).toBe(2.5);
      expect(h - g.bottom).toBe(2.5);
      expect(g.top).toBe(5);
    }
    expect(CONTENT_WIDTH_MM).toBe(57);
  });

  it("puts the QR square at the content box left/top, at least 18 mm, never below 4 dots per module", () => {
    for (const [, l] of SAMPLES) {
      expect(l.qr.x).toBe(l.grid.left);
      expect(l.qr.y).toBe(l.grid.top);
      expect(l.qr.w).toBe(l.qr.h);
      expect(l.qr.w).toBeGreaterThanOrEqual(18);
      expect(l.qr.w / QR_V4).toBeGreaterThanOrEqual((4 / 300) * 25.4 - 1e-9);
    }
  });

  it("starts the right column exactly 2 mm right of the QR and ends it at the content right edge", () => {
    for (const [, l] of SAMPLES) {
      for (const t of textLines(l)) {
        expect(t.x).toBeCloseTo(l.qr.x + l.qr.w + 2, 9);
        expect(t.x + t.w).toBeCloseTo(l.grid.right, 9);
      }
    }
  });

  it("aligns the side barcode's bars to the text column on both edges and its bottom to the QR bottom", () => {
    for (const [, l] of SAMPLES.filter(([, s]) => s.mode === "side")) {
      expect(l.bar.x).toBeCloseTo(l.id.x, 9);
      expect(l.bar.x + l.bar.w).toBeCloseTo(l.grid.right, 9);
      expect(l.bar.y + l.bar.h).toBeCloseTo(l.qr.y + l.qr.h, 9);
      expect(l.bar.h).toBeGreaterThanOrEqual(6);
    }
  });

  it("runs the stacked barcode from the QR's left edge to the column's right edge", () => {
    const [, l] = SAMPLES[3]!;
    expect(l.bar.x).toBe(l.qr.x);
    expect(l.bar.x + l.bar.w).toBeCloseTo(l.grid.right, 9);
    expect(l.bar.y).toBeGreaterThanOrEqual(l.qr.y + l.qr.h + 2 - 1e-9);
  });

  it("keeps Code 128 modules at 2 printer dots or wider", () => {
    for (const [, l] of SAMPLES) expect(l.bar.moduleMm).toBeGreaterThanOrEqual(MIN_MODULE - 1e-9);
    expect(SAMPLES[0]![1].bar.moduleMm).toBeCloseTo(SAMPLES[0]![1].bar.w / PRODUCT, 9);
  });

  it("puts the first text line's glyph top level with the QR top", () => {
    for (const [, l] of SAMPLES) expect(lineInk(l.id).top).toBeCloseTo(l.qr.y, 6);
  });

  it("left-aligns the footer e-mail to the QR's left edge with its glyph bottom on the content bottom", () => {
    for (const [, l] of SAMPLES) {
      expect(l.footer.text).toBe(LABEL_FOOTER);
      expect(l.footer.x).toBe(l.qr.x);
      expect(lineInk(l.footer).bottom).toBeCloseTo(l.grid.bottom, 6);
      expect(lineInk(l.footer).top).toBeGreaterThanOrEqual(
        Math.max(l.qr.y + l.qr.h, l.bar.y + l.bar.h) + 2 - 1e-6,
      );
    }
  });

  it("stacks text lines top to bottom without overlapping each other or the barcode", () => {
    for (const [, l] of SAMPLES) {
      const lines = textLines(l).map((t) => lineInk(t));
      for (let i = 1; i < lines.length; i++)
        expect(lines[i]!.top).toBeGreaterThan(lines[i - 1]!.bottom);
      expect(l.bar.y).toBeGreaterThan(lines[lines.length - 1]!.bottom);
    }
  });

  it("keeps the category on a 62 x 30 unit label with a two-line title", () => {
    const [, l] = SAMPLES[1]!;
    expect(l.name).toHaveLength(2);
    expect(l.category?.text).toBe("STANDS MOUNTS");
  });

  it("falls back to 62 x 40 mm only when the barcode can't be printed at 2 dots on 30 mm", () => {
    expect(layoutLabel("TV", SN, undefined, undefined, QR_V4, UNIT_ID)!.heightMm).toBe(30);
    expect(layoutLabel("TV", 300, undefined, undefined, QR_V4, UNIT_ID)!.heightMm).toBe(40);
    expect(layoutLabel("TV", 400)).toBeNull();
  });

  it("gives every label in a job the same page height", () => {
    const [a, b] = layoutBatch([
      { name: "TV", modules: SHORT, qrModules: QR_V1 },
      { name: LONG_NAME, modules: 300, category: "displays" },
    ]);
    expect([a!.heightMm, b!.heightMm]).toEqual([40, 40]);
    const [c, d] = layoutBatch([
      { name: "TV", modules: SHORT, qrModules: QR_V1 },
      { name: LONG_NAME, modules: SN, qrModules: QR_V4 },
    ]);
    expect([c!.heightMm, d!.heightMm]).toEqual([30, 30]);
  });

  it("prefixes serials with S/N: and keeps an explicit Nr: label", () => {
    expect(unitIdText("4C5F1C4281")).toBe("S/N: 4C5F1C4281");
    expect(unitIdText("S/N: DCB001CE001")).toBe("S/N: DCB001CE001");
    expect(unitIdText("Nr: RM-000123")).toBe("Nr: RM-000123");
  });

  it("fits the new S/N format (incl. overflow suffix) on 62 x 30 with a scannable barcode", () => {
    // Code 128 widths: "DCB007-AS001" = 167 modules, "DCB001-TV038-01" = 200, "DCB999-TV001-999" = 211.
    for (const [id, modules] of [
      ["DCB007-AS001", 167],
      ["DCB001-TV038-01", 200],
      ["DCB999-TV001-999", 211],
    ] as const) {
      const text = unitIdText(id);
      const l = layoutLabel("Stativkjol", modules, undefined, "accessories", QR_V4, text)!;
      expect([l.heightMm, l.mode]).toEqual([30, "side"]);
      expect(l.id.text).toBe(text);
      expect(text.length * 0.6 * l.id.fontMm).toBeLessThanOrEqual(l.id.w + 1e-9);
      expect(l.bar.moduleMm).toBeGreaterThanOrEqual(MIN_MODULE - 1e-9);
      expect(Math.abs(l.bar.x - l.id.x)).toBeLessThan(0.2);
    }
  });

  it("fits the full S/N in the column without truncation", () => {
    const l = layoutLabel("TV", SN, undefined, undefined, QR_V4, UNIT_ID)!;
    expect(UNIT_ID.length * 0.6 * l.id.fontMm).toBeLessThanOrEqual(l.id.w + 1e-9);
  });

  it("wraps long names onto two lines ending with an ellipsis and truncates single lines", () => {
    const lines = wrapName(LONG_NAME, 22);
    expect(lines).toHaveLength(2);
    expect(lines[1]!.endsWith("…")).toBe(true);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(22);
    expect(wrapName("75″ LED-TV")).toEqual(["75″ LED-TV"]);
    expect(truncate("S/N: RENTHUB-LONG-ID", (s) => s.length <= 12)).toBe("S/N: RENT...");
  });

  it("shows the category in capitals and the contact e-mail", () => {
    expect(categoryText("stands-mounts")).toBe("STANDS MOUNTS");
    expect(LABEL_FOOTER).toBe("rent@dreamgroupsweden.se");
  });

  it("names the document's actual format in the print instruction", () => {
    expect(printInstruction(30)).toContain("62 × 30 mm");
    expect(printInstruction(40)).toContain("62 × 40 mm");
    expect(printInstruction(30)).toContain("Headers and footers");
  });

  it("writes inch marks the PDF font can show", () => {
    expect(pdfSafe("Confidence monitor 55″")).toBe('Confidence monitor 55"');
  });
});
