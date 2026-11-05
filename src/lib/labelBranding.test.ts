import { describe, expect, it } from "vitest";

import { brandingByEquipment, resolveOrgBranding, type BrandingOrg } from "./labelBranding";
import { DEFAULT_LABEL_FOOTER, footerEmailFor, footerLogoBox, layoutBatch } from "./productLabel";
import { unitLabelInputs } from "./unitLabelJob";

const INDERES = "9b744ea0-f417-4703-aaa2-bf6951348369";
const DCB = "dd8c5a96-5e94-42dc-a454-c04f290f92f3";
const LOGO = "https://cdn.test/org-logos/inderes.png";
const orgs: BrandingOrg[] = [
  {
    id: INDERES,
    parent_id: null,
    label_email: "rent@inderes.com",
    label_brand_name: "Inderes",
    label_logo_url: LOGO,
  },
  {
    id: DCB,
    parent_id: null,
    label_email: "rent@dreamgroupsweden.se",
    label_brand_name: null,
    label_logo_url: null,
  },
  {
    id: "sub",
    parent_id: INDERES,
    label_email: null,
    label_brand_name: null,
    label_logo_url: null,
  },
  {
    id: "sub-own",
    parent_id: INDERES,
    label_email: "  team@inderes.com ",
    label_brand_name: null,
    label_logo_url: null,
  },
];

describe("organization label branding", () => {
  it("uses the organization's own e-mail and logo", () => {
    expect(resolveOrgBranding(INDERES, orgs)).toEqual({
      footerEmail: "rent@inderes.com",
      brandName: "Inderes",
      logoUrl: LOGO,
    });
  });
  it("keeps the Dream Crazy Big default layout (no logo)", () => {
    expect(resolveOrgBranding(DCB, orgs)).toEqual({
      footerEmail: "rent@dreamgroupsweden.se",
      brandName: null,
      logoUrl: null,
    });
  });
  it("sub-organizations inherit the main organization's branding", () => {
    expect(resolveOrgBranding("sub", orgs).footerEmail).toBe("rent@inderes.com");
    expect(resolveOrgBranding("sub", orgs).logoUrl).toBe(LOGO);
  });
  it("a sub-organization field override wins over the parent", () => {
    const b = resolveOrgBranding("sub-own", orgs);
    expect(b.footerEmail).toBe("team@inderes.com");
    expect(b.logoUrl).toBe(LOGO);
  });
  it("unknown or missing organization falls back to the default footer", () => {
    expect(resolveOrgBranding(null, orgs).footerEmail).toBe(DEFAULT_LABEL_FOOTER);
    expect(resolveOrgBranding("nope", orgs).logoUrl).toBeNull();
  });
  it("footer e-mail falls back to the default when empty", () => {
    expect(footerEmailFor({ footerEmail: "" })).toBe("rent@dreamgroupsweden.se");
    expect(footerEmailFor({ footerEmail: "rent@inderes.com" })).toBe("rent@inderes.com");
  });
});

describe("mixed Inderes + Dream Crazy Big print job", () => {
  const branding = brandingByEquipment(
    [
      { id: "tv", organization_id: DCB },
      { id: "rack", organization_id: INDERES },
    ],
    orgs,
  );
  const units = [
    {
      id: "u1",
      serial_code: "DCB001-TV001",
      qr_token: "a".repeat(32),
      created_at: "2026-01-01",
      equipment_id: "tv",
    },
    {
      id: "u2",
      serial_code: "IS001-AS001",
      qr_token: "b".repeat(32),
      created_at: "2026-01-02",
      equipment_id: "rack",
    },
  ];
  const labels = unitLabelInputs(units, {
    baseUrl: "https://qr.renthub.se",
    brandingFor: (id) => (id ? branding.get(id) : undefined),
  });

  it("each label carries its own owner's footer and logo", () => {
    expect(labels.map((l) => l.footerEmail)).toEqual([
      "rent@dreamgroupsweden.se",
      "rent@inderes.com",
    ]);
    expect(labels.map((l) => l.logoUrl)).toEqual([null, LOGO]);
    expect(labels[1]!.qrValue).toBe(`https://qr.renthub.se/i/${"b".repeat(32)}`);
  });

  it("layouts print each label's own footer text", () => {
    const lays = layoutBatch(
      labels.map((l) => ({
        name: "Item",
        modules: 90,
        idText: l.idText,
        footerText: l.footerEmail!,
      })),
    );
    expect(lays.map((l) => l?.footer.text)).toEqual([
      "rent@dreamgroupsweden.se",
      "rent@inderes.com",
    ]);
  });

  it("the logo sits in the footer row below the codes, inside the content box", () => {
    const lay = layoutBatch([{ name: "Item", modules: 90, footerText: "rent@inderes.com" }])[0]!;
    const box = footerLogoBox(lay, 600 / 310, 20)!;
    expect(box).not.toBeNull();
    expect(box.x + box.w).toBeCloseTo(lay.grid.right, 6);
    expect(box.y + box.h).toBeCloseTo(lay.grid.bottom, 6);
    expect(box.y).toBeGreaterThan(lay.qr.y + lay.qr.h);
    expect(box.y).toBeGreaterThan(lay.bar.y + lay.bar.h);
  });
});
