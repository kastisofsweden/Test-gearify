/**
 * Co-ownership split and My invoice status (mirrors public.build_invoice_rows /
 * public.list_org_invoice_rows in the database, which are authoritative).
 *
 * - Shares are in basis points (10000 = 100 %). An item without shares is 100 % its owner org.
 * - Each share gets round(base × bps / 10000, 2); the LAST share receives the leftover öre.
 *   Order: highest bps first, then organization id.
 * - Commission is never split to owners; it stays with the platform.
 */
export type Share = { organization_id: string; share_bps: number };

export const FULL_BPS = 10000;

export function sortShares(shares: Share[]): Share[] {
  return [...shares].sort(
    (a, b) => b.share_bps - a.share_bps || a.organization_id.localeCompare(b.organization_id),
  );
}

export function validateShares(shares: Share[]): string | null {
  if (shares.length === 0) return null;
  const ids = new Set<string>();
  for (const s of shares) {
    if (!s.organization_id) return "Pick an organization for every row";
    if (ids.has(s.organization_id)) return "Each organization can appear only once";
    ids.add(s.organization_id);
    if (!Number.isInteger(s.share_bps) || s.share_bps < 1 || s.share_bps > FULL_BPS)
      return "Each share must be between 0.01 % and 100 %";
  }
  const sum = shares.reduce((t, s) => t + s.share_bps, 0);
  if (sum !== FULL_BPS) return `Shares must sum to 100 % (now ${(sum / 100).toFixed(2)} %)`;
  return null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function splitByShares(
  baseAmount: number,
  shares: Share[],
): { organization_id: string; share_bps: number; amount: number }[] {
  const ordered = sortShares(shares);
  const total = round2(baseAmount);
  let allocated = 0;
  return ordered.map((s, i) => {
    const amount =
      i === ordered.length - 1
        ? round2(total - allocated)
        : round2((total * s.share_bps) / FULL_BPS);
    allocated = round2(allocated + amount);
    return { ...s, amount };
  });
}

export const percentToBps = (pct: number) => Math.round(pct * 100);
export const bpsToPercent = (bps: number) => bps / 100;

export type InvoiceStatus = "pending" | "invoiceable" | "invoiced";

/** Job end = start of the day after ends_on, Europe/Stockholm. Rows unlock 24 h later. */
export function invoiceRowStatus(input: {
  paidAt: string | null;
  endsAt: string | Date;
  invoicedAt: string | null;
  now?: Date;
}): { status: InvoiceStatus; reason: string | null; hoursLeft: number } {
  if (input.invoicedAt) return { status: "invoiced", reason: null, hoursLeft: 0 };
  const now = input.now ?? new Date();
  const unlock = new Date(new Date(input.endsAt).getTime() + 24 * 3600 * 1000);
  const msLeft = unlock.getTime() - now.getTime();
  const hoursLeft = msLeft > 0 ? Math.ceil(msLeft / 3600000) : 0;
  const ended = now.getTime() >= new Date(input.endsAt).getTime();
  if (!input.paidAt) return { status: "pending", reason: "Awaiting payment", hoursLeft };
  if (!ended) return { status: "pending", reason: "Job not finished", hoursLeft };
  if (msLeft > 0) return { status: "pending", reason: `Available in ${hoursLeft}h`, hoursLeft };
  return { status: "invoiceable", reason: null, hoursLeft: 0 };
}
