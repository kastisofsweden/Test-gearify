/** Pure totals for back-office calculations (kalkyler): rental (base + commission) + transport, then VAT. */
export type CalcLine = {
  quantity: number;
  days: number;
  unit_price: number;
  /** Commission on top of the base line total (see src/lib/commission.ts). */
  commission_amount?: number | null;
};

export function calculationTotals(
  lines: CalcLine[],
  opts: { discountPercent: number; vatPercent: number; transport: number | null },
) {
  const base = lines.reduce(
    (sum, l) => sum + Math.max(0, l.quantity) * Math.max(0, l.days) * Math.max(0, l.unit_price),
    0,
  );
  const commission = lines.reduce(
    (sum, l) => sum + Math.max(0, Number(l.commission_amount ?? 0)),
    0,
  );
  const rental = base + commission;
  const discount = (rental * Math.min(100, Math.max(0, opts.discountPercent))) / 100;
  const transport = opts.transport ?? 0;
  const net = rental - discount + transport;
  const vat = (net * Math.max(0, opts.vatPercent)) / 100;
  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    base: r(base),
    commission: r(commission),
    rental: r(rental),
    discount: r(discount),
    transport: r(transport),
    net: r(net),
    vat: r(vat),
    total: r(net + vat),
  };
}
