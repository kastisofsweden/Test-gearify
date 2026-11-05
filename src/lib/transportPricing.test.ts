import { describe, expect, it } from "vitest";

import {
  nextRushHourDeparture,
  pendingTransport,
  transportTotal,
  warehouseTransport,
  type WarehouseRates,
} from "./transportPricing";

const orebro: WarehouseRates = {
  id: "w1",
  name: "Örebro",
  loading_time_hours: 1,
  rig_up_time_hours: 1,
  truck_cost_per_10km_sek: 25,
  staff_per_delivery: 1,
};

describe("warehouseTransport", () => {
  it("prices the 45 min / 30 km example at 2250 kr", () => {
    const r = warehouseTransport(orebro, { distance_m: 30_000, duration_s: 45 * 60 }, 600);
    expect(r.staff_hours).toBe(3.5);
    expect(r.staff_cost).toBe(2100);
    expect(r.truck_cost).toBe(150);
    expect(r.subtotal).toBe(2250);
  });

  it("charges only loading + rig-up for 0 km", () => {
    const r = warehouseTransport(orebro, { distance_m: 0, duration_s: 0 }, 600);
    expect(r.truck_cost).toBe(0);
    expect(r.subtotal).toBe(1200);
  });

  it("rounds truck km up to the next started 10 km", () => {
    // 2 × 30.5 km = 61 km -> 7 blocks
    const r = warehouseTransport(orebro, { distance_m: 30_500, duration_s: 0 }, 600);
    expect(r.truck_cost).toBe(175);
  });

  it("multiplies staff cost by staff per delivery", () => {
    const r = warehouseTransport(
      { ...orebro, staff_per_delivery: 2 },
      { distance_m: 30_000, duration_s: 2700 },
      600,
    );
    expect(r.staff_cost).toBe(4200);
    expect(r.subtotal).toBe(4350);
  });
});

describe("transportTotal", () => {
  it("sums one delivery per warehouse", () => {
    const total = transportTotal(
      [
        { warehouse: orebro, leg: { distance_m: 30_000, duration_s: 2700 } },
        { warehouse: { ...orebro, id: "w2", name: "B" }, leg: { distance_m: 0, duration_s: 0 } },
      ],
      600,
    );
    expect(total.total).toBe(3450);
    expect(total.warehouses).toHaveLength(2);
  });
});

describe("pendingTransport", () => {
  it("returns the Swedish fallback with no amount", () => {
    const q = pendingTransport("missing_key");
    expect(q.status).toBe("pending");
    expect(q.amount).toBeNull();
    if (q.status === "pending")
      expect(q.messageSv).toBe("Transport is calculated and confirmed in the quote");
  });
});

describe("nextRushHourDeparture", () => {
  it("uses today 16:30 Stockholm on a weekday morning", () => {
    // Thu 5 Nov 2026 07:20 UTC (08:20 CET) -> 15:30 UTC
    expect(nextRushHourDeparture(new Date("2026-11-05T07:20:00Z"))).toBe("2026-11-05T15:30:00Z");
  });
  it("moves Friday evening to Monday", () => {
    expect(nextRushHourDeparture(new Date("2026-11-06T18:00:00Z"))).toBe("2026-11-09T15:30:00Z");
  });
  it("handles summer time", () => {
    expect(nextRushHourDeparture(new Date("2026-06-10T06:00:00Z"))).toBe("2026-06-10T14:30:00Z");
  });
});
