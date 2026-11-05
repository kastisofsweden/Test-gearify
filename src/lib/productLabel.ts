// The one Renthub label for the Brother QL-1100c (300 dpi) with DK-22205 (62 mm continuous roll).
// Priority: 1 QR (largest, left), 2 Code 128, 3 S/N, 4 title, then category (if room) and the contact e-mail.
// Standard size is 62 × 30 mm; a job falls back to 62 × 40 mm only when the codes can't be printed
// scannably on 30 mm. One mm layout drives a single PDF, which is both the in-app preview and what gets
// printed/downloaded, so preview and print can never drift apart. All sizes are millimetres.
//
// Every template is placed on one grid (`labelGrid`): a content box inside fixed padding, the QR square at
// the content box's left/top, a fixed gap, and a right column whose text lines and barcode share the same
// left x and right edge. Positions refer to visible ink (QR modules, bars, glyph outlines), not to boxes
// with built-in white margins, so what lines up in the PDF lines up on the printed label.

import { inkMetrics, type MetricFont } from "./labelFontMetrics";

const DOT_MM = 25.4 / 300;

export const LABEL = {
  widthMm: 62,
  /** Standard compact label length. */
  heightMm: 30,
  /** Reserve length when the codes don't fit scannably on 30 mm. */
  fallbackHeightMm: 40,
  /** Safe padding on the left, right and bottom edges. */
  padMm: 2.5,
  /**
   * Content-box top on every size (QR top = first text line's glyph top). The Brother clipped glyph tops
   * printed 3.6 mm from the leading edge, so the content starts 5 mm down.
   */
  topMm: 5,
  /** Gap between the QR and the right column (and between QR and a full-width barcode below it). */
  gapMm: 2,
  /** Clear space between the bottom of the QR/barcode and the top of the footer glyphs. */
  footerGapMm: 2,
  /** QR side limits; never below 4 printer dots per module. */
  minQrMm: 18,
  maxQrMm: 24,
  minQrModuleMm: 4 * DOT_MM,
  /** Narrowest right column that still holds a readable title. */
  minColMm: 24,
  /** Vertical ink-to-ink gaps between rows of the right column. */
  idGapMm: 0.8,
  lineGapMm: 0.55,
  barGapMm: 0.9,
  /** Barcode height: stacked template, and the side template's maximum / minimum. */
  barHeightMm: 8,
  maxBarMm: 12,
  minBarHeightMm: 6,
  idFontMm: 3,
  minIdFontMm: 2.4,
  nameFontMm: 2.6,
  nameMaxLines: 2,
  categoryFontMm: 2.1,
  footerFontMm: 2.2,
  /** Narrowest Code 128 module that still scans at 300 dpi (2 printer dots). */
  minModuleMm: 2 * DOT_MM,
} as const;

/** Default footer e-mail (Dream Crazy Big / organizations without their own label e-mail). */
export const DEFAULT_LABEL_FOOTER = "rent@dreamgroupsweden.se";
/** @deprecated use DEFAULT_LABEL_FOOTER or LabelInput.footerEmail. */
export const LABEL_FOOTER = DEFAULT_LABEL_FOOTER;
export const CONTENT_WIDTH_MM = LABEL.widthMm - 2 * LABEL.padMm;

/** Print help; the size always follows the document's actual format. */
export function printInstruction(heightMm: number): string {
  return `Choose Brother QL-1100c, paper size 62 × ${formatMm(heightMm)} mm continuous roll, scale 100 % and one page per sheet. Avoid "Fit to page". Untick "Headers and footers". Enable auto cut in the Brother settings.`;
}

export const formatMm = (mm: number) =>
  Number.isInteger(mm) ? String(mm) : mm.toFixed(1).replace(".", ",");

