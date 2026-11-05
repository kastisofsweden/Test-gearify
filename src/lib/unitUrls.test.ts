import { afterEach, describe, expect, it, vi } from "vitest";
import { PUBLISHED_SITE_URL, unitPublicUrl } from "./unitUrls";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("unit QR URL base", () => {
  it("uses VITE_PUBLIC_SITE_URL when set", () => {
    vi.stubEnv("VITE_PUBLIC_SITE_URL", "https://example.test/");
    vi.stubGlobal("window", { location: { origin: "https://preview.test" } });
    expect(unitPublicUrl("abc")).toBe("https://example.test/i/abc");
  });

  it("falls back to the browser origin", () => {
    vi.stubEnv("VITE_PUBLIC_SITE_URL", "");
    vi.stubGlobal("window", { location: { origin: "https://preview.test" } });
    expect(unitPublicUrl("abc")).toBe("https://preview.test/i/abc");
  });

  it("falls back to the published site on the server", () => {
    vi.stubEnv("VITE_PUBLIC_SITE_URL", "");
    expect(unitPublicUrl("abc")).toBe(`${PUBLISHED_SITE_URL}/i/abc`);
    expect(PUBLISHED_SITE_URL).toBe("https://renthub.se");
  });
});
