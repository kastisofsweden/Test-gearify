/**
 * Unit S/N: <ORG prefix><unit number in the organization>-<CC><unit number within the item>[-KK]
 * e.g. DCB042-AS031. Mirrors the database's format_unit_serial_code; numbers are issued only server-side.
 */

/** Same normalisation as the database: upper-case letters A–Z only, max 6. */
export function normalizePrefix(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 6);
}

/** Organization number n (1..∞) -> "042" plus overflow suffix ("-01" after 999). */
function orgPart(n: number): { nnn: string; suffix: string } {
  const k = Math.floor((n - 1) / 999);
  return {
    nnn: String(((n - 1) % 999) + 1).padStart(3, "0"),
    suffix: k >= 1 ? `-${k < 100 ? String(k).padStart(2, "0") : String(k)}` : "",
  };
}

export function formatUnitSerial(
  prefix: string,
  categoryCode: string,
  orgNo: number,
  itemNo: number,
): string {
  if (!Number.isInteger(orgNo) || orgNo < 1) throw new Error("invalid organization number");
  if (!Number.isInteger(itemNo) || itemNo < 0 || itemNo > 999)
    throw new Error("invalid item number");
  const { nnn, suffix } = orgPart(orgNo);
  return `${prefix}${nnn}-${categoryCode}${String(itemNo).padStart(3, "0")}${suffix}`;
}

export type SerialParts = { prefix: string; orgNo: number; categoryCode: string; itemNo: number };

export function parseUnitSerial(code: string): SerialParts | null {
  const m = /^([A-Z]{1,6})(\d{3})-([A-Z]{2})(\d{3})(?:-(\d{2,}))?$/.exec(code.trim().toUpperCase());
  if (!m) return null;
  return {
    prefix: m[1]!,
    orgNo: Number(m[5] ?? 0) * 999 + Number(m[2]),
    categoryCode: m[3]!,
    itemNo: Number(m[4]),
  };
}

/** Shown next to an organization: the next unit S/N's first part, e.g. "AR001-…". */
export function nextSerialHint(prefix: string, lastOrgNo: number): string {
  const { nnn, suffix } = orgPart(lastOrgNo + 1);
  return `${prefix}${nnn}-…${suffix}`;
}

/** Units whose organization number is used more than once in the same series (the S/N bug). */
export function sharedOrgNumbers<T extends { serial_code: string; sn_series_id?: string | null }>(
  units: T[],
): T[] {
  const groups = new Map<string, T[]>();
  for (const u of units) {
    const p = parseUnitSerial(u.serial_code);
    if (!p) continue;
    const key = `${u.sn_series_id ?? p.prefix}:${p.orgNo}`;
    groups.set(key, [...(groups.get(key) ?? []), u]);
  }
  return [...groups.values()].filter((g) => g.length > 1).flat();
}
