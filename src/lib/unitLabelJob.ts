import { unitIdText, type LabelInput } from "@/lib/productLabel";
import { unitPublicUrl } from "@/lib/unitUrls";
import type { LabelBranding } from "@/lib/labelBranding";

/** Minimal unit shape needed to build a unit label. */
export type PrintableUnit = {
  id: string;
  serial_code: string;
  qr_token: string;
  created_at: string;
  equipment_id?: string;
  equipment?: { name?: string | null; category?: string | null } | null;
};

/** `?ids=` value for the print page: one id per selected unit, order kept, no duplicates. */
export const unitIdsParam = (ids: Iterable<string>) => [...new Set(ids)].join(",");

/** Parse a `?ids=` value back into a set of unit ids. */
export const parseUnitIds = (param: string | undefined) =>
  new Set(
    (param ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

/** Registration order (S/N numbers are issued in that order). */
export const byRegistration = (a: PrintableUnit, b: PrintableUnit) =>
  a.created_at.localeCompare(b.created_at) || a.serial_code.localeCompare(b.serial_code);

/** The selected units, in S/N order. */
export const unitsToPrint = <U extends PrintableUnit>(units: U[], selected: Set<string>) =>
  units.filter((u) => selected.has(u.id)).sort(byRegistration);

/** Only one item's units (what the item's Print label dialog offers), in S/N order. */
export const unitsOfItem = <U extends PrintableUnit & { equipment_id: string }>(
  units: U[],
  equipmentId: string,
) => units.filter((u) => u.equipment_id === equipmentId).sort(byRegistration);

export type LabelJobOptions = {
  /** QR base for new labels (resolveQrBaseUrl); default = env/origin chain. */
  baseUrl?: string | undefined;
  /** Owner-organization branding per equipment id; missing = default footer, no logo. */
  brandingFor?: ((equipmentId: string | undefined) => LabelBranding | undefined) | undefined;
};

/** One label per unit, each carrying that unit's own S/N, QR and its owner's footer e-mail/logo. */
export const unitLabelInputs = (units: PrintableUnit[], opts: LabelJobOptions = {}): LabelInput[] =>
  units.map((u) => {
    const b = opts.brandingFor?.(u.equipment_id);
    return {
      name: u.equipment?.name ?? "",
      qrValue: opts.baseUrl ? unitPublicUrl(u.qr_token, opts.baseUrl) : unitPublicUrl(u.qr_token),
      barcodeValue: u.serial_code,
      idText: unitIdText(u.serial_code),
      category: u.equipment?.category ?? null,
      footerEmail: b?.footerEmail ?? null,
      logoUrl: b?.logoUrl ?? null,
    };
  });
