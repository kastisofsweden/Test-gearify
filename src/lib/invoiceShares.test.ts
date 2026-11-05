import { describe, expect, it } from "vitest";
import { invoiceRowStatus, splitByShares, validateShares } from "./invoiceShares";

describe("splitByShares", () => {
  it("splits 50/50", () => {
    const r = splitByShares(1000, [
      { organization_id: "a", share_bps: 5000 },
      { organization_id: "b", share_bps: 5000 },
    ]);
    expect(r.map((x) => x.amount)).toEqual([500, 500]);
  });
  it("3-way split gives leftover öre to the last share", () => {
    const r = splitByShares(100, [
      { organization_id: "a", share_bps: 3334 },
      { organization_id: "b", share_bps: 3333 },
      { organization_id: "c", share_bps: 3333 },
    ]);
    expect(r.map((x) => x.amount)).toEqual([33.34, 33.33, 33.33]);
    const odd = splitByShares(0.1, [
      { organization_id: "a", share_bps: 5000 },
      { organization_id: "b", share_bps: 5000 },
    ]);
    expect(odd.map((x) => x.amount)).toEqual([0.05, 0.05]);
    const rem = splitByShares(10.01, [
      { organization_id: "a", share_bps: 5000 },
      { organization_id: "b", share_bps: 5000 },
    ]);
    expect(rem.map((x) => x.amount)).toEqual([5.01, 5]);
    expect(rem[0]!.amount + rem[1]!.amount).toBeCloseTo(10.01, 6);
  });
  it("orders by bps desc so the smallest share takes the remainder", () => {
    const r = splitByShares(99.99, [
      { organization_id: "z", share_bps: 2500 },
      { organization_id: "y", share_bps: 7500 },
    ]);
    expect(r).toEqual([
      { organization_id: "y", share_bps: 7500, amount: 74.99 },
      { organization_id: "z", share_bps: 2500, amount: 25 },
    ]);
  });
});

describe("validateShares", () => {
  it("requires exactly 100 %", () => {
    expect(validateShares([{ organization_id: "a", share_bps: 9999 }])).toMatch(/100 %/);
    expect(validateShares([{ organization_id: "a", share_bps: 10000 }])).toBeNull();
    expect(validateShares([])).toBeNull();
  });
});

describe("invoiceRowStatus", () => {
  const endsAt = "2026-11-01T23:00:00Z"; // job end
  it("pending while unpaid", () => {
    expect(
      invoiceRowStatus({ paidAt: null, endsAt, invoicedAt: null, now: new Date("2026-12-01") })
        .reason,
    ).toBe("Awaiting payment");
  });
  it("pending until end + 24h even if paid", () => {
    const r = invoiceRowStatus({
      paidAt: "2026-10-01T00:00:00Z",
      endsAt,
      invoicedAt: null,
      now: new Date("2026-11-02T13:00:00Z"),
    });
    expect(r.status).toBe("pending");
    expect(r.reason).toBe("Available in 10h");
    expect(
      invoiceRowStatus({
        paidAt: "2026-10-01T00:00:00Z",
        endsAt,
        invoicedAt: null,
        now: new Date("2026-11-01T10:00:00Z"),
      }).reason,
    ).toBe("Job not finished");
  });
  it("invoiceable when paid and end + 24h passed", () => {
    expect(
      invoiceRowStatus({
        paidAt: "2026-10-01T00:00:00Z",
        endsAt,
        invoicedAt: null,
        now: new Date("2026-11-02T23:00:00Z"),
      }).status,
    ).toBe("invoiceable");
  });
  it("invoiced wins", () => {
    expect(invoiceRowStatus({ paidAt: null, endsAt, invoicedAt: "x" }).status).toBe("invoiced");
  });
});
