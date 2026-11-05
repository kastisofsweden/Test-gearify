import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatSek, type Equipment } from "@/lib/rental";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Box,
  ChevronRight,
  Copy,
  Package,
  PackageCheck,
  Plus,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useOrganizations } from "@/components/admin/OrganizationsTab";
import { DEFAULT_WAREHOUSE_ID, useWarehouses } from "@/components/admin/backofficeData";

/** S/N parts are server-assigned on insert (serial_code) and read-only here. */
type ItemIdParts = {
  organization_id?: string | null;
  warehouse_id?: string | null;
  serial_code?: string | null;
  legacy_barcode?: string | null;
};
type Draft = Partial<Equipment> & { name: string } & ItemIdParts;
type EquipmentRow = Equipment & ItemIdParts;

/** "stands-mounts" -> "SS": first + last letter of the category (matches the database's serial_category_code). */
export function categoryCode(category: string): string {
  const l = category
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  return l.length >= 2 ? `${l[0]}${l[l.length - 1]}` : l.length === 1 ? `${l}${l}` : "XX";
}

const selectClass = "h-9 rounded-md border border-input bg-background px-3 text-sm";

function SectionRail({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="lg:sticky lg:top-6">
      <h3 className="font-display text-xl">{title}</h3>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </div>
  );
}

function ChoiceCard({
  selected,
  onSelect,
  title,
  description,
  example,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  description: string;
  example?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-xl border p-4 text-left transition-colors ${
        selected
          ? "border-primary bg-primary/5"
          : "border-border bg-card hover:border-foreground/30"
      }`}
    >
      <span className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border ${
            selected ? "border-primary" : "border-muted-foreground/40"
          }`}
        >
          {selected && <span className="size-2 rounded-full bg-primary" />}
        </span>
        <span>
          <span className="block font-medium">{title}</span>
          <span className="mt-0.5 block text-sm text-muted-foreground">{description}</span>
        </span>
      </span>
      {example && (
        <div className="mt-3 rounded-lg bg-amber-50 p-3 dark:bg-amber-950/30">
          <p className="mb-2 text-xs font-semibold">Example</p>
          {example}
        </div>
      )}
    </button>
  );
}

