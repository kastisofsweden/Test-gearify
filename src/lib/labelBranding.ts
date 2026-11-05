import { DEFAULT_LABEL_FOOTER } from "@/lib/productLabel";

/** Branding columns of an organization row. */
export type BrandingOrg = {
  id: string;
  parent_id: string | null;
  label_email: string | null;
  label_brand_name: string | null;
  label_logo_url: string | null;
};

export type LabelBranding = {
  footerEmail: string;
  brandName: string | null;
  logoUrl: string | null;
};

export const DEFAULT_BRANDING: LabelBranding = {
  footerEmail: DEFAULT_LABEL_FOOTER,
  brandName: null,
  logoUrl: null,
};

const clean = (v: string | null | undefined) => v?.trim() || null;

/**
 * Branding for an organization: each field comes from the organization itself, else from its main
 * organization (sub-organizations share the main organization's S/N series, so they share its look
 * unless they override a field), else the Renthub default.
 */
export function resolveOrgBranding(
  orgId: string | null | undefined,
  orgs: Map<string, BrandingOrg> | BrandingOrg[],
): LabelBranding {
  const byId = Array.isArray(orgs) ? new Map(orgs.map((o) => [o.id, o])) : orgs;
  const org = orgId ? byId.get(orgId) : undefined;
  if (!org) return DEFAULT_BRANDING;
  const main = org.parent_id ? byId.get(org.parent_id) : undefined;
  const pick = (k: "label_email" | "label_brand_name" | "label_logo_url") =>
    clean(org[k]) ?? clean(main?.[k]);
  return {
    footerEmail: pick("label_email") ?? DEFAULT_LABEL_FOOTER,
    brandName: pick("label_brand_name"),
    logoUrl: pick("label_logo_url"),
  };
}

/** equipment id -> branding of its owner organization. */
export function brandingByEquipment(
  equipment: { id: string; organization_id: string | null }[],
  orgs: BrandingOrg[],
): Map<string, LabelBranding> {
  const byId = new Map(orgs.map((o) => [o.id, o]));
  return new Map(equipment.map((e) => [e.id, resolveOrgBranding(e.organization_id, byId)]));
}