/** What goes on one label. */
export type LabelInput = {
  name: string;
  /** Encoded in the QR code (unit labels: the public /i/<token> URL). */
  qrValue: string;
  /** Encoded in the Code 128 barcode: the S/N (serial_code) for both product and unit labels. */
  barcodeValue: string;
  /** Readable ID; printed as "S/N: …" (or "Nr: …" when given that way). */
  idText: string;
  /** Product category, printed small under the title when there is room. */
  category?: string | null | undefined;
  /** Footer e-mail from the owner organization's branding; DEFAULT_LABEL_FOOTER when empty. */
  footerEmail?: string | null | undefined;
  /** Black logo (PNG/JPEG/WebP URL) drawn right-aligned in the footer row; none = default layout. */
  logoUrl?: string | null | undefined;
};

/** "stands-mounts" -> "STANDS MOUNTS". */
export const categoryText = (c?: string | null) =>
  (c ?? "").replace(/[-_]+/g, " ").trim().toUpperCase();

/** Serials always read "S/N: …"; an ID already labelled "S/N:" or "Nr:" is kept as is. */
export const unitIdText = (id: string) => {
  const t = id.trim();
  return /^(S\/N|Nr):/i.test(t) ? t : `S/N: ${t}`;
};

export type Box = { x: number; y: number; w: number; h: number };
export type TextRole = "id" | "name" | "category" | "footer";
/** One text line: `x` is where the first glyph's ink starts, `w` the column width it must stay inside. */
export type TextLine = {
  text: string;
  role: TextRole;
  fontMm: number;
  x: number;
  w: number;
  baseline: number;
};

/** Embedded fonts (Liberation Mono Bold for IDs, Liberation Sans for text); metrics come from the same files. */
export const ROLE_FONT: Record<TextRole, MetricFont> = {
  id: "monoBold",
  name: "sansBold",
  category: "sans",
  footer: "sans",
};

/** Ink top/bottom (mm from the page top) and left bearing (mm) of a line as drawn. */
export function lineInk(
  line: Pick<TextLine, "text" | "role" | "fontMm" | "baseline">,
  text = line.text,
) {
  const m = inkMetrics(ROLE_FONT[line.role], text);
  return {
    top: line.baseline - m.top * line.fontMm,
    bottom: line.baseline - m.bottom * line.fontMm,
    left: m.left * line.fontMm,
  };
}

export type LabelGrid = {
  heightMm: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  contentW: number;
  /** Lowest y the QR/barcode may reach (footer glyph top minus the footer gap). */
  bodyBottom: number;
  footer: TextLine;
};

/** Single source of truth for every template's measurements. */
export function labelGrid(heightMm: number, footerText: string = DEFAULT_LABEL_FOOTER): LabelGrid {
  const L = LABEL;
  const left = L.padMm;
  const right = L.widthMm - L.padMm;
  const bottom = heightMm - L.padMm;
  const ink = inkMetrics(ROLE_FONT.footer, footerText);
  // Footer: left-aligned to the QR's left edge, glyph bottoms on the content box bottom.
  const baseline = bottom + ink.bottom * L.footerFontMm;
  const footer: TextLine = {
    text: footerText,
    role: "footer",
    fontMm: L.footerFontMm,
    x: left,
    w: right - left,
    baseline,
  };
  const bodyBottom = baseline - ink.top * L.footerFontMm - L.footerGapMm;
  return {
    heightMm,
    left,
    right,
    top: L.topMm,
    bottom,
    contentW: right - left,
    bodyBottom,
    footer,
  };
}

export type LabelLayout = {
  heightMm: number;
  /** side: QR left, text + barcode in the right column. stacked: barcode across the full width under the QR. */
  mode: "side" | "stacked";
  grid: LabelGrid;
  qr: Box;
  bar: Box & { moduleMm: number };
  id: TextLine;
  name: TextLine[];
  category: TextLine | null;
  footer: TextLine;
};

/** Greedy word wrap into at most `maxLines` lines that pass `fits`; the last line ends with the ellipsis if cut. */
export function wrapWords(
  text: string,
  fits: (s: string) => boolean,
  maxLines: number,
  ellipsis = "…",
): string[] {
  const full = text.replace(/\s+/g, " ").trim();
  const words = full ? full.split(" ") : [];
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (fits(next)) {
      cur = next;
      continue;
    }
    if (cur) lines.push(cur);
    cur = "";
    if (lines.length === maxLines) break;
    cur = w;
    while (cur.length > 1 && !fits(cur)) cur = cur.slice(0, -1);
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (!lines.length) return [""];
  if (lines.join(" ") !== full) {
    let last = lines[lines.length - 1]!;
    while (last.length > 0 && !fits(`${last.trimEnd()}${ellipsis}`)) last = last.slice(0, -1);
    lines[lines.length - 1] = `${last.trimEnd()}${ellipsis}`;
  }
  return lines;
}

