import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, EyeOff, Save } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  OVERRIDE_FIELDS,
  overrideKey,
  type OverrideField,
  type PageOverride,
} from "@/lib/overrides";
import { PAGES, type PageType, type SitePage } from "@/lib/site";

const GROUPS: { type: PageType; label: string }[] = [
  { type: "product", label: "Products" },
  { type: "kit", label: "Packages" },
  { type: "category", label: "Categories" },
  { type: "venue", label: "Venues" },
  { type: "venue_type", label: "Venue types" },
  { type: "landing", label: "Landing pages" },
  { type: "city", label: "Cities" },
  { type: "home", label: "Home page" },
  { type: "catalog", label: "Catalog page" },
  { type: "kits", label: "Package overview" },
  { type: "venues", label: "Venue overview" },
  { type: "info", label: "Information pages" },
];

const FIELD_LABELS: Record<OverrideField, string> = {
  eyebrow: "Eyebrow",
  h1: "Heading",
  intro: "Introduction",
  meta_title: "Page title (Google)",
  meta_description: "Page description (Google)",
};

type Draft = {
  is_active: boolean;
  image: string;
  price_from: string;
  sv: Record<string, string>;
  en: Record<string, string>;
};

function draftFor(page: SitePage, override: PageOverride | undefined): Draft {
  return {
    is_active: override?.is_active ?? true,
    image: override?.image ?? "",
    price_from: override?.price_from != null ? String(override.price_from) : "",
    sv: { ...(override?.sv ?? {}) },
    en: { ...(override?.en ?? {}) },
  };
}

export function ContentTab() {
  const queryClient = useQueryClient();
  const first = PAGES[0]!;
  const [selected, setSelected] = useState<string>(overrideKey(first.type, first.slug));

  const { data: overrides = [], isLoading } = useQuery({
    queryKey: ["site_page_overrides"],
    queryFn: async () => {
      const { data, error } = await supabase.from("site_page_overrides").select("*");
      if (error) throw error;
      return (data ?? []) as unknown as PageOverride[];
    },
  });

  const overrideMap = useMemo(
    () => Object.fromEntries(overrides.map((o) => [o.page_key, o])),
    [overrides],
  );

  const page = useMemo(
    () => PAGES.find((p) => overrideKey(p.type, p.slug) === selected) ?? first,
    [selected, first],
  );
  const override = overrideMap[selected];

  const [draft, setDraft] = useState<Draft>(() => draftFor(page, override));
  const [loadedFor, setLoadedFor] = useState<string>(selected);

  if (loadedFor !== selected || (override && loadedFor === selected && !draft.sv && !draft.en)) {
    setLoadedFor(selected);
    setDraft(draftFor(page, override));
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        page_key: selected,
        page_type: page.type,
        slug: page.slug,
        is_active: draft.is_active,
        image: draft.image.trim() || null,
        price_from: draft.price_from.trim() ? Number(draft.price_from) : null,
        sv: draft.sv,
        en: draft.en,
      };
      const { error } = await supabase
        .from("site_page_overrides")
        .upsert(payload, { onConflict: "page_key" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Page updated");
      queryClient.invalidateQueries({ queryKey: ["site_page_overrides"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reset = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("site_page_overrides")
        .delete()
        .eq("page_key", selected);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("The page now uses the original content again");
      setDraft(draftFor(page, undefined));
      queryClient.invalidateQueries({ queryKey: ["site_page_overrides"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setField = (lang: "sv" | "en", field: string, value: string) =>
    setDraft((d) => ({ ...d, [lang]: { ...d[lang], [field]: value } }));

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="max-h-[75vh] overflow-y-auto rounded-lg border border-border bg-card p-3">
        {GROUPS.map((group) => {
          const pages = PAGES.filter((p) => p.type === group.type).sort(
            (a, b) => a.order - b.order,
          );
          if (!pages.length) return null;
          return (
            <div key={group.type} className="mb-4">
              <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
              </p>
              {pages.map((p) => {
                const key = overrideKey(p.type, p.slug);
                const o = overrideMap[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelected(key)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                      key === selected
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground hover:bg-muted"
                    }`}
                  >
                    {o?.is_active === false ? (
                      <EyeOff className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <Eye className="h-3.5 w-3.5 shrink-0 opacity-40" />
                    )}
                    <span className="truncate">{o?.sv?.["h1"] || p.content.sv.h1 || p.slug}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </aside>

      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{page.type}</p>
            <p className="font-semibold text-foreground">{page.path.sv}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setDraft((d) => ({ ...d, is_active: !d.is_active }))}
            >
              {draft.is_active ? "Hide page" : "Show page"}
            </Button>
            <Button variant="outline" onClick={() => reset.mutate()} disabled={!override}>
              Reset
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              <Save className="mr-2 h-4 w-4" />
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>

        <div className="grid gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-2">
          <div>
            <Label>Image URL</Label>
            <Input
              value={draft.image}
              placeholder={page.image}
              onChange={(e) => setDraft((d) => ({ ...d, image: e.target.value }))}
            />
          </div>
          <div>
            <Label>Price from (SEK / week)</Label>
            <Input
              type="number"
              value={draft.price_from}
              placeholder={page.price_from ? String(page.price_from) : "—"}
              onChange={(e) => setDraft((d) => ({ ...d, price_from: e.target.value }))}
            />
          </div>
        </div>

        {(["sv", "en"] as const).map((lang) => (
          <div key={lang} className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-4 font-semibold text-foreground">
              {lang === "sv" ? "Swedish" : "English"}
            </h3>
            <div className="space-y-4">
              {OVERRIDE_FIELDS.map((field) => (
                <div key={field}>
                  <Label>{FIELD_LABELS[field]}</Label>
                  {field === "intro" || field === "meta_description" ? (
                    <Textarea
                      rows={3}
                      value={draft[lang][field] ?? ""}
                      placeholder={page.content[lang][field]}
                      onChange={(e) => setField(lang, field, e.target.value)}
                    />
                  ) : (
                    <Input
                      value={draft[lang][field] ?? ""}
                      placeholder={page.content[lang][field]}
                      onChange={(e) => setField(lang, field, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        <p className="text-sm text-muted-foreground">
          Empty fields use the original content from avrental.se.
        </p>
      </div>
    </div>
  );
}
