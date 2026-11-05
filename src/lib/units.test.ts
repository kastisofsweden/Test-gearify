import { describe, expect, it } from "vitest";

import {
  batchName,
  importCreationOrder,
  isDuplicateScan,
  moveWarning,
  unitErrorMessage,
  parseCsv,
  planImportGroups,
  validateImport,
  type ImportProduct,
} from "./units";

const products: ImportProduct[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    name: "75″ LED-TV",
    sku: "TV75",
    item_kind: "rental",
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    name: "Högtalarstativ",
    sku: null,
    item_kind: "rental",
  },
  {
    id: "33333333-3333-3333-3333-333333333333",
    name: "75″ TV-paket",
    sku: null,
    item_kind: "bundle",
  },
];

const run = (csv: string, existing: string[] = []) =>
  validateImport(parseCsv(csv), products, new Set(existing));

describe("unit CSV import", () => {
  it("accepts semicolon and comma separators with a header row", () => {
    expect(run("product;serial\nTV75;A1").rows[0]?.serial).toBe("A1");
    expect(run("product,serial\nTV75,A1").rows[0]?.serial).toBe("A1");
  });

  it("matches product by SKU, exact name (case-insensitive) or id", () => {
    const { rows } = run("product\ntv75\nhögtalarstativ\n22222222-2222-2222-2222-222222222222");
    expect(rows.map((r) => r.product?.id)).toEqual([
      products[0]!.id,
      products[1]!.id,
      products[1]!.id,
    ]);
  });

  it("flags unknown products", () => {
    expect(run("product\nNope").rows[0]?.errors[0]).toContain("Unknown product");
  });

  it("flags a duplicate serial within the file for the same product", () => {
    const { rows } = run("product;serial\nTV75;S1\nTV75;s1");
    expect(rows[0]?.errors).toEqual([]);
    expect(rows[1]?.errors[0]).toContain("Duplicate serial");
  });

  it("flags a serial that already exists in the database for that product", () => {
    const { rows } = run("product;serial\nTV75;S9", [`${products[0]!.id}|s9`]);
    expect(rows[0]?.errors[0]).toContain("already exists");
  });

  it("rejects more than 1000 rows", () => {
    const csv = ["product", ...Array.from({ length: 1001 }, () => "TV75")].join("\n");
    expect(run(csv).globalErrors.length).toBe(1);
  });

  it("rejects bundles, which cannot have units", () => {
    expect(run("product\n75″ TV-paket").rows[0]?.errors[0]).toContain("bundle");
  });

  it("groups valid rows per product, location and serial/no-serial", () => {
    const { rows } = run(
      "product;serial;location\nTV75;S1;A\nTV75;S2;A\nTV75;;A\nTV75;S3;B\nNope;;",
    );
    const groups = planImportGroups(rows);
    expect(groups.map((g) => g.rows.length)).toEqual([2, 1, 1]);
  });

  it("previews S/N codes in the order create_units issues them (group by group, file order inside)", () => {
    const { rows } = run(
      "product;serial;location\nTV75;S1;A\nHögtalarstativ;;\nTV75;;A\nTV75;S2;A",
    );
    expect(importCreationOrder(planImportGroups(rows)).map((o) => o.line)).toEqual([2, 5, 3, 4]);
  });

  it("names batches prefix-YYYYMMDD-HHmm", () => {
    expect(batchName("import", new Date(2026, 10, 3, 9, 5))).toBe("import-20261103-0905");
  });
});

describe("scanner move warnings", () => {
  it("check out expects an Available unit", () => {
    expect(moveWarning("check_out", "in_stock")).toBeNull();
    expect(moveWarning("check_out", "with_customer")).toBe("Not available");
  });

  it("check in expects a Checked out unit", () => {
    expect(moveWarning("check_in", "with_customer")).toBeNull();
    expect(moveWarning("check_in", "in_stock")).toBe("Not checked out");
  });

  it("always warns for damaged, in service and retired units", () => {
    for (const action of ["check_out", "check_in"] as const) {
      expect(moveWarning(action, "damaged")).toBe("Damaged");
      expect(moveWarning(action, "service")).toBe("In service");
      expect(moveWarning(action, "retired")).toBe("Retired");
    }
  });

  it("ignores the same code within 2.5 s but not after", () => {
    const last = { code: "RM-000001", at: 1_000 };
    expect(isDuplicateScan(last, "RM-000001", 3_400)).toBe(true);
    expect(isDuplicateScan(last, "RM-000001", 3_600)).toBe(false);
    expect(isDuplicateScan(last, "RM-000002", 1_100)).toBe(false);
  });
});

describe("unitErrorMessage for deletes", () => {
  it("names the units that have rental history and points to Retired", () => {
    const msg = unitErrorMessage("unit_has_rental_history:DCB001-AS001, DCB002-AS002");
    expect(msg).toContain("DCB001-AS001, DCB002-AS002");
    expect(msg).toContain("Retired");
  });
  it("explains that items on orders can't be deleted", () => {
    expect(unitErrorMessage("item_on_orders")).toMatch(/on orders/);
  });
});
