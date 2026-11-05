import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_COMPANY_ID,
  DEFAULT_STAFF_ID,
  selectClass,
  useCompanies,
  useStaff,
} from "@/components/admin/backofficeData";
import { calculationTotals } from "@/lib/calculations";
import { fetchPrice } from "@/lib/pricing";
import { lineTotals, resolveCommission } from "@/lib/commission";
import { useOrganizations } from "@/components/admin/OrganizationsTab";
import { formatSek } from "@/lib/rental";
import { quoteTransportForStaff } from "@/lib/transport.functions";
import type { TransportBreakdown } from "@/lib/transportPricing";

type Line = {
  equipment_id: string | null;
  name: string;
  quantity: number;
  days: number;
  unit_price: number;
};

type Calc = {
  id?: string;
  calculation_number?: string;
  title: string;
  customer_name: string;
  customer_email: string;
  customer_id: string | null;
  starts_on: string;
  ends_on: string;
  shipping_method: "pickup" | "delivery";
  delivery_address: string;
  company_id: string;
  responsible_staff_id: string;
  discount_percent: number;
  vat_percent: number;
  notes: string;
  status: string;
  converted_order_id?: string | null;
  transport_amount: number | null;
  transport_status: "pending" | "quoted" | "waived";
  transport_breakdown: TransportBreakdown | null;
  transport_distance_m: number | null;
  transport_duration_s: number | null;
  lines: Line[];
};

const today = () => new Date().toISOString().slice(0, 10);

const emptyCalc = (): Calc => ({
  title: "",
  customer_name: "",
  customer_email: "",
  customer_id: null,
  starts_on: today(),
  ends_on: today(),
  shipping_method: "delivery",
  delivery_address: "",
  company_id: DEFAULT_COMPANY_ID,
  responsible_staff_id: DEFAULT_STAFF_ID,
  discount_percent: 0,
  vat_percent: 25,
  notes: "",
  status: "draft",
  transport_amount: null,
  transport_status: "pending",
  transport_breakdown: null,
  transport_distance_m: null,
  transport_duration_s: null,
  lines: [],
});

const CALCS_KEY = ["calculations"];

const ERROR_TEXT: Record<string, string> = {
  unavailable: "Not enough stock for this period",
  forbidden: "You don't have access to this calculation",
  empty_calculation: "Add at least one line first",
  calculation_not_open: "This calculation is already converted or archived",
};

function friendlyError(message: string) {
  if (message.startsWith("unavailable:")) {
    const [, name, free] = message.split(":");
    return `Not enough stock: ${name} (${free ?? 0} free)`;
  }
  const key = Object.keys(ERROR_TEXT).find((k) => message.includes(k));
  return key ? ERROR_TEXT[key]! : message;
}

