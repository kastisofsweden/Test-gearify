import { supabase } from "@/integrations/supabase/client";

export type PageOverride = {
  page_key: string;
  page_type: string;
  slug: string;
  is_active: boolean;
  image: string | null;
  price_from: number | null;
  sv: Record<string, string>;
  en: Record<string, string>;
};

/** Editable text fields exposed in the back office. */
export const OVERRIDE_FIELDS = [
  "eyebrow",
  "h1",
  "intro",
  "meta_title",
  "meta_description",
] as const;

export type OverrideField = (typeof OVERRIDE_FIELDS)[number];

let store: Record<string, PageOverride> = {};

export const overrideKey = (type: string, slug: string) => `${type}:${slug}`;

export function setOverrides(rows: PageOverride[]) {
  store = Object.fromEntries(rows.map((row) => [row.page_key, row]));
}

export function getOverride(key: string): PageOverride | undefined {
  return store[key];
}

export async function fetchOverrides(): Promise<PageOverride[]> {
  const { data, error } = await supabase.from("site_page_overrides").select("*");
  if (error) return [];
  return (data ?? []) as unknown as PageOverride[];
}
