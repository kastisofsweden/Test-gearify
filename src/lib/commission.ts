/**
 * Commission rules (mirrors public.commission_for in the database, which is authoritative).
 *
 * - Base rental = line price before commission (qty × days × unit price from the pricing engine).
 * - percent: % of the base line total.
 * - fixed: SEK per rented unit (quantity) per order line — not per day.
 * - Customer line total = base + commission. The owner organisation is owed the base.
 */
export type CommissionType = "percent" | "fixed";

export type CommissionRate = {
  commission_type: CommissionType | string | null | undefined;
  commission_value: number | string | null | undefined;
};

export type ResolvedCommission = { type: CommissionType; value: number } | null;

function rate(r: CommissionRate | null | undefined): ResolvedCommission {
  if (!r) return null;
  const type = r.commission_type;
  if (type !== "percent" && type !== "fixed") return null;
  if (r.commission_value === null || r.commission_value === undefined || r.commission_value === "")
    return null;
  const value = Number(r.commission_value);
  if (!Number.isFinite(value)) return null;
  return { type, value: Math.max(0, value) };
}

/** Item override (both fields set) wins, then the owner org, then its main (parent) org. */
export function resolveCommission(opts: {
  equipmentOverride?: CommissionRate | null | undefined;
  org?: CommissionRate | null | undefined;
  parentOrg?: CommissionRate | null | undefined;
}): ResolvedCommission {
  return rate(opts.equipmentOverride) ?? rate(opts.org) ?? rate(opts.parentOrg);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeCommissionAmount(opts: {
  baseAmount: number;
  quantity: number;
  type: CommissionType | string | null | undefined;
  value: number | null | undefined;
}): number {
  const value = Math.max(0, Number(opts.value ?? 0)) || 0;
  if (opts.type === "percent") return round2((Math.max(0, opts.baseAmount || 0) * value) / 100);
  if (opts.type === "fixed") return round2(value * Math.max(0, Math.floor(opts.quantity || 0)));
  return 0;
}

export function lineTotals(opts: {
  quantity: number;
  days: number;
  unitPrice: number;
  commission: ResolvedCommission;
}) {
  const base = Math.max(0, opts.quantity * opts.days * opts.unitPrice);
  const commission = computeCommissionAmount({
    baseAmount: base,
    quantity: opts.quantity,
    type: opts.commission?.type,
    value: opts.commission?.value,
  });
  return { base, commission, total: base + commission, netToOrg: base };
}

export function describeCommission(type: string | null | undefined, value: unknown): string {
  if (type === "percent") return `${Number(value)} %`;
  if (type === "fixed") return `${Number(value)} kr / unit`;
  return "None";
}