/** One line, cut character by character and ended with "..." when it doesn't fit. */
export function truncate(text: string, fits: (s: string) => boolean, ellipsis = "..."): string {
  if (fits(text)) return text;
  let t = text;
  while (t.length > 0 && !fits(`${t.trimEnd()}${ellipsis}`)) t = t.slice(0, -1);
  return `${t.trimEnd()}${ellipsis}`;
}

/** Character-count wrap used by the layout; the PDF re-wraps with real glyph widths into the same lines. */
export function wrapName(
  name: string,
  perLine: number = 22,
  maxLines: number = LABEL.nameMaxLines,
) {
  return wrapWords(name, (s) => s.length <= perLine, maxLines);
}

const floorTenth = (mm: number) => Math.floor(mm * 10 + 1e-9) / 10;

/** Characters that safely fit one line of `widthMm` at `fontMm` (bold sans). */
export const charsFor = (widthMm: number, fontMm: number) =>
  Math.max(8, Math.floor(widthMm / (fontMm * 0.62)));

/** Largest monospace (0.6 em advance) font ≤ idFontMm that fits `chars` in `widthMm`. */
const idFontFor = (chars: number, widthMm: number) =>
  Math.max(
    LABEL.minIdFontMm,
    Math.min(LABEL.idFontMm, Math.floor((widthMm / (Math.max(1, chars) * 0.6)) * 10) / 10),
  );

/** Default QR symbol size (modules, without quiet zone): version 4 = a https://renthub.se/i/<32 hex> URL at level M. */
export const DEFAULT_QR_MODULES = 33;

/** Generic line extent (cap "H" top, "g" descender) so line spacing doesn't depend on the words. */
const lineExtent = (role: TextRole) => {
  const m = inkMetrics(ROLE_FONT[role], "Hg");
  return { up: m.top, down: -m.bottom };
};

/** Right column text: ID glyph top on `top`, then title lines and category, all starting at ink x. */
function textColumn(
  x: number,
  w: number,
  top: number,
  idText: string,
  name: string,
  lines: number,
  category: string | null,
) {
  const L = LABEL;
  const idFontMm = idFontFor(idText.length, w);
  const idInk = inkMetrics(ROLE_FONT.id, idText);
  const id: TextLine = {
    text: idText,
    role: "id",
    fontMm: idFontMm,
    x,
    w,
    baseline: top + idInk.top * idFontMm,
  };
  let inkBottom = id.baseline - idInk.bottom * idFontMm;

  const n = lineExtent("name");
  const names: TextLine[] = wrapName(name, charsFor(w, L.nameFontMm), lines).map((text, i) => {
    const baseline =
      inkBottom +
      L.idGapMm +
      n.up * L.nameFontMm +
      i * ((n.up + n.down) * L.nameFontMm + L.lineGapMm);
    return { text, role: "name", fontMm: L.nameFontMm, x, w, baseline };
  });
  inkBottom = names[names.length - 1]!.baseline + n.down * L.nameFontMm;

  let cat: TextLine | null = null;
  const catText = categoryText(category);
  if (catText) {
    const c = lineExtent("category");
    cat = {
      text: catText,
      role: "category",
      fontMm: L.categoryFontMm,
      x,
      w,
      baseline: inkBottom + L.lineGapMm + c.up * L.categoryFontMm,
    };
    inkBottom = cat.baseline + c.down * L.categoryFontMm;
  }
  return { id, names, cat, bottom: inkBottom };
}

/** Text fallbacks in priority order: drop the 2nd title line before the category, the category before the title. */
const variants = (category: string | null | undefined): [number, string | null][] => [
  [LABEL.nameMaxLines, category ?? null],
  [1, category ?? null],
  [LABEL.nameMaxLines, null],
  [1, null],
];