export function EquipmentTab() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["equipment", "admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipment")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as Equipment[];
    },
  });

  const { data: taxRates = [] } = useQuery({
    queryKey: ["tax-rates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tax_rates")
        .select("id, name, percent, is_default")
        .order("percent", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: orgs = [] } = useOrganizations();
  const { data: warehouses = [] } = useWarehouses();
  const orgName = (id?: string | null) => orgs.find((o) => o.id === id)?.name;

  const save = useMutation({
    mutationFn: async (item: Draft) => {
      const payload = {
        name: item.name,
        category: (item.category ?? "").trim(),
        description: item.description ?? null,
        daily_price: Number(item.daily_price ?? 0),
        image_url: item.image_url ?? null,
        tag: item.tag ?? null,
        is_active: item.is_active ?? true,
        sort_order: Number(item.sort_order ?? 0),
        item_kind: item.item_kind ?? "rental",
        tracking: item.tracking ?? "bulk",
        parent_id: item.parent_id || null,
        variant_label: item.variant_label || null,
        rate_unit: item.rate_unit ?? "day",
        fixed_price: Number(item.fixed_price ?? 0),
        deposit_type: item.deposit_type ?? "none",
        deposit_value: Number(item.deposit_value ?? 0),
        tax_rate_id: item.tax_rate_id || null,
        barcode: item.barcode || null,
        organization_id: item.organization_id || null,
        warehouse_id: item.warehouse_id || DEFAULT_WAREHOUSE_ID,
      };

      if (item.id) {
        const { error } = await supabase.from("equipment").update(payload).eq("id", item.id);
        if (error) throw error;
        return;
      }
      const { data, error } = await supabase
        .from("equipment")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      if (payload.item_kind === "rental" && payload.tracking === "serialized") {
        // First physical unit (S/N …001) is created right away.
        const { error: unitErr } = await supabase.rpc("create_units", {
          _equipment_id: data.id,
          _count: 1,
        });
        if (unitErr) throw unitErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipment"] });
      setDraft(null);
      toast.success("Product saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("equipment").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["equipment"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("equipment").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipment"] });
      toast.success("Product removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!draft.category?.trim()) {
      toast.error("Category is required");
      return;
    }
    if (!draft.organization_id) {
      toast.error("Parent organization is required");
      return;
    }
    save.mutate(draft);
  };

  if (draft) {
    const kind = draft.item_kind ?? "rental";
    const tracking = (draft as Equipment).tracking ?? "bulk";
    const isNew = !draft.id;

    return (
      <form
        className="grid gap-8"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-lg">
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setDraft(null)}
            >
              Products
            </button>
            <ChevronRight className="size-4 text-muted-foreground" />
            <span className="font-display text-2xl">{isNew ? "New product" : draft.name}</span>
          </p>
          <div className="flex gap-2">
            {!isNew && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const { id: _id, ...rest } = draft;
                  setDraft({
                    ...rest,
                    name: `${draft.name} (copy)`,
                    barcode: null,
                    serial_code: null,
                    legacy_barcode: null,
                  });
                  toast.message("Duplicated — adjust and save as a new product");
                }}
              >
                <Copy className="size-4" /> Duplicate product
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {isNew ? "Create product" : "Save changes"}
            </Button>
          </div>
        </div>

        {/* General information */}
        <section className="grid gap-6 border-t border-border pt-6 lg:grid-cols-[260px_1fr]">
          <SectionRail title="General information">
            <p>
              Get started with a name and image for your product. This is how it will be displayed
              to clients in the online store and on documents.
            </p>
          </SectionRail>
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="grid gap-5 sm:grid-cols-[1fr_260px]">
              <div className="grid content-start gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="eq-name">Product name</Label>
                  <Input
                    id="eq-name"
                    value={draft.name}
                    maxLength={140}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="eq-image">Image URL</Label>
                  <Input
                    id="eq-image"
                    value={draft.image_url ?? ""}
                    maxLength={500}
                    placeholder="https://…"
                    onChange={(e) => setDraft({ ...draft, image_url: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="eq-desc">Description</Label>
                  <Textarea
                    id="eq-desc"
                    rows={4}
                    maxLength={1000}
                    value={draft.description ?? ""}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  />
                </div>
              </div>
              <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-secondary/40">
                {draft.image_url ? (
                  <>
                    <img
                      src={draft.image_url}
                      alt={draft.name || "Product image"}
                      className="h-full w-full object-contain p-3"
                    />
                    <button
                      type="button"
                      aria-label="Remove image"
                      className="absolute right-2 top-2 rounded-md border border-border bg-card p-1.5 hover:bg-secondary"
                      onClick={() => setDraft({ ...draft, image_url: null })}
                    >
                      <X className="size-4" />
                    </button>
                  </>
                ) : (
                  <p className="px-6 text-center text-xs text-muted-foreground">
                    Paste an image URL to preview the product photo here
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Product type */}
        <section className="grid gap-6 border-t border-border pt-6 lg:grid-cols-[260px_1fr]">
          <SectionRail title="Product type">
            <p>
              The tracking method determines if (and how detailed) a product's inventory is tracked.
            </p>
            <p>You can not change the tracking method later without clearing stock.</p>
          </SectionRail>
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <ChoiceCard
                selected={kind === "rental"}
                onSelect={() => setDraft({ ...draft, item_kind: "rental" })}
                title="Rental product"
                description="For items meant to be rented and returned."
              />
              <ChoiceCard
                selected={kind === "service"}
                onSelect={() => setDraft({ ...draft, item_kind: "service" })}
                title="Service"
                description="Intangible work like delivery or setup. No stock, always available."
              />
              <ChoiceCard
                selected={kind === "bundle"}
                onSelect={() => setDraft({ ...draft, item_kind: "bundle" })}
                title="Bundle / kit"
                description="A package that reserves all of its component products together."
              />
            </div>
            {kind === "rental" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <ChoiceCard
                  selected={tracking === "serialized"}
                  onSelect={() => setDraft({ ...draft, tracking: "serialized" })}
                  title="Track individually"
                  description="Monitor unique items separately. Ideal for products with specific identifiers or individual tracking needs."
                  example={
                    <div className="rounded-md bg-card p-3">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        <PackageCheck className="size-4" /> Sony A7 IV
                      </p>
                      <p className="text-xs text-muted-foreground">2 available</p>
                      <div className="mt-2 flex gap-2">
                        <span className="rounded-full border border-border px-2 py-0.5 text-xs">
                          A7IV-1
                        </span>
                        <span className="rounded-full border border-border px-2 py-0.5 text-xs">
                          A7IV-2
                        </span>
                      </div>
                    </div>
                  }
                />
                <ChoiceCard
                  selected={tracking === "bulk"}
                  onSelect={() => setDraft({ ...draft, tracking: "bulk" })}
                  title="Track quantities"
                  description="Simplify tracking by managing similar, interchangeable items collectively."
                  example={
                    <div className="rounded-md bg-card p-3">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        <Box className="size-4" /> XLR cable 10 m
                      </p>
                      <p className="text-xs text-muted-foreground">55 available</p>
                    </div>
                  }
                />
              </div>
            )}
          </div>
        </section>

        {/* Pricing */}
        <section className="grid gap-6 border-t border-border pt-6 lg:grid-cols-[260px_1fr]">
          <SectionRail title="Pricing">
            <p>Set how this product is charged: per hour, day, week, month, or one fixed price.</p>
            <p>
              Tiered and seasonal adjustments are managed in the Pricing &amp; tax tab. Tax and
              deposit are applied per product.
            </p>
          </SectionRail>
          <div className="grid gap-3 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="eq-rate">Charge</Label>
              <select
                id="eq-rate"
                className={selectClass}
                value={draft.rate_unit ?? "day"}
                onChange={(e) => setDraft({ ...draft, rate_unit: e.target.value })}
              >
                <option value="day">Per day</option>
                <option value="hour">Per hour</option>
                <option value="week">Per week</option>
                <option value="month">Per month</option>
                <option value="fixed">Fixed price</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="eq-price">
                {draft.rate_unit === "fixed"
                  ? "Price (SEK)"
                  : `Price per ${draft.rate_unit ?? "day"} (SEK)`}
              </Label>
              <Input
                id="eq-price"
                type="number"
                min={0}
                step="1"
                value={String(draft.daily_price ?? 0)}
                onChange={(e) => setDraft({ ...draft, daily_price: Number(e.target.value) })}
              />
            </div>
            {draft.rate_unit === "fixed" && (
              <div className="grid gap-2">
                <Label htmlFor="eq-fixed">Fixed price amount (SEK)</Label>
                <Input
                  id="eq-fixed"
                  type="number"
                  min={0}
                  value={String(draft.fixed_price ?? 0)}
                  onChange={(e) => setDraft({ ...draft, fixed_price: Number(e.target.value) })}
                />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="eq-tax">Tax rate</Label>
              <select
                id="eq-tax"
                className={selectClass}
                value={draft.tax_rate_id ?? ""}
                onChange={(e) => setDraft({ ...draft, tax_rate_id: e.target.value || null })}
              >
                <option value="">Default</option>
                {taxRates.map((rate) => (
                  <option key={rate.id} value={rate.id}>
                    {rate.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="eq-dep-type">Deposit</Label>
              <select
                id="eq-dep-type"
                className={selectClass}
                value={draft.deposit_type ?? "none"}
                onChange={(e) => setDraft({ ...draft, deposit_type: e.target.value })}
              >
                <option value="none">No deposit</option>
                <option value="fixed">Fixed amount</option>
                <option value="percent">% of line total</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="eq-dep-value">
                Deposit {draft.deposit_type === "percent" ? "(%)" : "(SEK)"}
              </Label>
              <Input
                id="eq-dep-value"
                type="number"
                min={0}
                value={String(draft.deposit_value ?? 0)}
                onChange={(e) => setDraft({ ...draft, deposit_value: Number(e.target.value) })}
              />
            </div>
          </div>
        </section>

        {/* Organization */}
        <section className="grid gap-6 border-t border-border pt-6 lg:grid-cols-[260px_1fr]">
          <SectionRail title="Organization">
            <p>How this product is grouped, tagged and identified in the store and warehouse.</p>
          </SectionRail>
          <div className="grid gap-3 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="eq-org">Parent organization *</Label>
              <select
                id="eq-org"
                required
                className={selectClass}
                value={draft.organization_id ?? ""}
                onChange={(e) => setDraft({ ...draft, organization_id: e.target.value || null })}
              >
                <option value="">Select organization…</option>
                {orgs
                  .filter((o) => o.is_active || o.id === draft.organization_id)
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
              </select>
              {orgs.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Create one under Organizations first.
                </p>
              )}
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="eq-warehouse">Warehouse</Label>
              <select
                id="eq-warehouse"
                className={selectClass}
                value={draft.warehouse_id ?? DEFAULT_WAREHOUSE_ID}
                onChange={(e) => setDraft({ ...draft, warehouse_id: e.target.value })}
              >
                {warehouses
                  .filter((w) => w.is_active || w.id === draft.warehouse_id)
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="eq-sn">S/N</Label>
              <Input
                id="eq-sn"
                readOnly
                disabled
                className="font-mono"
                value={draft.serial_code ?? ""}
                placeholder={`Assigned on save, e.g. ${(() => {
                  const o = orgs.find((x) => x.id === draft.organization_id);
                  return (
                    o?.item_prefix ?? orgs.find((x) => x.id === o?.parent_id)?.item_prefix ?? "XX"
                  );
                })()}013-${categoryCode(draft.category ?? "")}000`}
              />
              <p className="text-xs text-muted-foreground">
                {draft.serial_code
                  ? "Assigned once and never changes."
                  : "Product code: main organization prefix + item number, then the category code. Each physical unit gets its own S/N: the organization's next free unit number, then the unit number within the item."}
                {draft.legacy_barcode
                  ? ` Old label code: ${draft.legacy_barcode} (still scans).`
                  : ""}
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="eq-cat">Category *</Label>
              <Input
                id="eq-cat"
                required
                list="eq-cat-options"
                value={draft.category ?? ""}
                maxLength={80}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              />
              <datalist id="eq-cat-options">
                {[...new Set(items.map((i) => i.category).filter(Boolean))].sort().map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="eq-tag">Tag</Label>
              <Input
                id="eq-tag"
                value={draft.tag ?? ""}
                maxLength={40}
                onChange={(e) => setDraft({ ...draft, tag: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="eq-sort">Sort order</Label>
              <Input
                id="eq-sort"
                type="number"
                value={String(draft.sort_order ?? 0)}
                onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="eq-barcode">Barcode / QR code</Label>
              <Input
                id="eq-barcode"
                value={draft.barcode ?? ""}
                maxLength={80}
                placeholder="Auto-generated if left empty"
                onChange={(e) => setDraft({ ...draft, barcode: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="eq-parent">Variant of</Label>
              <select
                id="eq-parent"
                className={selectClass}
                value={draft.parent_id ?? ""}
                onChange={(e) => setDraft({ ...draft, parent_id: e.target.value || null })}
              >
                <option value="">Standalone product</option>
                {items
                  .filter((i) => i.id !== draft.id && !i.parent_id)
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="eq-variant">Variant label</Label>
              <Input
                id="eq-variant"
                value={draft.variant_label ?? ""}
                maxLength={80}
                placeholder="e.g. 75 inch, Black"
                onChange={(e) => setDraft({ ...draft, variant_label: e.target.value })}
              />
            </div>
          </div>
        </section>

        {/* Footer actions */}
        <div className="sticky bottom-0 -mx-1 flex justify-end gap-2 border-t border-border bg-background/95 px-1 py-3 backdrop-blur">
          <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {isNew ? "Create product" : "Save changes"}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl">Products</h2>
        <Button
          onClick={() =>
            setDraft({
              name: "",
              category: "",
              daily_price: 0,
              item_kind: "rental",
              tracking: "bulk",
              organization_id: orgs.length === 1 ? orgs[0]!.id : null,
            })
          }
        >
          <Plus className="size-4" /> New product
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {isLoading && <p className="text-sm text-muted-foreground">Loading catalog…</p>}
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setDraft(item)}
            className="flex gap-4 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-foreground/30"
          >
            <div className="size-20 shrink-0 overflow-hidden rounded-xl bg-secondary">
              {item.image_url ? (
                <img
                  src={item.image_url}
                  alt={item.name}
                  loading="lazy"
                  className="h-full w-full object-contain p-1"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  {item.item_kind === "service" ? (
                    <Wrench className="size-6" />
                  ) : item.item_kind === "bundle" ? (
                    <Package className="size-6" />
                  ) : (
                    <Box className="size-6" />
                  )}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{item.name}</p>
              <p className="text-xs text-muted-foreground">{item.category}</p>
              <p className="mt-1 font-display text-xl">
                {formatSek(Number(item.daily_price))} /{" "}
                {item.rate_unit === "fixed" ? "fixed" : (item.rate_unit ?? "day")}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <Switch
                  checked={item.is_active}
                  onClick={(e) => e.stopPropagation()}
                  onCheckedChange={(checked) =>
                    toggleActive.mutate({ id: item.id, is_active: checked })
                  }
                />
                <span className="text-xs text-muted-foreground">
                  {item.is_active ? "Public" : "Hidden"}
                </span>
                <span
                  role="button"
                  aria-label={`Remove ${item.name}`}
                  className="ml-auto rounded-md p-1.5 hover:bg-secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove.mutate(item.id);
                  }}
                >
                  <Trash2 className="size-4 text-destructive" />
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
