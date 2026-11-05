import { describe, expect, it } from "vitest";

import {
  isLegacyHost,
  normalizeBaseUrl,
  PUBLISHED_SITE_URL,
  resolveQrBaseUrl,
  unitPublicUrl,
} from "./unitUrls";

describe("normalizeBaseUrl", () => {
  it("lowercases and strips the trailing slash", () => {
    expect(normalizeBaseUrl("HTTPS://Qr.Renthub.se/")).toBe("https://qr.renthub.se");
  });
  it("adds https to a bare host", () => {
    expect(normalizeBaseUrl("qr.renthub.se")).toBe("https://qr.renthub.se");
  });
  it("rejects http, paths, queries and empty input", () => {
    expect(normalizeBaseUrl("http://renthub.se")).toBeNull();
    expect(normalizeBaseUrl("https://renthub.se/i")).toBeNull();
    expect(normalizeBaseUrl("https://renthub.se/?x=1")).toBeNull();
    expect(normalizeBaseUrl("  ")).toBeNull();
  });
});

describe("resolveQrBaseUrl", () => {
  it("the back-office setting wins", () => {
    expect(
      resolveQrBaseUrl(
        { qr_base_url: "https://qr.renthub.se" },
        "https://env.test",
        "https://o.test",
      ),
    ).toBe("https://qr.renthub.se");
  });
  it("then VITE_PUBLIC_SITE_URL, then origin, then the published site", () => {
    expect(resolveQrBaseUrl({ qr_base_url: null }, "https://env.test/", "https://o.test")).toBe(
      "https://env.test",
    );
    expect(resolveQrBaseUrl(null, "", "https://o.test")).toBe("https://o.test");
    expect(resolveQrBaseUrl(null, undefined, null)).toBe(PUBLISHED_SITE_URL);
  });
  it("QR always encodes <base>/i/<token>", () => {
    expect(unitPublicUrl("tok", "https://qr.renthub.se/")).toBe("https://qr.renthub.se/i/tok");
  });
});

describe("isLegacyHost", () => {
  const s = {
    qr_base_url: "https://qr.renthub.se",
    qr_legacy_domains: ["https://gear-gems-finder.lovable.app"],
  };
  it("matches listed legacy hosts only", () => {
    expect(isLegacyHost("gear-gems-finder.lovable.app", s)).toBe(true);
    expect(isLegacyHost("qr.renthub.se", s)).toBe(false);
    expect(isLegacyHost("evil.test", s)).toBe(false);
  });
});