/**
 * Side template (62 × 30 mm standard, also 62 × 40 mm): QR at the content box left/top; S/N, title, category
 * and the barcode in the right column. The barcode fills the column width exactly and its bottom is level
 * with the QR bottom. Null when the codes can't be printed scannably.
 */
function layoutSide(
  h: number,
  name: string,
  modules: number,
  category: string | null | undefined,
  qrModules: number,
  idText: string,
  footerText: string = DEFAULT_LABEL_FOOTER,
): LabelLayout | null {
  const L = LABEL;
  const g = labelGrid(h, footerText);
  const minCol = Math.max(L.minColMm, modules * L.minModuleMm, idText.length * 0.6 * L.minIdFontMm);
  const q = floorTenth(Math.min(g.bodyBottom - g.top, L.maxQrMm, g.contentW - L.gapMm - minCol));
  if (q < L.minQrMm - 1e-9 || q / qrModules < L.minQrModuleMm - 1e-9) return null;
  const x = g.left + q + L.gapMm;
  const w = g.right - x;
  const qrBottom = g.top + q;
  for (const [lines, cat] of variants(category)) {
    const col = textColumn(x, w, g.top, idText, name, lines, cat);
    const barH = Math.min(L.maxBarMm, qrBottom - col.bottom - L.barGapMm);
    if (barH < L.minBarHeightMm - 1e-9) continue;
    return {
      heightMm: h,
      mode: "side",
      grid: g,
      qr: { x: g.left, y: g.top, w: q, h: q },
      bar: { x, y: qrBottom - barH, w, h: barH, moduleMm: w / modules },
      id: col.id,
      name: col.names,
      category: col.cat,
      footer: g.footer,
    };
  }
  return null;
}

/**
 * Stacked template (62 × 40 mm reserve for long barcodes): QR + right-column text on top, barcode across the
 * full content width (QR left edge to column right edge) underneath, footer below.
 */
function layoutStacked(
  h: number,
  name: string,
  modules: number,
  category: string | null | undefined,
  qrModules: number,
  idText: string,
  footerText: string = DEFAULT_LABEL_FOOTER,
): LabelLayout | null {
  const L = LABEL;
  const g = labelGrid(h, footerText);
  const moduleMm = g.contentW / modules;
  if (moduleMm < L.minModuleMm - 1e-9) return null;
  const bar = {
    x: g.left,
    y: g.bodyBottom - L.barHeightMm,
    w: g.contentW,
    h: L.barHeightMm,
    moduleMm,
  };
  const q = floorTenth(
    Math.min(L.maxQrMm, bar.y - L.gapMm - g.top, g.contentW - L.gapMm - L.minColMm),
  );
  if (q < L.minQrMm - 1e-9 || q / qrModules < L.minQrModuleMm - 1e-9) return null;
  const x = g.left + q + L.gapMm;
  const w = g.right - x;
  for (const [lines, cat] of variants(category)) {
    const col = textColumn(x, w, g.top, idText, name, lines, cat);
    if (col.bottom > bar.y - L.gapMm + 1e-9) continue;
    return {
      heightMm: h,
      mode: "stacked",
      grid: g,
      qr: { x: g.left, y: g.top, w: q, h: q },
      bar,
      id: col.id,
      name: col.names,
      category: col.cat,
      footer: g.footer,
    };
  }
  return null;
}

/**
 * Lays out one label. `barcodeModules` is the Code 128 symbol width in modules without quiet zones,
 * `qrModules` the QR symbol size without quiet zone. Tries 62 × 30 mm first (unless a longer height is
 * forced), then the 62 × 40 mm reserve. Returns null when the barcode can't be printed at a scannable width.
 */
