import { describe, expect, it } from "vitest";
import {
  parseUnitIds,
  unitIdsParam,
  unitLabelInputs,
  unitsOfItem,
  unitsToPrint,
  type PrintableUnit,
} from "./unitLabelJob";
import { unitPublicUrl } from "./unitUrls";

const eq = { name: "Stativkjol", category: "accessories" };
const units: PrintableUnit[] = [
  {
    id: "u3",
    serial_code: "DCB007-AS003",
    qr_token: "tok3",
    created_at: "2026-11-03T10:00:00Z",
    equipment: eq,
  },
  {
    id: "u1",
    serial_code: "DCB007-AS001",
    qr_token: "tok1",
    created_at: "2026-11-01T10:00:00Z",
    equipment: eq,
  },
  {
    id: "u2",
    serial_code: "DCB007-AS002",
    qr_token: "tok2",
    created_at: "2026-11-02T10:00:00Z",
    equipment: eq,
  },
];

describe("printing selected units", () => {
  it("prints exactly one label per selected unit, each with its own S/N", () => {
    const selected = parseUnitIds(unitIdsParam(["u3", "u1"]));
    const labels = unitLabelInputs(unitsToPrint(units, selected));
    expect(labels.map((l) => l.barcodeValue)).toEqual(["DCB007-AS001", "DCB007-AS003"]);
    expect(labels.map((l) => l.idText)).toEqual(["S/N: DCB007-AS001", "S/N: DCB007-AS003"]);
  });

  it("encodes each unit's own public QR link", () => {
    const labels = unitLabelInputs(unitsToPrint(units, new Set(["u1", "u2", "u3"])));
    expect(labels.map((l) => l.qrValue)).toEqual([
      unitPublicUrl("tok1"),
      unitPublicUrl("tok2"),
      unitPublicUrl("tok3"),
    ]);
  });

  it("does not print a unit twice when it is selected twice", () => {
    expect(unitIdsParam(["u1", "u1", "u2"])).toBe("u1,u2");
  });
});

describe("printing from an item with converted stock", () => {
  // 55″ LED after converting a stock of 10: its own product code DCB008-DS002 is skipped for units.
  const led = { name: "55″ LED", category: "displays" };
  const ledCodes = [
    "DCB008-DS001",
    ...Array.from({ length: 9 }, (_, i) => `DCB008-DS${String(i + 3).padStart(3, "0")}`),
  ];
  const ledUnits = ledCodes.map((code, i) => ({
    id: `led${i}`,
    equipment_id: "led",
    serial_code: code,
    qr_token: `ledtok${i}`,
    created_at: `2026-11-04T09:00:${String(i).padStart(2, "0")}Z`,
    equipment: led,
  }));
  const other = {
    ...ledUnits[0]!,
    id: "x1",
    equipment_id: "other",
    serial_code: "DCB009-DS001",
    qr_token: "x",
  };

  it("offers exactly the item's 10 units", () => {
    const offered = unitsOfItem([other, ...ledUnits].reverse(), "led");
    expect(offered).toHaveLength(10);
    expect(offered.map((u) => u.serial_code)).toEqual(ledCodes);
  });

  it("two selected units give two labels with different S/N, barcode and QR", () => {
    const labels = unitLabelInputs(unitsToPrint(ledUnits, new Set(["led4", "led1"])));
    expect(labels.map((l) => l.idText)).toEqual(["S/N: DCB008-DS003", "S/N: DCB008-DS006"]);
    expect(labels.map((l) => l.barcodeValue)).toEqual(["DCB008-DS003", "DCB008-DS006"]);
    expect(labels.map((l) => l.qrValue)).toEqual([
      unitPublicUrl("ledtok1"),
      unitPublicUrl("ledtok4"),
    ]);
  });
});