export function CalculationsTab({ startNewOrder = false }: { startNewOrder?: boolean } = {}) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Calc | null>(null);
  // "New order" from Orders opens a fresh draft; "Create order" converts it in one click.
  useEffect(() => {
    if (startNewOrder) setDraft(emptyCalc());
  }, [startNewOrder]);
  const { data: customers = [] } = useQuery({
    queryKey: ["calc-customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, email")
        .order("name")
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: companies = [] } = useCompanies();
  const { data: staff = [] } = useStaff();
  const quoteFn = useServerFn(quoteTransportForStaff);
  const [quoting, setQuoting] = useState(false);
  const [pick, setPick] = useState("");

  const { data: calcs = [] } = useQuery({
    queryKey: CALCS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calculations")
        .select("*, calculation_lines(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: equipment = [] } = useQuery({
    queryKey: ["calc-equipment"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipment")
        .select(
          "id, name, daily_price, is_active, organization_id, commission_type, commission_value",
        )
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: orgs = [] } = useOrganizations();
  /** Live preview only; the database snapshots the authoritative commission when lines are saved. */
  const commissionOf = (l: Line) => {
    if (!l.equipment_id) return 0;
    const item = equipment.find((e) => e.id === l.equipment_id);
    if (!item) return 0;
    const org = orgs.find((o) => o.id === item.organization_id);
    const parent = org?.parent_id ? orgs.find((o) => o.id === org.parent_id) : null;
    return lineTotals({
      quantity: l.quantity,
      days: l.days,
      unitPrice: l.unit_price,
      commission: resolveCommission({ equipmentOverride: item, org, parentOrg: parent }),
    }).commission;
  };

  const open = (row: (typeof calcs)[number]) => {
    const lines = [...(row.calculation_lines ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    setDraft({
      id: row.id,
      calculation_number: row.calculation_number,
      title: row.title ?? "",
      customer_name: row.customer_name ?? "",
      customer_email: row.customer_email ?? "",
      customer_id: row.customer_id ?? null,
      starts_on: row.starts_on,
      ends_on: row.ends_on,
      shipping_method: row.shipping_method as Calc["shipping_method"],
      delivery_address: row.delivery_address ?? "",
      company_id: row.company_id,
      responsible_staff_id: row.responsible_staff_id,
      discount_percent: Number(row.discount_percent),
      vat_percent: Number(row.vat_percent),
      notes: row.notes ?? "",
      status: row.status,
      converted_order_id: row.converted_order_id,
      transport_amount: row.transport_amount == null ? null : Number(row.transport_amount),
      transport_status: row.transport_status as Calc["transport_status"],
      transport_breakdown: row.transport_breakdown as unknown as TransportBreakdown | null,
      transport_distance_m: row.transport_distance_m,
      transport_duration_s: row.transport_duration_s,
      lines: lines.map((l) => ({
        equipment_id: l.equipment_id,
        name: l.name,
        quantity: l.quantity,
        days: l.days,
        unit_price: Number(l.unit_price),
      })),
    });
  };

  const persist = async (d: Calc): Promise<string> => {
    const transport: {
      transport_status: string;
      transport_amount: number | null;
      transport_breakdown: never | null;
      transport_distance_m: number | null;
      transport_duration_s: number | null;
    } =
      d.shipping_method === "pickup"
        ? {
            transport_status: "waived",
            transport_amount: 0,
            transport_breakdown: null,
            transport_distance_m: null,
            transport_duration_s: null,
          }
        : {
            transport_status: d.transport_status,
            transport_amount: d.transport_amount,
            transport_breakdown: d.transport_breakdown as never,
            transport_distance_m: d.transport_distance_m,
            transport_duration_s: d.transport_duration_s,
          };
    const payload = {
      title: d.title.trim() || null,
      customer_name: d.customer_name.trim() || null,
      customer_email: d.customer_email.trim() || null,
      customer_id: d.customer_id,
      starts_on: d.starts_on,
      ends_on: d.ends_on,
      shipping_method: d.shipping_method,
      delivery_address: d.delivery_address.trim() || null,
      company_id: d.company_id,
      responsible_staff_id: d.responsible_staff_id,
      discount_percent: Number(d.discount_percent) || 0,
      vat_percent: Number(d.vat_percent) || 0,
      notes: d.notes.trim() || null,
      status: d.status === "converted" ? "converted" : d.status,
      ...transport,
    };
    let id = d.id;
    if (id) {
      const { error } = await supabase.from("calculations").update(payload).eq("id", id);
      if (error) throw error;
      const { error: delErr } = await supabase
        .from("calculation_lines")
        .delete()
        .eq("calculation_id", id);
      if (delErr) throw delErr;
    } else {
      const { data, error } = await supabase
        .from("calculations")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      id = data.id;
    }
    if (d.lines.length) {
      const { error } = await supabase.from("calculation_lines").insert(
        d.lines.map((l, i) => ({
          calculation_id: id!,
          equipment_id: l.equipment_id,
          name: l.name,
          quantity: Math.max(1, Math.round(l.quantity)),
          days: Math.max(1, Math.round(l.days)),
          unit_price: Math.max(0, Number(l.unit_price)),
          sort_order: i,
        })),
      );
      if (error) throw error;
    }
    return id!;
  };

  const save = useMutation({
    mutationFn: persist,
    onSuccess: (id) => {
      toast.success("Calculation saved — no stock reserved");
      setDraft((d) => (d ? { ...d, id } : d));
      qc.invalidateQueries({ queryKey: CALCS_KEY });
    },
    onError: (e: Error) => toast.error(friendlyError(e.message)),
  });

  const convert = useMutation({
    mutationFn: async (d: Calc) => {
      const id = await persist(d);
      const { data, error } = await supabase.rpc("convert_calculation_to_order", {
        _calculation_id: id,
      });
      if (error) throw error;
      return data as { order_number: string };
    },
    onSuccess: (result) => {
      toast.success(`Order ${result.order_number} created and reserved`);
      setDraft(null);
      qc.invalidateQueries({ queryKey: CALCS_KEY });
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
    },
    onError: (e: Error) => {
      toast.error(friendlyError(e.message));
      qc.invalidateQueries({ queryKey: CALCS_KEY });
    },
  });

  const addLine = async () => {
    if (!draft || !pick) return;
    const item = equipment.find((e) => e.id === pick);
    if (!item) return;
    let unitPrice = Number(item.daily_price);
    let days = 1;
    try {
      const price = await fetchPrice(item.id, draft.starts_on, draft.ends_on, 1);
      if (price) {
        // Calculations store the base price; commission is added on top.
        unitPrice =
          price.base_subtotal != null && price.units > 0
            ? Math.round((price.base_subtotal / (price.units * price.quantity)) * 100) / 100
            : price.unit_price;
        days = Math.max(1, price.units);
      }
    } catch {
      // fall back to the list price
    }
    setDraft({
      ...draft,
      lines: [
        ...draft.lines,
        { equipment_id: item.id, name: item.name, quantity: 1, days, unit_price: unitPrice },
      ],
    });
    setPick("");
  };

  const calcTransport = async () => {
    if (!draft) return;
    setQuoting(true);
    try {
      const q = await quoteFn({
        data: {
          address: draft.delivery_address,
          equipment_ids: draft.lines.map((l) => l.equipment_id).filter((x): x is string => !!x),
          staff_id: draft.responsible_staff_id,
        },
      });
      if (q.status === "quoted") {
        setDraft({
          ...draft,
          transport_status: "quoted",
          transport_amount: q.amount,
          transport_breakdown: q.breakdown,
          transport_distance_m: q.distance_m,
          transport_duration_s: q.duration_s,
        });
      } else {
        setDraft({
          ...draft,
          transport_status: "pending",
          transport_amount: null,
          transport_breakdown: null,
          transport_distance_m: null,
          transport_duration_s: null,
        });
        toast.message(
          `Transport pending${q.status === "pending" ? ` (${q.reason})` : ""} — set it manually or retry`,
        );
      }
    } finally {
      setQuoting(false);
    }
  };

  const totals = draft
    ? calculationTotals(
        draft.lines.map((l) => ({ ...l, commission_amount: commissionOf(l) })),
        {
          discountPercent: draft.discount_percent,
          vatPercent: draft.vat_percent,
          transport: draft.shipping_method === "pickup" ? 0 : draft.transport_amount,
        },
      )
    : null;
  const companyStaff = staff.filter((s) => !draft || s.company_id === draft.company_id);
  const locked = draft?.status === "converted";

  return (
    <div className="grid gap-6">
      <div className="flex justify-between">
        <p className="text-sm text-muted-foreground">
          Internal calculations. Saving never touches stock; “Create order” reserves it.
        </p>
        <Button onClick={() => setDraft(emptyCalc())}>
          <Plus className="size-4" /> New calculation
        </Button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="p-3">Number</th>
              <th className="p-3">Title</th>
              <th className="p-3">Customer</th>
              <th className="p-3">Dates</th>
              <th className="p-3">Total ex VAT</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {calcs.length === 0 && (
              <tr>
                <td colSpan={6} className="p-3 text-muted-foreground">
                  No calculations yet.
                </td>
              </tr>
            )}
            {calcs.map((c) => {
              const t = calculationTotals(
                (c.calculation_lines ?? []).map((l) => ({
                  quantity: l.quantity,
                  days: l.days,
                  unit_price: Number(l.unit_price),
                  commission_amount: Number(l.commission_amount ?? 0),
                })),
                {
                  discountPercent: Number(c.discount_percent),
                  vatPercent: Number(c.vat_percent),
                  transport: c.transport_amount == null ? null : Number(c.transport_amount),
                },
              );
              return (
                <tr
                  key={c.id}
                  className="cursor-pointer border-t border-border hover:bg-secondary/50"
                  onClick={() => open(c)}
                >
                  <td className="p-3 font-medium">{c.calculation_number}</td>
                  <td className="p-3">{c.title ?? "—"}</td>
                  <td className="p-3">{c.customer_name ?? "—"}</td>
                  <td className="p-3">
                    {c.starts_on} → {c.ends_on}
                  </td>
                  <td className="p-3">{formatSek(t.net)}</td>
                  <td className="p-3 capitalize">{c.status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {draft && totals && (
        <form
          className="grid gap-5 rounded-2xl border border-border bg-card p-5"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(draft);
          }}
        >
          <h2 className="font-display text-xl">
            {draft.calculation_number ?? "New calculation"}
            {locked ? " · converted" : ""}
          </h2>
          <fieldset disabled={locked} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="calc-title">Title</Label>
              <Input
                id="calc-title"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="calc-cust-pick">Existing customer</Label>
              <select
                id="calc-cust-pick"
                className={selectClass}
                value={draft.customer_id ?? ""}
                onChange={(e) => {
                  const c = customers.find((x) => x.id === e.target.value);
                  setDraft({
                    ...draft,
                    customer_id: c?.id ?? null,
                    customer_name: c?.name ?? draft.customer_name,
                    customer_email: c?.email ?? draft.customer_email,
                  });
                }}
              >
                <option value="">New / none</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.email ? ` (${c.email})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="calc-cust">Customer name (optional)</Label>
              <Input
                id="calc-cust"
                value={draft.customer_name}
                onChange={(e) => setDraft({ ...draft, customer_name: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="calc-email">Customer email (optional)</Label>
              <Input
                id="calc-email"
                type="email"
                value={draft.customer_email}
                onChange={(e) => setDraft({ ...draft, customer_email: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="calc-start">Starts</Label>
              <Input
                id="calc-start"
                type="date"
                value={draft.starts_on}
                onChange={(e) => setDraft({ ...draft, starts_on: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="calc-end">Ends</Label>
              <Input
                id="calc-end"
                type="date"
                min={draft.starts_on}
                value={draft.ends_on}
                onChange={(e) => setDraft({ ...draft, ends_on: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="calc-method">Shipping</Label>
              <select
                id="calc-method"
                className={selectClass}
                value={draft.shipping_method}
                onChange={(e) =>
                  setDraft({ ...draft, shipping_method: e.target.value as Calc["shipping_method"] })
                }
              >
                <option value="delivery">Delivery</option>
                <option value="pickup">Pickup</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="calc-company">Company</Label>
              <select
                id="calc-company"
                className={selectClass}
                value={draft.company_id}
                onChange={(e) => {
                  const company_id = e.target.value;
                  const first = staff.find((s) => s.company_id === company_id && s.is_active);
                  setDraft({
                    ...draft,
                    company_id,
                    responsible_staff_id: first?.id ?? draft.responsible_staff_id,
                  });
                }}
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="calc-staff">Responsible staff</Label>
              <select
                id="calc-staff"
                className={selectClass}
                value={draft.responsible_staff_id}
                onChange={(e) => setDraft({ ...draft, responsible_staff_id: e.target.value })}
              >
                {companyStaff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {formatSek(Number(s.hourly_rate_sek))}/h
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="calc-disc">Discount %</Label>
              <Input
                id="calc-disc"
                type="number"
                min={0}
                max={100}
                value={String(draft.discount_percent)}
                onChange={(e) => setDraft({ ...draft, discount_percent: Number(e.target.value) })}
              />
            </div>
            {draft.shipping_method === "delivery" && (
              <div className="grid gap-2 sm:col-span-2 lg:col-span-3">
                <Label htmlFor="calc-address">Delivery address</Label>
                <div className="flex gap-2">
                  <Input
                    id="calc-address"
                    placeholder="Street, postal code, city"
                    value={draft.delivery_address}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        delivery_address: e.target.value,
                        transport_status: "pending",
                        transport_amount: null,
                        transport_breakdown: null,
                      })
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      quoting || draft.delivery_address.trim().length < 5 || !draft.lines.length
                    }
                    onClick={calcTransport}
                  >
                    {quoting ? "Calculating…" : "Calculate transport"}
                  </Button>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Label htmlFor="calc-transport">Transport (SEK, editable)</Label>
                  <Input
                    id="calc-transport"
                    type="number"
                    min={0}
                    className="w-32"
                    placeholder="pending"
                    value={draft.transport_amount == null ? "" : String(draft.transport_amount)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        transport_amount: e.target.value === "" ? null : Number(e.target.value),
                        transport_status: e.target.value === "" ? "pending" : "quoted",
                      })
                    }
                  />
                </div>
                {draft.transport_breakdown && (
                  <ul className="text-xs text-muted-foreground">
                    {draft.transport_breakdown.warehouses.map((w) => (
                      <li key={w.warehouse_id}>
                        {w.warehouse_name}: {Math.round(w.distance_m / 100) / 10} km one way,{" "}
                        {Math.round(w.duration_s / 60)} min · {w.staff_hours} h ×{" "}
                        {formatSek(draft.transport_breakdown!.hourly_rate_sek)} ={" "}
                        {formatSek(w.staff_cost)} + truck {formatSek(w.truck_cost)} ={" "}
                        {formatSek(w.subtotal)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </fieldset>

          <div className="grid gap-2">
            <h3 className="font-semibold">Lines</h3>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-1">Item</th>
                  <th className="py-1">Qty</th>
                  <th className="py-1">Days/units</th>
                  <th className="py-1">Unit price</th>
                  <th className="py-1 text-right">Base</th>
                  <th className="py-1 text-right">Commission</th>
                  <th className="py-1 text-right">Total</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {draft.lines.map((l, i) => {
                  const set = (patch: Partial<Line>) =>
                    setDraft({
                      ...draft,
                      lines: draft.lines.map((x, j) => (j === i ? { ...x, ...patch } : x)),
                    });
                  return (
                    <tr key={i} className="border-t border-border">
                      <td className="py-1">{l.name}</td>
                      <td className="py-1">
                        <Input
                          type="number"
                          min={1}
                          className="w-20"
                          disabled={locked}
                          aria-label={`Quantity for ${l.name}`}
                          value={String(l.quantity)}
                          onChange={(e) => set({ quantity: Number(e.target.value) })}
                        />
                      </td>
                      <td className="py-1">
                        <Input
                          type="number"
                          min={1}
                          className="w-20"
                          disabled={locked}
                          value={String(l.days)}
                          onChange={(e) => set({ days: Number(e.target.value) })}
                        />
                      </td>
                      <td className="py-1">
                        <Input
                          type="number"
                          min={0}
                          className="w-28"
                          disabled={locked}
                          value={String(l.unit_price)}
                          onChange={(e) => set({ unit_price: Number(e.target.value) })}
                        />
                      </td>
                      <td className="py-1 text-right">
                        {formatSek(l.quantity * l.days * l.unit_price)}
                      </td>
                      <td className="py-1 text-right text-muted-foreground">
                        {formatSek(commissionOf(l))}
                      </td>
                      <td className="py-1 text-right">
                        {formatSek(l.quantity * l.days * l.unit_price + commissionOf(l))}
                      </td>
                      <td className="py-1 text-right">
                        {!locked && (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            aria-label={`Remove ${l.name}`}
                            onClick={() =>
                              setDraft({ ...draft, lines: draft.lines.filter((_, j) => j !== i) })
                            }
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!locked && (
              <div className="flex gap-2">
                <select
                  aria-label="Add item"
                  className={selectClass}
                  value={pick}
                  onChange={(e) => setPick(e.target.value)}
                >
                  <option value="">Add item…</option>
                  {equipment.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
                <Button type="button" variant="outline" disabled={!pick} onClick={addLine}>
                  Add
                </Button>
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="calc-notes">Internal notes</Label>
            <Textarea
              id="calc-notes"
              rows={2}
              disabled={locked}
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          </div>

          <dl className="ml-auto grid w-full max-w-sm gap-1 text-sm">
            <div className="flex justify-between">
              <dt>Base rental</dt>
              <dd>{formatSek(totals.base)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Commission</dt>
              <dd>{formatSek(totals.commission)}</dd>
            </div>
            {totals.discount > 0 && (
              <div className="flex justify-between">
                <dt>Discount</dt>
                <dd>−{formatSek(totals.discount)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt>Transport</dt>
              <dd>
                {draft.shipping_method === "pickup"
                  ? formatSek(0)
                  : draft.transport_amount == null
                    ? "pending"
                    : formatSek(totals.transport)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>VAT {draft.vat_percent}%</dt>
              <dd>{formatSek(totals.vat)}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-1 font-bold">
              <dt>Total</dt>
              <dd>{formatSek(totals.total)}</dd>
            </div>
          </dl>

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
              Close
            </Button>
            {!locked && (
              <>
                <Button type="submit" variant="outline" disabled={save.isPending}>
                  Save
                </Button>
                <Button
                  type="button"
                  disabled={convert.isPending || !draft.lines.length}
                  onClick={() => convert.mutate(draft)}
                >
                  {convert.isPending ? "Creating…" : "Create order"}
                </Button>
              </>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