export function layoutLabel(
  name: string,
  barcodeModules: number,
  heightMm?: number,
  category?: string | null | undefined,
  qrModules: number = DEFAULT_QR_MODULES,
  idText: string = "S/N: DCB001-TV001",
  footerText: string = DEFAULT_LABEL_FOOTER,
): LabelLayout | null {
  const forced = heightMm !== undefined && heightMm > LABEL.heightMm ? heightMm : undefined;
  if (!forced) {
    const compact = layoutSide(
      LABEL.heightMm,
      name,
      barcodeModules,
      category,
      qrModules,
      idText,
      footerText,
    );
    if (compact) return compact;
  }
  const h = forced ?? LABEL.fallbackHeightMm;
  return (
    layoutSide(h, name, barcodeModules, category, qrModules, idText, footerText) ??
    layoutStacked(h, name, barcodeModules, category, qrModules, idText, footerText)
  );
}

type BatchItem = {
  name: string;
  modules: number;
  category?: string | null | undefined;
  qrModules?: number | undefined;
  idText?: string | undefined;
  footerText?: string | undefined;
};

/** One paper size per print job: every label gets the tallest label's height. */
export function layoutBatch(items: BatchItem[]): (LabelLayout | null)[] {
  const lay = (i: BatchItem, h?: number) =>
    layoutLabel(i.name, i.modules, h, i.category, i.qrModules, i.idText, i.footerText);
  const first = items.map((i) => lay(i));
  const h = Math.max(LABEL.heightMm, ...first.map((l) => l?.heightMm ?? 0));
  if (h === LABEL.heightMm) return first;
  return items.map((i, n) => (first[n] ? lay(i, h) : null));
}

/** QR symbol size in modules (without quiet zone) at error-correction level M. */
export async function qrModuleCount(value: string): Promise<number> {
  const { default: QRCode } = await import("qrcode");
  return QRCode.create(value, { errorCorrectionLevel: "M" }).modules.size;
}

/** QR symbol only (no built-in margin, so its modules sit exactly on the grid), square viewBox, locked 1:1. */
export async function qrSvg(value: string): Promise<string> {
  const { default: QRCode } = await import("qrcode");
  const svg = await QRCode.toString(value, {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  });
  return svg.replace(
    "<svg ",
    `<svg width="100%" height="100%" preserveAspectRatio="xMidYMid meet" `,
  );
}

type JsBarcodeFn = (el: SVGSVGElement, value: string, opts: Record<string, unknown>) => void;

/** Code 128 symbol width in modules (without quiet zones), or null if the value can't be encoded. */
export async function code128Modules(value: string): Promise<number | null> {
  const { default: JsBarcode } = (await import("jsbarcode")) as unknown as { default: JsBarcodeFn };
  try {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    JsBarcode(svg, value, {
      format: "CODE128",
      displayValue: false,
      margin: 0,
      width: 1,
      height: 1,
    });
    const w = Number.parseFloat(svg.getAttribute("width") ?? "");
    return Number.isFinite(w) && w > 0 ? w : null;
  } catch {
    return null;
  }
}

/**
 * Code 128 bars only (first bar at the box's left edge, last bar at its right edge), scaled to exactly
 * `widthMm` × `heightMm`: module width = widthMm / modules. Quiet zones are the surrounding white grid space.
 */
