import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { nextSerialHint, normalizePrefix } from "@/lib/serialCode";

export type Organization = {
  id: string;
  name: string;
  org_number: string | null;
  email: string | null;
  notes: string | null;
  is_active: boolean;
  parent_id: string | null;
  item_prefix: string | null;
  next_item_number: number;
  item_prefix_locked: boolean;
  label_email: string | null;
  label_brand_name: string | null;
  label_logo_url: string | null;
  commission_type: string | null;
  commission_value: number | null;
};

const LOGO_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** Uploads a black label logo to item-images/org-logos/<org id>.<ext> and returns its public URL. */
async function uploadOrgLogo(orgId: string, file: File): Promise<string> {
  const ext = LOGO_TYPES[file.type];
  if (!ext) throw new Error("Logo must be PNG, JPEG or WebP (SVG is not allowed in storage)");
  if (file.size > 5 * 1024 * 1024) throw new Error("Logo must be 5 MB or smaller");
  const path = `org-logos/${orgId}.${ext}`;
  const { error } = await supabase.storage
    .from("item-images")
    .upload(path, file, { contentType: file.type, upsert: true });
  if (error) throw error;
  const url = supabase.storage.from("item-images").getPublicUrl(path).data.publicUrl;
  return `${url}?v=${Date.now()}`;
}

const ORG_ERRORS: Record<string, string> = {
  parent_must_be_main_organization: "A sub-organization can only belong to a main organization",
  organization_has_sub_organizations:
    "This organization has sub-organizations, so it must stay a main organization",
  sub_organization_cannot_have_prefix: "Sub-organizations share their main organization's prefix",
  series_parent_locked:
    "S/N codes have already been issued from this organization's own series, so it can't become a sub-organization",
  item_prefix_locked: "S/N codes have already been issued, so the parent can no longer change",
  organizations_item_prefix_format: "Prefix must be 1–6 letters A–Z",
  organizations_item_prefix_key: "Another organization already uses that prefix",
};

function orgError(message: string) {
  const key = Object.keys(ORG_ERRORS).find((k) => message.includes(k));
  if (key) return ORG_ERRORS[key]!;
  return message.includes("duplicate") ? "An organization with that name already exists" : message;
}

export const ORGANIZATIONS_QUERY_KEY = ["organizations"];

export function useOrganizations() {
  return useQuery({
    queryKey: ORGANIZATIONS_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from("organizations").select("*").order("name");
      if (error) throw error;
      return data as Organization[];
    },
  });
}

type Draft = Partial<Organization> & { name: string };

