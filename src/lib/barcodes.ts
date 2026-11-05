import JsBarcode from "jsbarcode";
import QRCode from "qrcode";

import { escapeHtml } from "./escapeHtml";

export type BarcodeType = "code128" | "code39" | "ean13" | "qr";

export const BARCODE_TYPES: { value: BarcodeType; label: string }[] = [
  { value: "code128", label: "Code 128" },
  { value: "code39", label: "Code 39" },
  { value: "ean13", label: "EAN-13" },
  { value: "qr", label: "QR code" },
];

const FORMATS: Record<Exclude<BarcodeType, "qr">, string> = {
  code128: "CODE128",
  code39: "CODE39",
  ean13: "EAN13",
};

export function randomBarcode() {
  return Array.from({ length: 10 }, () =>
    "0123456789ABCDEF".charAt(Math.floor(Math.random() * 16)),
  ).join("");
}

/** Renders a barcode as an inline SVG string. Returns null when the value is invalid. */
export function barcodeSvg(value: string, type: BarcodeType = "code128"): string | null {
  if (!value.trim()) return null;
  try {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    JsBarcode(svg, value, {
      format: FORMATS[type as Exclude<BarcodeType, "qr">] ?? "CODE128",
      width: 2,
      height: 64,
      fontSize: 14,
      margin: 6,
      displayValue: true,
      valid: (ok: boolean) => {
        if (!ok) throw new Error("invalid");
      },
    });
    return svg.outerHTML;
  } catch {
    return null;
  }
}

export async function qrDataUrl(value: string) {
  if (!value.trim()) return null;
  try {
    return await QRCode.toDataURL(value, { margin: 1, width: 220 });
  } catch {
    return null;
  }
}

/** Markup for one code, usable both on screen and in a print window. */
export async function codeMarkup(value: string, type: BarcodeType) {
  if (type === "qr") {
    const url = await qrDataUrl(value);
    return url
      ? `<img src="${url}" alt="QR code ${escapeHtml(value)}" style="width:120px;height:120px" />
         <div style="font-family:monospace;font-size:12px;margin-top:4px">${escapeHtml(value)}</div>`
      : null;
  }
  return barcodeSvg(value, type);
}
