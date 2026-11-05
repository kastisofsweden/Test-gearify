import { describe, expect, it } from "vitest";

import { barcodeSaveError } from "./barcodeErrors";

describe("barcodeSaveError", () => {
  it("names the colliding code", () => {
    expect(barcodeSaveError("barcode_in_use:DCB007-AS001")).toContain("DCB007-AS001");
    expect(barcodeSaveError("barcode_in_use:DCB007-AS001")).toContain("already used");
  });
  it("passes other errors through", () => {
    expect(barcodeSaveError("forbidden")).toBe("forbidden");
  });
});