export function OrganizationsTab() {
  const qc = useQueryClient();
  const { data: orgs = [], isLoading } = useOrganizations();
  const { data: counts = {} } = useQuery({
    queryKey: ["organizations", "counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("equipment").select("organization_id");
      if (error) throw error;
      const c: Record<string, number> = {};
      for (const r of data)
        if (r.organization_id) c[r.organization_id] = (c[r.organization_id] ?? 0) + 1;
      return c;
    },
  });
  // Last unit number issued per main organization (counter scope "units:<org id>").
  const { data: lastUnitNo = {} } = useQuery({
    queryKey: ["organizations", "serial-counters"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("serial_counters")
        .select("scope, last_value")
        .like("scope", "units:%");
      if (error) throw error;
      const m: Record<string, number> = {};
      for (const r of data) m[r.scope.slice("units:".length)] = Number(r.last_value);
      return m;
    },
  });
  const nextSnText = (org: Pick<Organization, "id" | "item_prefix">) =>
    nextSerialHint(org.item_prefix ?? "", lastUnitNo[org.id] ?? 0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const payload = {
        name: d.name.trim(),
        org_number: d.org_number?.trim() || null,
        email: d.email?.trim() || null,
        notes: d.notes?.trim() || null,
        is_active: d.is_active ?? true,
        parent_id: d.parent_id || null,
        item_prefix: d.parent_id ? null : normalizePrefix(d.item_prefix ?? "") || null,
        label_email: d.label_email?.trim() || null,
        label_brand_name: d.label_brand_name?.trim() || null,
        label_logo_url: d.label_logo_url || null,
        commission_type:
          d.commission_type === "percent" || d.commission_type === "fixed"
            ? d.commission_type
            : null,
        commission_value:
          (d.commission_type === "percent" || d.commission_type === "fixed") &&
          d.commission_value !== null &&
          d.commission_value !== undefined &&
          String(d.commission_value) !== ""
            ? Math.max(0, Number(d.commission_value))
            : null,
      };
      const { data: row, error } = d.id
        ? await supabase.from("organizations").update(payload).eq("id", d.id).select("id").single()
        : await supabase.from("organizations").insert(payload).select("id").single();
      if (error) throw error;
      if (logoFile) {
        const url = await uploadOrgLogo(row.id, logoFile);
        const { error: e2 } = await supabase
          .from("organizations")
          .update({ label_logo_url: url })
          .eq("id", row.id);
        if (e2) throw e2;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ORGANIZATIONS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: ["unit-serial-repair"] });
      setDraft(null);
      setLogoFile(null);
      qc.invalidateQueries({ queryKey: ["equipment", "owners"] });
      toast.success("Organization saved");
    },
    onError: (e: Error) => toast.error(orgError(e.message)),
  });

  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl">Organizations</h2>
          <p className="text-sm text-muted-foreground">
            Owner companies. Every product must belong to one.
          </p>
        </div>
        <Button onClick={() => setDraft({ name: "", is_active: true })}>
          <Plus className="size-4" /> New organization
        </Button>
      </div>

      {draft && (
        <form
          className="grid gap-3 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.name.trim()) {
              toast.error("Name is required");
              return;
            }
            save.mutate(draft);
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="org-name">Name *</Label>
            <Input
              id="org-name"
              required
              maxLength={120}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="org-nr">Org. number</Label>
            <Input
              id="org-nr"
              maxLength={40}
              value={draft.org_number ?? ""}
              onChange={(e) => setDraft({ ...draft, org_number: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="org-email">Email</Label>
            <Input
              id="org-email"
              type="email"
              maxLength={200}
              value={draft.email ?? ""}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="org-parent">Main organization</Label>
            <select
              id="org-parent"
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={draft.parent_id ?? ""}
              disabled={draft.item_prefix_locked}
              onChange={(e) => setDraft({ ...draft, parent_id: e.target.value || null })}
            >
              <option value="">None — this is a main organization</option>
              {orgs
                .filter((o) => !o.parent_id && o.id !== draft.id)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
            </select>
          </div>
          {!draft.parent_id && (
            <div className="grid gap-2">
              <Label htmlFor="org-prefix">S/N prefix</Label>
              <Input
                id="org-prefix"
                maxLength={6}
                placeholder="e.g. AR"
                className="font-mono uppercase"
                value={draft.item_prefix ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, item_prefix: normalizePrefix(e.target.value) })
                }
              />
              <p className="text-xs text-muted-foreground">
                1–6 letters A–Z (empty = first letter of each word in the name). Unit S/Ns start
                with it, e.g.{" "}
                <span className="font-mono">
                  {nextSnText({ id: draft.id ?? "", item_prefix: draft.item_prefix || "AR" })}
                </span>
                . Sub-organizations use this prefix and number series.
                {draft.item_prefix_locked
                  ? " A change applies to new S/Ns only — existing S/Ns stay as they are and keep scanning, and the numbering continues."
                  : ""}
              </p>
            </div>
          )}
          <div className="flex items-center gap-2 pt-6">
            <Switch
              checked={draft.is_active ?? true}
              onCheckedChange={(v) => setDraft({ ...draft, is_active: v })}
            />
            <span className="text-sm">{(draft.is_active ?? true) ? "Active" : "Archived"}</span>
          </div>
          <div className="grid gap-3 rounded-xl border border-border p-4 sm:col-span-2 sm:grid-cols-2">
            <p className="text-sm font-medium sm:col-span-2">
              Label branding
              <span className="block text-xs font-normal text-muted-foreground">
                Printed on this organization&apos;s unit labels. Empty fields use the main
                organization&apos;s value, then the default (rent@dreamgroupsweden.se, no logo).
              </span>
            </p>
            <div className="grid gap-2">
              <Label htmlFor="org-commission-type">Commission</Label>
              <select
                id="org-commission-type"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={draft.commission_type ?? ""}
                onChange={(e) => setDraft({ ...draft, commission_type: e.target.value || null })}
              >
                <option value="">None</option>
                <option value="percent">Percent of base rental</option>
                <option value="fixed">Fixed kr per rented unit</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="org-commission-value">
                Commission value {draft.commission_type === "fixed" ? "(kr / unit)" : "(%)"}
              </Label>
              <Input
                id="org-commission-value"
                type="number"
                min={0}
                step="0.01"
                disabled={!draft.commission_type}
                value={draft.commission_value ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    commission_value: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="org-label-email">Label e-mail</Label>
              <Input
                id="org-label-email"
                type="email"
                maxLength={200}
                placeholder="rent@dreamgroupsweden.se"
                value={draft.label_email ?? ""}
                onChange={(e) => setDraft({ ...draft, label_email: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="org-label-brand">Brand name</Label>
              <Input
                id="org-label-brand"
                maxLength={60}
                value={draft.label_brand_name ?? ""}
                onChange={(e) => setDraft({ ...draft, label_brand_name: e.target.value })}
              />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="org-label-logo">Label logo (black PNG recommended)</Label>
              <div className="flex flex-wrap items-center gap-3">
                {(logoFile || draft.label_logo_url) && (
                  <img
                    src={logoFile ? URL.createObjectURL(logoFile) : draft.label_logo_url!}
                    alt="Label logo"
                    className="h-10 rounded bg-white p-1"
                  />
                )}
                <Input
                  id="org-label-logo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="max-w-xs"
                  onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                />
                {(logoFile || draft.label_logo_url) && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setLogoFile(null);
                      setDraft({ ...draft, label_logo_url: null });
                    }}
                  >
                    Remove logo
                  </Button>
                )}
              </div>
            </div>
          </div>
          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="org-notes">Notes</Label>
            <Textarea
              id="org-notes"
              maxLength={1000}
              value={draft.notes ?? ""}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={save.isPending}>
              Save
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDraft(null);
                setLogoFile(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {isLoading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
        {orgs.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setDraft(o)}
            className="flex w-full items-center gap-4 border-b border-border p-4 text-left last:border-0 hover:bg-secondary/50"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium">{o.name}</p>
              <p className="text-xs text-muted-foreground">
                {[
                  o.parent_id
                    ? `Sub-organization of ${orgs.find((p) => p.id === o.parent_id)?.name ?? "—"}`
                    : null,
                  o.item_prefix ? `S/N prefix ${o.item_prefix} · next unit ${nextSnText(o)}` : null,
                  o.org_number,
                  o.email,
                  o.label_email ? `Label ${o.label_email}` : null,
                  o.label_logo_url ? "logo" : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </p>
            </div>
            <span className="text-xs text-muted-foreground">{counts[o.id] ?? 0} products</span>
            {!o.is_active && (
              <span className="rounded bg-secondary px-2 py-0.5 text-xs">Archived</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