export async function code128Svg(
  value: string,
  widthMm: number,
  heightMm: number,
): Promise<string | null> {
  const { default: JsBarcode } = (await import("jsbarcode")) as unknown as { default: JsBarcodeFn };
  try {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    JsBarcode(svg, value, {
      format: "CODE128",
      displayValue: false,
      width: 1,
      height: 100,
      margin: 0,
      background: "#ffffff",
      lineColor: "#000000",
    });
    const modules = Number.parseFloat(svg.getAttribute("width") ?? "0");
    if (!(modules > 0)) return null;
    svg.removeAttribute("style");
    svg.setAttribute("viewBox", `0 0 ${modules} 100`);
    svg.setAttribute("width", `${widthMm.toFixed(3)}mm`);
    svg.setAttribute("height", `${heightMm.toFixed(3)}mm`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("shape-rendering", "crispEdges");
    return svg.outerHTML;
  } catch {
    return null;
  }
}

/** Footer e-mail actually printed on a label. */
export const footerEmailFor = (input: Pick<LabelInput, "footerEmail">) =>
  input.footerEmail?.trim() || DEFAULT_LABEL_FOOTER;

/**
 * Logo box in the footer row: right-aligned to the content box, bottom on the content box bottom, as tall
 * as the footer row allows (footer ink + the gap above it, minus 0.4 mm clearance from the codes), never
 * wider than the space right of the footer text. Null when there is no room; the codes are never moved.
 */
export function footerLogoBox(
  layout: Pick<LabelLayout, "grid" | "footer">,
  aspect: number,
  footerTextWidthMm: number,
): Box | null {
  if (!(aspect > 0)) return null;
  const g = layout.grid;
  const maxH = Math.min(3.2, g.bottom - g.bodyBottom - 0.4);
  const maxW = g.right - (layout.footer.x + footerTextWidthMm + 1.5);
  let h = maxH;
  let w = h * aspect;
  if (w > maxW) {
    w = maxW;
    h = w / aspect;
  }
  if (h < 1.5 || w <= 0) return null;
  return { x: g.right - w, y: g.bottom - h, w, h };
}

export type RenderedLabel = {
  input: LabelInput;
  layout: LabelLayout;
  qrSvg: string;
  barSvg: string;
};
export type RenderResult = { labels: RenderedLabel[]; failed: LabelInput[]; heightMm: number };

/** Builds QR + Code 128 SVGs and a shared-height layout for a print job. */
export async function renderLabels(rawInputs: LabelInput[]): Promise<RenderResult> {
  const inputs = rawInputs.map((i) => ({
    ...i,
    idText: unitIdText(i.idText),
    footerEmail: footerEmailFor(i),
  }));
  const [modules, qrSizes] = await Promise.all([
    Promise.all(inputs.map((i) => code128Modules(i.barcodeValue))),
    Promise.all(inputs.map((i) => qrModuleCount(i.qrValue))),
  ]);
  const layouts = layoutBatch(
    inputs.map((i, n) => ({
      name: i.name,
      modules: modules[n] ?? 1e9,
      category: i.category,
      qrModules: qrSizes[n],
      idText: pdfSafe(i.idText),
      footerText: i.footerEmail,
    })),
  );
  const labels: RenderedLabel[] = [];
  const failed: LabelInput[] = [];
  for (const [n, input] of inputs.entries()) {
    const layout = modules[n] ? layouts[n] : null;
    const bar = layout ? await code128Svg(input.barcodeValue, layout.bar.w, layout.bar.h) : null;
    if (!layout || !bar) {
      failed.push(input);
      continue;
    }
    labels.push({ input, layout, qrSvg: await qrSvg(input.qrValue), barSvg: bar });
  }
  return { labels, failed, heightMm: labels[0]?.layout.heightMm ?? LABEL.heightMm };
}

/** The embedded label fonts are subset to Latin-1, so map typographic marks to plain ones. */
export function pdfSafe(text: string): string {
  return text
    .replace(/[″“”]/g, '"')
    .replace(/[′‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...");
}

const PDF_FONT: Record<TextRole, [string, string]> = {
  id: ["LabelMono", "bold"],
  name: ["LabelSans", "bold"],
  category: ["LabelSans", "normal"],
  footer: ["LabelSans", "normal"],
};

/** PDF with exact 62 × H mm pages, one label per page, vector codes, pure black on white, no headers/footers. */
export async function buildLabelPdf(result: RenderResult) {
  const [{ jsPDF }, { LABEL_FONTS }] = await Promise.all([
    import("jspdf"),
    import("./labelFonts"),
    import("svg2pdf.js"),
  ]);
  const W = LABEL.widthMm;
  const H = result.heightMm;
  const orientation = W > H ? "landscape" : "portrait";
  const doc = new jsPDF({ unit: "mm", format: [W, H], orientation, compress: true });
  doc.setProperties({ title: "" });
  for (const [file, data, family, style] of [
    ["LabelSans-Regular.ttf", LABEL_FONTS.sans, "LabelSans", "normal"],
    ["LabelSans-Bold.ttf", LABEL_FONTS.sansBold, "LabelSans", "bold"],
    ["LabelMono-Bold.ttf", LABEL_FONTS.monoBold, "LabelMono", "bold"],
  ] as const) {
    doc.addFileToVFS(file, data);
    doc.addFont(file, family, style);
  }
  const ptPerMm = 72 / 25.4;
  const applyFont = (line: TextLine) => {
    const [family, style] = PDF_FONT[line.role];
    doc
      .setFont(family, style)
      .setFontSize(line.fontMm * ptPerMm)
      .setTextColor(0, 0, 0);
  };
  /** Ink from line.x to at most line.x + line.w (the column's right edge). */
  const fits = (line: TextLine) => (t: string) =>
    doc.getTextWidth(t) - lineInk(line, t).left <= line.w + 1e-6;
  const draw = (line: TextLine, text: string) => {
    applyFont(line);
    const t = truncate(pdfSafe(text), fits(line));
    doc.text(t, line.x - lineInk(line, t).left, line.baseline, { baseline: "alphabetic" });
  };
  const logos = await loadLogos(result.labels.map((r) => r.input.logoUrl));
  for (const [i, r] of result.labels.entries()) {
    if (i > 0) doc.addPage([W, H], orientation);
    const l = r.layout;
    for (const [svg, box] of [
      [r.qrSvg, l.qr],
      [r.barSvg, l.bar],
    ] as const) {
      const el = new DOMParser().parseFromString(svg, "image/svg+xml")
        .documentElement as unknown as Element;
      await doc.svg(el, { x: box.x, y: box.y, width: box.w, height: box.h });
    }
    draw(l.id, r.input.idText);
    if (l.name.length) {
      applyFont(l.name[0]!);
      const lines = wrapWords(pdfSafe(r.input.name), fits(l.name[0]!), l.name.length, "...");
      for (const [n, text] of lines.entries()) draw(l.name[n]!, text);
    }
    if (l.category) draw(l.category, l.category.text);
    draw(l.footer, l.footer.text);
    const logo = r.input.logoUrl ? logos.get(r.input.logoUrl) : undefined;
    if (logo) {
      applyFont(l.footer);
      const box = footerLogoBox(l, logo.aspect, doc.getTextWidth(pdfSafe(l.footer.text)));
      if (box)
        doc.addImage(logo.dataUrl, logo.format, box.x, box.y, box.w, box.h, logo.key, "FAST");
    }
  }
  return doc;
}

type LoadedLogo = { dataUrl: string; format: "PNG" | "JPEG" | "WEBP"; aspect: number; key: string };

/** Fetches each distinct logo once; a logo that fails to load is skipped (label prints without it). */
async function loadLogos(urls: (string | null | undefined)[]) {
  const out = new Map<string, LoadedLogo>();
  for (const [n, url] of [...new Set(urls.filter((u): u is string => Boolean(u)))].entries()) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const format = blob.type.includes("png")
        ? "PNG"
        : blob.type.includes("webp")
          ? "WEBP"
          : "JPEG";
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(blob);
      });
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("logo"));
        img.src = dataUrl;
      });
      out.set(url, {
        dataUrl,
        format,
        aspect: img.naturalWidth / img.naturalHeight,
        key: `logo${n}`,
      });
    } catch (e) {
      console.warn("label logo could not be loaded", e);
    }
  }
  return out;
}

/** Prints the exact PDF (not an HTML page) from a hidden iframe; falls back to opening it in a new tab. */
export async function printPdfBlob(blob: Blob): Promise<void> {
  const url = URL.createObjectURL(blob);
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.title = "";
  Object.assign(frame.style, {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "1px",
    height: "1px",
    border: "0",
    opacity: "0",
  });
  await new Promise<void>((resolve) => {
    frame.onload = () => resolve();
    frame.src = url;
    document.body.appendChild(frame);
  });
  await new Promise((r) => setTimeout(r, 300));
  try {
    frame.contentWindow!.focus();
    frame.contentWindow!.print();
  } catch {
    window.open(url, "_blank", "noopener");
  }
  setTimeout(() => {
    frame.remove();
    URL.revokeObjectURL(url);
  }, 120_000);
}
