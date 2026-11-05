import { describe, expect, it } from "vitest";

import { calculationTotals } from "./calculations";

describe("calculationTotals", () => {
  it("adds transport to rental before VAT", () => {
    const t = calculationTotals([{ quantity: 2, days: 3, unit_price: 500 }], {
      discountPercent: 0,
      vatPercent: 25,
      transport: 2250,
    });
    expect(t.rental).toBe(3000);
    expect(t.net).toBe(5250);
    expect(t.vat).toBe(1312.5);
    expect(t.total).toBe(6562.5);
  });

  it("applies the discount to rental only and treats pending transport as 0", () => {
    const t = calculationTotals([{ quantity: 1, days: 1, unit_price: 1000 }], {
      discountPercent: 10,
      vatPercent: 25,
      transport: null,
    });
    expect(t.net).toBe(900);
    expect(t.total).toBe(1125);
  });
});
