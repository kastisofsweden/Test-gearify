import { afterEach, describe, expect, it, vi } from "vitest";

import { computeTransport, legFromRoutesResponse, transportColumns } from "./transport.server";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("computeTransport", () => {
  it("returns pending (no throw) when GOOGLE_MAPS_API_KEY is missing", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "");
    const q = await computeTransport({
      address: "Storgatan 1, Stockholm",
      equipmentIds: ["00000000-0000-4000-a000-000000000001"],
    });
    expect(q.status).toBe("pending");
    expect(q.amount).toBeNull();
  });

  it("returns pending for a too-short address", async () => {
    const q = await computeTransport({ address: "ab", equipmentIds: [] });
    expect(q.status).toBe("pending");
  });
});

describe("legFromRoutesResponse", () => {
  it("parses distance and duration", () => {
    expect(
      legFromRoutesResponse({ routes: [{ distanceMeters: 30000, duration: "2700s" }] }),
    ).toEqual({ distance_m: 30000, duration_s: 2700 });
  });
  it("treats an omitted distance as 0 m", () => {
    expect(legFromRoutesResponse({ routes: [{ duration: "12.5s" }] })).toEqual({
      distance_m: 0,
      duration_s: 12.5,
    });
  });
  it("returns null for an empty or error response", () => {
    expect(legFromRoutesResponse({})).toBeNull();
    expect(legFromRoutesResponse({ error: { code: 403 } })).toBeNull();
    expect(legFromRoutesResponse({ routes: [{ distanceMeters: 5 }] })).toBeNull();
  });
});

describe("transportColumns", () => {
  it("stores pending as null amount", () => {
    expect(
      transportColumns({
        status: "pending",
        amount: null,
        breakdown: null,
        messageSv: "",
        messageEn: "",
        reason: "x",
      }).transport_amount,
    ).toBeNull();
  });
  it("stores waived (pickup) as 0", () => {
    expect(
      transportColumns({ status: "waived", amount: 0, breakdown: null }).transport_amount,
    ).toBe(0);
  });
});
