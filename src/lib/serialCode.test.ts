import { describe, expect, it } from "vitest";
import {
  formatUnitSerial,
  nextSerialHint,
  normalizePrefix,
  parseUnitSerial,
  sharedOrgNumbers,
} from "./serialCode";

describe("unit S/N format", () => {
  it("puts the organization number first and the item number last", () => {
    expect(formatUnitSerial("DCB", "AS", 42, 31)).toBe("DCB042-AS031");
    expect(formatUnitSerial("DCB", "AS", 43, 32)).toBe("DCB043-AS032");
    expect(formatUnitSerial("DCB", "DS", 44, 1)).toBe("DCB044-DS001");
  });

  it("uses the organization's own prefix", () => {
    expect(formatUnitSerial("AR", "DS", 1, 1)).toBe("AR001-DS001");
  });

  it("adds an overflow suffix after organization number 999", () => {
    expect(formatUnitSerial("DCB", "TV", 999, 1)).toBe("DCB999-TV001");
    expect(formatUnitSerial("DCB", "TV", 1000, 1)).toBe("DCB001-TV001-01");
  });

  it("parses back to the same numbers", () => {
    expect(parseUnitSerial("DCB042-AS031")).toEqual({
      prefix: "DCB",
      orgNo: 42,
      categoryCode: "AS",
      itemNo: 31,
    });
    expect(parseUnitSerial("DCB001-TV001-01")?.orgNo).toBe(1000);
  });

  it("normalizes a prefix to upper-case letters", () => {
    expect(normalizePrefix(" ar ")).toBe("AR");
    expect(normalizePrefix("Åby-1")).toBe("ABY");
  });

  it("shows the next organization number", () => {
    expect(nextSerialHint("AR", 0)).toBe("AR001-…");
    expect(nextSerialHint("DCB", 51)).toBe("DCB052-…");
  });

  it("finds units that repeat an organization number", () => {
    const units = [
      { serial_code: "DCB007-AS002" },
      { serial_code: "DCB007-AS003" },
      { serial_code: "DCB008-AS004" },
    ];
    expect(sharedOrgNumbers(units).map((u) => u.serial_code)).toEqual([
      "DCB007-AS002",
      "DCB007-AS003",
    ]);
  });
});
