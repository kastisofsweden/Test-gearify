import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type PriceRule = {
  id: string;
  equipment_id: string | null;
  name: string;
  kind: string;
  from_day: number | null;
  to_day: number | null;
  day_price: number | null;
  weekdays: number[];
  starts_on: string | null;
  ends_on: string | null;
  adjust_type: string | null;
  adjust_value: number;
  priority: number;
  is_active: boolean;
};

type RuleDraft = Partial<PriceRule> & { kind: string };

const WEEKDAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

const selectClass = "h-9 rounded-md border border-input bg-background px-3 text-sm";

export function PricingTab() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<RuleDraft | null>(null);

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["price-rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("price_rules")
        .select("*")
        .order("kind")
        .order("priority", { ascending: false });
      if (error) throw error;
      return data as PriceRule[];
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["equipment", "pricing"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipment")
        .select("id, name")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: taxRates = [] } = useQuery({
    queryKey: ["tax-rates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tax_rates")
        .select("*")
        .order("percent", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const saveRule = useMutation({
    mutationFn: async (rule: RuleDraft) => {
      const payload = {
        equipment_id: rule.equipment_id || null,
        name: rule.name?.trim() || (rule.kind === "tier" ? "Day tier" : "Calendar rule"),
        kind: rule.kind,
        from_day: rule.kind === "tier" ? Number(rule.from_day ?? 1) : null,
        to_day: rule.kind === "tier" ? (rule.to_day ? Number(rule.to_day) : null) : null,
        day_price: rule.kind === "tier" ? Number(rule.day_price ?? 0) : null,
        weekdays: rule.kind === "calendar" ? (rule.weekdays ?? []) : [],
        starts_on: rule.kind === "calendar" ? rule.starts_on || null : null,
        ends_on: rule.kind === "calendar" ? rule.ends_on || null : null,
        adjust_type: rule.kind === "calendar" ? (rule.adjust_type ?? "percent") : null,
        adjust_value: rule.kind === "calendar" ? Number(rule.adjust_value ?? 0) : 0,
        priority: Number(rule.priority ?? 0),
        is_active: rule.is_active ?? true,
      };
      const { error } = rule.id
        ? await supabase.from("price_rules").update(payload).eq("id", rule.id)
        : await supabase.from("price_rules").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["price-rules"] });
      setDraft(null);
      toast.success("Price rule saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleRule = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("price_rules").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["price-rules"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const removeRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("price_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["price-rules"] });
      toast.success("Price rule removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveTax = useMutation({
    mutationFn: async (rate: { id?: string; name: string; percent: number }) => {
      const { error } = rate.id
        ? await supabase
            .from("tax_rates")
            .update({ name: rate.name, percent: rate.percent })
            .eq("id", rate.id)
        : await supabase.from("tax_rates").insert({ name: rate.name, percent: rate.percent });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tax-rates"] });
      toast.success("Tax rate saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const itemName = (id: string | null) =>
    id ? (items.find((i) => i.id === id)?.name ?? "Unknown item") : "All items";

  const describe = (rule: PriceRule) => {
    if (rule.kind === "tier") {
      const range = rule.to_day
        ? `Day ${rule.from_day ?? 1}–${rule.to_day}`
        : `Day ${rule.from_day ?? 1} and onwards`;
      return `${range}: ${Number(rule.day_price ?? 0)} SEK / day`;
    }
    const days = rule.weekdays.length
      ? rule.weekdays.map((d) => WEEKDAYS.find((w) => w.value === d)?.label ?? String(d)).join(", ")
      : "All weekdays";
    const window =
      rule.starts_on || rule.ends_on ? ` · ${rule.starts_on ?? "…"} → ${rule.ends_on ?? "…"}` : "";
    const adj =
      rule.adjust_type === "amount"
        ? `${rule.adjust_value >= 0 ? "+" : ""}${rule.adjust_value} SEK / day`
        : `${rule.adjust_value >= 0 ? "+" : ""}${rule.adjust_value}%`;
    return `${days}${window}: ${adj}`;
  };

  return (
    <div className="grid gap-6">
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl tracking-wide">Price rules</h2>
            <p className="text-sm text-muted-foreground">
              Day tiers set the price per rental day. Calendar rules add weekend, holiday or season
              adjustments on top. Rules for a specific item beat rules for all items.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setDraft({ kind: "tier", from_day: 1 })}>
              <Plus className="size-4" /> Day tier
            </Button>
            <Button
              onClick={() => setDraft({ kind: "calendar", adjust_type: "percent", weekdays: [] })}
            >
              <Plus className="size-4" /> Calendar rule
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-2">
          {isLoading && <p className="text-sm text-muted-foreground">Loading rules…</p>}
          {!isLoading && rules.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No price rules yet. Every item uses its own daily price.
            </p>
          )}
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3"
            >
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs uppercase tracking-wide text-secondary-foreground">
                {rule.kind === "tier" ? "Tier" : "Calendar"}
              </span>
              <div className="min-w-56 flex-1">
                <p className="text-sm font-medium">{rule.name}</p>
                <p className="text-xs text-muted-foreground">
                  {itemName(rule.equipment_id)} · {describe(rule)} · priority {rule.priority}
                </p>
              </div>
              <Switch
                checked={rule.is_active}
                onCheckedChange={(checked) =>
                  toggleRule.mutate({ id: rule.id, is_active: checked })
                }
              />
              <span className="text-xs text-muted-foreground">
                {rule.is_active ? "Active" : "Off"}
              </span>
              <Button variant="outline" size="sm" onClick={() => setDraft(rule)}>
                Edit
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${rule.name}`}
                onClick={() => removeRule.mutate(rule.id)}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display text-xl tracking-wide">Tax rates</h2>
        <p className="text-sm text-muted-foreground">
          Pick a tax rate per item in the price list. Items without a rate use the default.
        </p>
        <div className="mt-4 grid gap-2">
          {taxRates.map((rate) => (
            <form
              key={rate.id}
              className="flex flex-wrap items-center gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                saveTax.mutate({
                  id: rate.id,
                  name: String(form.get("name") ?? ""),
                  percent: Number(form.get("percent") ?? 0),
                });
              }}
            >
              <Input name="name" defaultValue={rate.name} className="max-w-56" />
              <Input
                name="percent"
                type="number"
                step="0.1"
                defaultValue={String(rate.percent)}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">%</span>
              {rate.is_default && (
                <span className="text-xs uppercase tracking-wide text-primary">Default</span>
              )}
              <Button type="submit" variant="outline" size="sm">
                Save
              </Button>
            </form>
          ))}
          <form
            className="flex flex-wrap items-center gap-3 border-t border-border pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              const name = String(form.get("name") ?? "").trim();
              if (!name) {
                toast.error("Name is required");
                return;
              }
              saveTax.mutate({ name, percent: Number(form.get("percent") ?? 0) });
              e.currentTarget.reset();
            }}
          >
            <Input name="name" placeholder="New tax rate" className="max-w-56" />
            <Input name="percent" type="number" step="0.1" placeholder="0" className="w-24" />
            <span className="text-sm text-muted-foreground">%</span>
            <Button type="submit" size="sm">
              <Plus className="size-4" /> Add
            </Button>
          </form>
        </div>
      </section>

      <Dialog open={Boolean(draft)} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {draft?.id
                ? "Edit price rule"
                : draft?.kind === "tier"
                  ? "New day tier"
                  : "New calendar rule"}
            </DialogTitle>
          </DialogHeader>
          {draft && (
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                saveRule.mutate(draft);
              }}
            >
              <div className="grid gap-2">
                <Label htmlFor="pr-name">Name</Label>
                <Input
                  id="pr-name"
                  value={draft.name ?? ""}
                  maxLength={120}
                  placeholder={draft.kind === "tier" ? "Day 3 and onwards" : "Weekend surcharge"}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pr-item">Applies to</Label>
                <select
                  id="pr-item"
                  className={selectClass}
                  value={draft.equipment_id ?? ""}
                  onChange={(e) => setDraft({ ...draft, equipment_id: e.target.value || null })}
                >
                  <option value="">All items</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </div>

              {draft.kind === "tier" ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="grid gap-2">
                    <Label htmlFor="pr-from">From day</Label>
                    <Input
                      id="pr-from"
                      type="number"
                      min={1}
                      value={String(draft.from_day ?? 1)}
                      onChange={(e) => setDraft({ ...draft, from_day: Number(e.target.value) })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="pr-to">To day (blank = onwards)</Label>
                    <Input
                      id="pr-to"
                      type="number"
                      min={1}
                      value={draft.to_day ? String(draft.to_day) : ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          to_day: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="pr-day-price">Price per day (SEK)</Label>
                    <Input
                      id="pr-day-price"
                      type="number"
                      min={0}
                      value={String(draft.day_price ?? 0)}
                      onChange={(e) => setDraft({ ...draft, day_price: Number(e.target.value) })}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid gap-2">
                    <Label>Weekdays (none selected = every day)</Label>
                    <div className="flex flex-wrap gap-2">
                      {WEEKDAYS.map((day) => {
                        const selected = (draft.weekdays ?? []).includes(day.value);
                        return (
                          <button
                            key={day.value}
                            type="button"
                            className={`rounded-lg border px-3 py-1 text-sm ${
                              selected
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border text-muted-foreground"
                            }`}
                            onClick={() =>
                              setDraft({
                                ...draft,
                                weekdays: selected
                                  ? (draft.weekdays ?? []).filter((d) => d !== day.value)
                                  : [...(draft.weekdays ?? []), day.value],
                              })
                            }
                          >
                            {day.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="pr-start">Season from</Label>
                      <Input
                        id="pr-start"
                        type="date"
                        value={draft.starts_on ?? ""}
                        onChange={(e) => setDraft({ ...draft, starts_on: e.target.value || null })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="pr-end">Season to</Label>
                      <Input
                        id="pr-end"
                        type="date"
                        value={draft.ends_on ?? ""}
                        onChange={(e) => setDraft({ ...draft, ends_on: e.target.value || null })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="pr-adj-type">Adjustment</Label>
                      <select
                        id="pr-adj-type"
                        className={selectClass}
                        value={draft.adjust_type ?? "percent"}
                        onChange={(e) => setDraft({ ...draft, adjust_type: e.target.value })}
                      >
                        <option value="percent">Percent of day price</option>
                        <option value="amount">Amount per day (SEK)</option>
                      </select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="pr-adj-value">
                        Value {draft.adjust_type === "amount" ? "(SEK)" : "(%)"}
                      </Label>
                      <Input
                        id="pr-adj-value"
                        type="number"
                        value={String(draft.adjust_value ?? 0)}
                        onChange={(e) =>
                          setDraft({ ...draft, adjust_value: Number(e.target.value) })
                        }
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="pr-priority">Priority (higher wins)</Label>
                  <Input
                    id="pr-priority"
                    type="number"
                    value={String(draft.priority ?? 0)}
                    onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })}
                  />
                </div>
                <div className="flex items-center gap-3 pt-6">
                  <Switch
                    checked={draft.is_active ?? true}
                    onCheckedChange={(checked) => setDraft({ ...draft, is_active: checked })}
                  />
                  <span className="text-sm text-muted-foreground">Active</span>
                </div>
              </div>

              <DialogFooter>
                <Button type="submit" disabled={saveRule.isPending}>
                  Save
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
