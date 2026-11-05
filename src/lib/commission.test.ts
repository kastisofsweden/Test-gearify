import { describe, expect, it } from "vitest";

import { computeCommissionAmount, lineTotals, resolveCommission } from "./commission";

describe("computeCommissionAmount", () => {
  it("percent of base line total", () => {
    expect(
      computeCommissionAmount({ baseAmount: 1000, quantity: 2, type: "percent", value: 12.5 }),
    ).toBe(125);
  });
  it("fixed is per unit (quantity), not per day", () => {
    expect(
      computeCommissionAmount({ baseAmount: 9999, quantity: 3, type: "fixed", value: 100 }),
    ).toBe(300);
  });
  it("null type or zero value gives 0", () => {
    expect(computeCommissionAmount({ baseAmount: 1000, quantity: 1, type: null, value: 10 })).toBe(
      0,
    );
    expect(
      computeCommissionAmount({ baseAmount: 1000, quantity: 1, type: "percent", value: 0 }),
    ).toBe(0);
  });
  it("negative values clamp to 0", () => {
    expect(
      computeCommissionAmount({ baseAmount: 1000, quantity: 1, type: "percent", value: -5 }),
    ).toBe(0);
    expect(
      computeCommissionAmount({ baseAmount: -1000, quantity: 1, type: "percent", value: 10 }),
    ).toBe(0);
    expect(
      computeCommissionAmount({ baseAmount: 0, quantity: -2, type: "fixed", value: 100 }),
    ).toBe(0);
  });
});

describe("resolveCommission", () => {
  const org = { commission_type: "percent", commission_value: 10 };
  it("item override wins when both fields are set", () => {
    expect(
      resolveCommission({
        equipmentOverride: { commission_type: "fixed", commission_value: 50 },
        org,
      }),
    ).toEqual({ type: "fixed", value: 50 });
  });
  it("half-set override falls back to the organisation", () => {
    expect(
      resolveCommission({
        equipmentOverride: { commission_type: "fixed", commission_value: null },
        org,
      }),
    ).toEqual({ type: "percent", value: 10 });
  });
  it("falls back to the main organisation, else none", () => {
    expect(resolveCommission({ org: null, parentOrg: org })).toEqual({
      type: "percent",
      value: 10,
    });
    expect(resolveCommission({})).toBeNull();
  });
});

describe("lineTotals", () => {
  it("customer total = base + commission; org is owed the base", () => {
    expect(
      lineTotals({
        quantity: 3,
        days: 2,
        unitPrice: 500,
        commission: { type: "fixed", value: 100 },
      }),
    ).toEqual({ base: 3000, commission: 300, total: 3300, netToOrg: 3000 });
  });
});
