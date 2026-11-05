import { OrderTransportPanel } from "@/components/admin/OrderTransportPanel";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { escapeHtml } from "@/lib/escapeHtml";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  CircleDot,
  Download,
  FileText,
  Package,
  Plus,
  Printer,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  NEXT_STATUSES,
  changeOrderStatus,
  STATUS_LABEL,
  lineTotals,
  money,
  type OrderStatus,
} from "@/lib/booking";
import { formatDate } from "@/lib/rental";

type OrderRow = {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  deposit_amount: number | null;
  starts_on: string;
  ends_on: string;
  shipping_method: string;
  shipping_cost: number;
  discount_percent: number;
  vat_percent: number;
  internal_notes: string | null;
  customer_note: string | null;
  delivery_address: string | null;
  delivery_postal_code: string | null;
  delivery_city: string | null;
  created_at: string;
  customers: { id: string; name: string; email: string | null; phone: string | null } | null;
};

type LineRow = {
  id: string;
  equipment_id: string | null;
  description: string;
  quantity: number;
  days: number;
  unit_price: number;
  equipment: { id: string; name: string; tracking: string } | null;
};

const LIST_STATUSES: OrderStatus[] = [
  "pending",
  "draft",
  "reserved",
  "picked_up",
  "returned",
  "completed",
  "cancelled",
];

const PAYMENT_STATUSES = ["unpaid", "partially_paid", "paid", "refunded"] as const;

const PAYMENT_LABEL: Record<string, string> = {
  unpaid: "Payment due",
  partially_paid: "Partially paid",
  paid: "Paid",
  refunded: "Refunded",
};

const STATUS_TONE: Record<string, string> = {
  pending: "bg-warning/20 text-warning",
  draft: "bg-muted text-muted-foreground",
  reserved: "bg-primary/12 text-primary",
  picked_up: "bg-warning/20 text-warning",
  returned: "bg-success/15 text-success",
  completed: "bg-success/15 text-success",
  cancelled: "bg-destructive/12 text-destructive",
};

const PAYMENT_TONE: Record<string, string> = {
  unpaid: "bg-muted text-muted-foreground",
  partially_paid: "bg-warning/20 text-warning",
  paid: "bg-success/15 text-success",
  refunded: "bg-destructive/12 text-destructive",
};

type TabKey = "all" | "upcoming" | "late" | "shortage";

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "upcoming", label: "Upcoming" },
  { key: "late", label: "Late" },
  { key: "shortage", label: "With shortage" },
];

const today = () => new Date().toISOString().slice(0, 10);

const orderSubtotal = (lines: LineRow[]) =>
  lines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.days) * Number(l.unit_price), 0);

const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";

function Initials({ name }: { name: string }) {
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-[11px] font-semibold text-secondary-foreground">
      {initials(name)}
    </span>
  );
}

function FilterCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-3 grid gap-2">{children}</div>
    </section>
  );
}

export function OrdersTab() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>("all");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [payments, setPayments] = useState<string[]>([]);
  const [range, setRange] = useState({ from: "", to: "" });
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: orders = [] } = useQuery({
    queryKey: ["admin-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_number, status, payment_status, deposit_amount, starts_on, ends_on, shipping_method, shipping_cost, discount_percent, vat_percent, internal_notes, customer_note, delivery_address, delivery_postal_code, delivery_city, created_at, customers(id, name, email, phone)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OrderRow[];
    },
  });

  const { data: allLines = [] } = useQuery({
    queryKey: ["admin-order-line-totals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_lines")
        .select("order_id, equipment_id, quantity, days, unit_price");
      if (error) throw error;
      return (data ?? []) as {
        order_id: string;
        equipment_id: string | null;
        quantity: number;
        days: number;
        unit_price: number;
      }[];
    },
  });

  const priceOf = (order: OrderRow) => {
    const subtotal = allLines
      .filter((l) => l.order_id === order.id)
      .reduce((sum, l) => sum + Number(l.quantity) * Number(l.days) * Number(l.unit_price), 0);
    return lineTotals(subtotal, {
      shipping: Number(order.shipping_cost),
      discountPercent: Number(order.discount_percent),
      vatPercent: Number(order.vat_percent),
    }).total;
  };

  const { data: shortageIds = [] } = useQuery({
    queryKey: ["admin-order-shortage", orders.length, allLines.length],
    enabled: tab === "shortage" && orders.length > 0,
    queryFn: async () => {
      const ids: string[] = [];
      for (const order of orders.filter(
        (o) => o.status === "reserved" || o.status === "picked_up",
      )) {
        for (const line of allLines.filter((l) => l.order_id === order.id && l.equipment_id)) {
          const { data } = await supabase.rpc("available_quantity", {
            _equipment_id: line.equipment_id!,
            _start: order.starts_on,
            _end: order.ends_on,
            _exclude_order: order.id,
          });
          if (Number(data ?? 0) < Number(line.quantity)) {
            ids.push(order.id);
            break;
          }
        }
      }
      return ids;
    },
  });

  const isLate = (o: OrderRow) => o.status === "picked_up" && o.ends_on < today();

  const visible = orders.filter((o) => {
    if (tab === "upcoming" && !(o.status === "reserved" && o.starts_on >= today())) return false;
    if (tab === "late" && !isLate(o)) return false;
    if (tab === "shortage" && !shortageIds.includes(o.id)) return false;
    if (statuses.length && !statuses.includes(o.status)) return false;
    if (payments.length && !payments.includes(o.payment_status)) return false;
    if (range.from && o.ends_on < range.from) return false;
    if (range.to && o.starts_on > range.to) return false;
    if (!search.trim()) return true;
    const needle = search.toLowerCase();
    return (
      o.order_number.toLowerCase().includes(needle) ||
      (o.customers?.name ?? "").toLowerCase().includes(needle) ||
      (o.customers?.email ?? "").toLowerCase().includes(needle)
    );
  });

  const countByStatus = (status: string) => orders.filter((o) => o.status === status).length;
  const countByPayment = (status: string) =>
    orders.filter((o) => o.payment_status === status).length;

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: OrderStatus }) => {
      const from = orders.find((o) => o.id === id)?.status ?? "";
      await changeOrderStatus(id, from, status);
    },
    onSuccess: () => {
      toast.success("Status updated");
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      queryClient.invalidateQueries({ queryKey: ["admin-ops"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setPayment = useMutation({
    mutationFn: async ({ id, payment_status }: { id: string; payment_status: string }) => {
      const { error } = await supabase.from("orders").update({ payment_status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payment status updated");
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const bulkStatus = useMutation({
    mutationFn: async (status: OrderStatus) => {
      for (const id of selected) {
        const from = orders.find((o) => o.id === id)?.status ?? "";
        await changeOrderStatus(id, from, status);
      }
    },
    onSuccess: () => {
      toast.success("Orders updated");
      setSelected([]);
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
      queryClient.invalidateQueries({ queryKey: ["admin-ops"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const exportCsv = () => {
    const rows = [
      ["Order", "Customer", "Status", "Pick up", "Return", "Price", "Payment"],
      ...visible.map((o) => [
        o.order_number,
        o.customers?.name ?? "",
        STATUS_LABEL[o.status as OrderStatus]?.en ?? o.status,
        o.starts_on,
        o.ends_on,
        String(Math.round(priceOf(o))),
        PAYMENT_LABEL[o.payment_status] ?? o.payment_status,
      ]),
    ];
    const csv = rows.map((r) => r.map((cell) => `"${cell}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "orders.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid gap-6">
      <div className="flex justify-end">
        <Button
          onClick={() => navigate({ to: "/admin", search: { tab: "calculations", new: "order" } })}
        >
          + New order
        </Button>
      </div>
      <div className="grid gap-6 xl:grid-cols-[248px_minmax(0,1fr)]">
        <div className="grid h-fit gap-4">
          <FilterCard title="Status">
            {LIST_STATUSES.map((status) => (
              <label key={status} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={statuses.includes(status)}
                  onChange={() => setStatuses(toggle(statuses, status))}
                />
                <span className="flex-1 font-medium">{STATUS_LABEL[status].en}</span>
                <span className="text-xs text-muted-foreground">({countByStatus(status)})</span>
              </label>
            ))}
          </FilterCard>

          <FilterCard title="Payment status">
            {PAYMENT_STATUSES.map((status) => (
              <label key={status} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={payments.includes(status)}
                  onChange={() => setPayments(toggle(payments, status))}
                />
                <span className="flex-1 font-medium">{PAYMENT_LABEL[status]}</span>
                <span className="text-xs text-muted-foreground">({countByPayment(status)})</span>
              </label>
            ))}
          </FilterCard>

          <FilterCard title="Date range">
            <Input
              type="date"
              value={range.from}
              onChange={(e) => setRange({ ...range, from: e.target.value })}
              aria-label="From date"
            />
            <Input
              type="date"
              value={range.to}
              onChange={(e) => setRange({ ...range, to: e.target.value })}
              aria-label="To date"
            />
            <p className="text-xs text-muted-foreground">
              {range.from || range.to
                ? `Showing: ${range.from || "…"} → ${range.to || "…"}`
                : "Showing: all time"}
            </p>
            {(range.from || range.to || statuses.length || payments.length) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setRange({ from: "", to: "" });
                  setStatuses([]);
                  setPayments([]);
                }}
              >
                Clear filters
              </Button>
            )}
          </FilterCard>

          <FilterCard title="Source">
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="size-4" /> Export
            </Button>
          </FilterCard>
        </div>

        <div className="grid min-w-0 gap-4">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:justify-between">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search order number or customer"
              className="sm:w-72"
            />
            <p className="text-sm text-muted-foreground">
              Showing {visible.length} of {orders.length}
            </p>
          </div>

          <div className="flex gap-1 overflow-x-auto border-b border-border">
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors ${
                  tab === key
                    ? "border-primary font-medium text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value=""
              disabled={selected.length === 0}
              onChange={(e) => {
                if (e.target.value) bulkStatus.mutate(e.target.value as OrderStatus);
                e.currentTarget.value = "";
              }}
            >
              <option value="">Actions</option>
              <option value="reserved">Confirm / mark as reserved</option>
              <option value="picked_up">Mark as picked up</option>
              <option value="returned">Mark as returned</option>
              <option value="completed">Mark as completed</option>
              <option value="cancelled">Cancel orders</option>
            </select>
            <span className="text-sm text-muted-foreground">{selected.length} orders selected</span>
            {selected.length !== visible.length && visible.length > 0 && (
              <button
                className="text-sm font-medium text-primary"
                onClick={() => setSelected(visible.map((o) => o.id))}
              >
                Select all {visible.length} orders
              </button>
            )}
            {selected.length > 0 && (
              <button className="text-sm text-muted-foreground" onClick={() => setSelected([])}>
                Clear selection
              </button>
            )}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      aria-label="Select all"
                      checked={visible.length > 0 && selected.length === visible.length}
                      onChange={(e) =>
                        setSelected(e.target.checked ? visible.map((o) => o.id) : [])
                      }
                    />
                  </th>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Pick up</th>
                  <th className="px-4 py-3">Return</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  <th className="px-4 py-3">Payment status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {visible.map((order) => (
                  <tr
                    key={order.id}
                    className={`border-b border-border/60 last:border-0 ${
                      openId === order.id ? "bg-secondary/50" : "hover:bg-muted/40"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        aria-label={`Select ${order.order_number}`}
                        checked={selected.includes(order.id)}
                        onChange={() => setSelected(toggle(selected, order.id))}
                      />
                    </td>
                    <td className="px-4 py-3 font-medium">{order.order_number}</td>
                    <td className="px-4 py-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <Initials name={order.customers?.name ?? "?"} />
                        <span className="truncate font-medium">{order.customers?.name ?? "—"}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                          STATUS_TONE[order.status] ?? "bg-secondary"
                        }`}
                      >
                        {STATUS_LABEL[order.status as OrderStatus]?.en ?? order.status}
                      </span>
                      {isLate(order) && (
                        <span className="ml-2 text-xs font-semibold text-destructive">Late</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatDate(order.starts_on)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{formatDate(order.ends_on)}</td>
                    <td className="px-4 py-3 text-right font-semibold">{money(priceOf(order))}</td>
                    <td className="px-4 py-3">
                      <select
                        className={`h-8 rounded-full border-0 px-3 text-xs font-medium ${
                          PAYMENT_TONE[order.payment_status] ?? "bg-secondary"
                        }`}
                        value={order.payment_status}
                        onChange={(e) =>
                          setPayment.mutate({ id: order.id, payment_status: e.target.value })
                        }
                      >
                        {PAYMENT_STATUSES.map((status) => (
                          <option key={status} value={status}>
                            {PAYMENT_LABEL[status]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setOpenId(openId === order.id ? null : order.id)}
                      >
                        {openId === order.id ? "Close" : "Open"}
                      </Button>
                    </td>
                  </tr>
                ))}
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                      No orders here.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {openId ? (
        <OrderDetail
          order={orders.find((o) => o.id === openId)!}
          onStatus={(status) => setStatus.mutate({ id: openId, status })}
        />
      ) : null}
    </div>
  );
}

function OrderDetail({
  order,
  onStatus,
}: {
  order: OrderRow;
  onStatus: (status: OrderStatus) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    starts_on: order.starts_on,
    ends_on: order.ends_on,
    shipping_method: order.shipping_method,
    discount_percent: String(order.discount_percent),
    shipping_cost: String(order.shipping_cost),
    internal_notes: order.internal_notes ?? "",
  });

  const { data: lines = [] } = useQuery({
    queryKey: ["admin-order-lines", order.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_lines")
        .select(
          "id, equipment_id, description, quantity, days, unit_price, equipment(id, name, tracking)",
        )
        .eq("order_id", order.id)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as LineRow[];
    },
  });

  const { data: equipment = [] } = useQuery({
    queryKey: ["admin-equipment-basic"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipment")
        .select("id, name, daily_price, tracking")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; daily_price: number; tracking: string }[];
    },
  });

  const { data: events = [] } = useQuery({
    queryKey: ["admin-order-events", order.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_events")
        .select("id, from_status, to_status, created_at")
        .eq("order_id", order.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: availability = {} } = useQuery({
    queryKey: ["admin-order-availability", order.id, order.starts_on, order.ends_on, lines.length],
    enabled: lines.length > 0,
    queryFn: async () => {
      const map: Record<string, number> = {};
      for (const line of lines) {
        if (!line.equipment_id) continue;
        const { data } = await supabase.rpc("available_quantity", {
          _equipment_id: line.equipment_id,
          _start: order.starts_on,
          _end: order.ends_on,
          _exclude_order: order.id,
        });
        map[line.equipment_id] = Number(data ?? 0);
      }
      return map;
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
    queryClient.invalidateQueries({ queryKey: ["admin-order-lines", order.id] });
    queryClient.invalidateQueries({ queryKey: ["admin-order-events", order.id] });
    queryClient.invalidateQueries({ queryKey: ["admin-ops"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const days =
        Math.round(
          (new Date(form.ends_on).getTime() - new Date(form.starts_on).getTime()) / 86_400_000,
        ) + 1;
      const { error } = await supabase
        .from("orders")
        .update({
          starts_on: form.starts_on,
          ends_on: form.ends_on,
          shipping_method: form.shipping_method,
          discount_percent: Number(form.discount_percent) || 0,
          shipping_cost: Number(form.shipping_cost) || 0,
          internal_notes: form.internal_notes || null,
        })
        .eq("id", order.id);
      if (error) throw error;
      const { error: linesError } = await supabase
        .from("order_lines")
        .update({ starts_on: form.starts_on, ends_on: form.ends_on, days: Math.max(days, 1) })
        .eq("order_id", order.id);
      if (linesError) throw linesError;
    },
    onSuccess: () => {
      toast.success("Order saved");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const addLine = useMutation({
    mutationFn: async (equipmentId: string) => {
      const item = equipment.find((e) => e.id === equipmentId);
      if (!item) return;
      const days =
        Math.round(
          (new Date(order.ends_on).getTime() - new Date(order.starts_on).getTime()) / 86_400_000,
        ) + 1;
      const { data: available, error: availError } = await supabase.rpc("available_quantity", {
        _equipment_id: equipmentId,
        _start: order.starts_on,
        _end: order.ends_on,
        _exclude_order: order.id,
      });
      if (availError) throw availError;
      if (Number(available ?? 0) < 1)
        throw new Error(`${item.name} is not available for this period`);
      const { error } = await supabase.from("order_lines").insert({
        order_id: order.id,
        equipment_id: equipmentId,
        description: item.name,
        quantity: 1,
        days: Math.max(days, 1),
        unit_price: item.daily_price,
        starts_on: order.starts_on,
        ends_on: order.ends_on,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (error: Error) => toast.error(error.message),
  });

  const updateLine = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: { quantity?: number; days?: number; unit_price?: number };
    }) => {
      const { error } = await supabase.from("order_lines").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (error: Error) => toast.error(error.message),
  });

  const removeLine = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("order_lines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (error: Error) => toast.error(error.message),
  });

  const totals = lineTotals(orderSubtotal(lines), {
    shipping: Number(order.shipping_cost),
    discountPercent: Number(order.discount_percent),
    vatPercent: Number(order.vat_percent),
  });

  const printPicklist = () => {
    const rows = lines
      .map(
        (l) =>
          `<tr><td>${escapeHtml(l.quantity)} pcs</td><td>${escapeHtml(l.description)}</td></tr>`,
      )
      .join("");
    const win = window.open("", "_blank", "width=800,height=900");
    if (!win) return;
    win.document.write(
      `<html><head><title>Pick list ${escapeHtml(order.order_number)}</title></head><body style="font-family:Arial">
        <h1>Pick list ${escapeHtml(order.order_number)}</h1>
        <p>${escapeHtml(order.customers?.name)} · ${escapeHtml(order.starts_on)} – ${escapeHtml(order.ends_on)}</p>
        <p>${order.shipping_method === "delivery" ? `Delivery: ${escapeHtml(order.delivery_address)}, ${escapeHtml(order.delivery_postal_code)} ${escapeHtml(order.delivery_city)}` : "Warehouse pickup"}</p>
        <table border="1" cellpadding="6" cellspacing="0">${rows}</table>
      </body></html>`,
    );
    win.document.close();
    win.print();
  };

  const statusTone = STATUS_TONE[order.status] ?? "bg-muted text-muted-foreground";
  const nextStatuses = NEXT_STATUSES[order.status as OrderStatus] ?? [];
  const deposit = Number(order.deposit_amount ?? 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="grid gap-6">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4">
          <span className="text-sm text-muted-foreground">Orders</span>
          <ChevronRight className="size-4 text-muted-foreground" />
          <h2 className="text-2xl font-bold">{order.order_number}</h2>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone}`}>
            {STATUS_LABEL[order.status as OrderStatus]?.en ?? order.status}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            {nextStatuses.map((next, index) => (
              <Button
                key={next}
                size="sm"
                variant={index === 0 ? "default" : "outline"}
                onClick={() => onStatus(next)}
              >
                {order.status === "pending"
                  ? next === "reserved"
                    ? "Confirm"
                    : "Decline"
                  : STATUS_LABEL[next].en}
              </Button>
            ))}
          </div>
        </div>

        {order.status === "pending" ? (
          <div
            role="status"
            className="rounded-2xl border border-warning/40 bg-warning/10 px-5 py-3 text-sm"
          >
            Website request awaiting confirmation. Stock is not reserved until you press Confirm,
            which re-checks availability; Decline cancels the request.
          </div>
        ) : null}

        <div className="grid gap-6 md:grid-cols-2">
          {/* Customer */}
          <div className="rounded-2xl border border-border bg-card">
            <div className="border-b border-border px-5 py-4">
              <h3 className="text-lg font-semibold">Customer</h3>
            </div>
            <div className="flex items-center gap-4 px-5 py-5">
              <span className="grid size-12 place-items-center rounded-full bg-success/15 text-sm font-bold text-success">
                {initials(order.customers?.name ?? "?")}
              </span>
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold">
                  {order.customers?.name ?? "No customer"}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {order.customers?.email ?? order.customers?.phone ?? "—"}
                </p>
              </div>
            </div>
            <div className="grid divide-y divide-border border-t border-border text-sm">
              <div className="flex justify-between px-5 py-3">
                <span className="text-muted-foreground">Phone</span>
                <span>{order.customers?.phone ?? "—"}</span>
              </div>
              <div className="flex justify-between px-5 py-3">
                <span className="text-muted-foreground">Created</span>
                <span>{formatDate(order.created_at)}</span>
              </div>
              <div className="flex justify-between gap-6 px-5 py-3">
                <span className="text-muted-foreground">Customer note</span>
                <span className="text-right">{order.customer_note ?? "—"}</span>
              </div>
            </div>
          </div>

          {/* Pickup / delivery + dates */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="inline-flex rounded-full bg-secondary p-1">
              {(["pickup", "delivery"] as const).map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setForm({ ...form, shipping_method: method })}
                  className={`rounded-full px-5 py-1.5 text-sm font-semibold capitalize transition ${
                    form.shipping_method === method
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground"
                  }`}
                >
                  {method}
                </button>
              ))}
            </div>

            {form.shipping_method === "delivery" ? (
              <div className="mt-4 rounded-xl border border-border p-4 text-sm">
                <p className="font-semibold">Delivery address</p>
                <p className="mt-1 text-muted-foreground">
                  {[order.delivery_address, order.delivery_postal_code, order.delivery_city]
                    .filter(Boolean)
                    .join(", ") || "No address added"}
                </p>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-border p-4 text-sm text-muted-foreground">
                Warehouse pickup
              </div>
            )}
            <OrderTransportPanel orderId={order.id} />

            <div className="mt-4 grid gap-4 rounded-xl border border-border p-4">
              <div className="grid gap-1">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Pick up
                </Label>
                <Input
                  type="date"
                  className="border-0 border-b border-border px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
                  value={form.starts_on}
                  onChange={(e) => setForm({ ...form, starts_on: e.target.value })}
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Return
                </Label>
                <Input
                  type="date"
                  className="border-0 border-b border-border px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
                  value={form.ends_on}
                  onChange={(e) => setForm({ ...form, ends_on: e.target.value })}
                />
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Discount %</Label>
                <Input
                  type="number"
                  value={form.discount_percent}
                  onChange={(e) => setForm({ ...form, discount_percent: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Shipping (SEK)</Label>
                <Input
                  type="number"
                  value={form.shipping_cost}
                  onChange={(e) => setForm({ ...form, shipping_cost: e.target.value })}
                />
              </div>
            </div>

            <div className="mt-4 grid gap-2">
              <Label>Internal notes</Label>
              <Textarea
                rows={2}
                value={form.internal_notes}
                onChange={(e) => setForm({ ...form, internal_notes: e.target.value })}
              />
            </div>

            <Button className="mt-4" onClick={() => save.mutate()} disabled={save.isPending}>
              Save order
            </Button>
          </div>
        </div>

        {/* Products */}
        <div className="rounded-2xl border border-border bg-card">
          <div className="border-b border-border p-4">
            <div className="flex items-center gap-2 rounded-xl border border-border px-3">
              <Search className="size-4 text-muted-foreground" />
              <select
                className="h-11 flex-1 bg-transparent text-sm outline-none"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) {
                    addLine.mutate(e.target.value);
                    e.target.value = "";
                  }
                }}
              >
                <option value="">Search to add products…</option>
                {equipment.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
              <Plus className="size-4 text-muted-foreground" />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 text-left font-semibold">Product</th>
                  <th className="px-4 py-3 text-left font-semibold">Available</th>
                  <th className="px-4 py-3 text-left font-semibold">Quantity</th>
                  <th className="px-4 py-3 text-left font-semibold">Days</th>
                  <th className="px-4 py-3 text-left font-semibold">Charge</th>
                  <th className="px-4 py-3 text-right font-semibold">Total</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const available = availability[line.equipment_id ?? ""];
                  const enough = available === undefined || available >= line.quantity;
                  return (
                    <tr key={line.id} className="border-t border-border align-top">
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-3">
                          <span className="grid size-9 place-items-center rounded-lg bg-secondary">
                            <Package className="size-4 text-muted-foreground" />
                          </span>
                          <div>
                            <p className="font-semibold">{line.description}</p>
                            {line.equipment?.tracking === "serialized" ? (
                              <UnitPicker line={line} orderId={order.id} onChange={invalidate} />
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${
                            enough
                              ? "bg-success/15 text-success"
                              : "bg-destructive/12 text-destructive"
                          }`}
                        >
                          <CircleDot className="size-3" />
                          {available === undefined ? "—" : `${available} left`}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          type="number"
                          min={1}
                          className="w-20"
                          defaultValue={line.quantity}
                          onBlur={(e) =>
                            updateLine.mutate({
                              id: line.id,
                              patch: { quantity: Number(e.target.value) || 1 },
                            })
                          }
                          aria-label="Quantity"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          type="number"
                          min={1}
                          className="w-20"
                          defaultValue={line.days}
                          onBlur={(e) =>
                            updateLine.mutate({
                              id: line.id,
                              patch: { days: Number(e.target.value) || 1 },
                            })
                          }
                          aria-label="Days"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Input
                          type="number"
                          className="w-28"
                          defaultValue={line.unit_price}
                          onBlur={(e) =>
                            updateLine.mutate({
                              id: line.id,
                              patch: { unit_price: Number(e.target.value) || 0 },
                            })
                          }
                          aria-label="Daily price"
                        />
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {money(line.quantity * line.days * line.unit_price)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeLine.mutate(line.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {lines.length === 0 ? (
                  <tr className="border-t border-border">
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      No products on this order yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="grid gap-2 border-t border-border p-5 text-sm sm:ml-auto sm:max-w-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{money(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Discount</span>
              <span>-{money(totals.discount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Shipping</span>
              <span>{money(totals.shipping)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">VAT</span>
              <span>{money(totals.vat)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
              <span>Total</span>
              <span>{money(totals.total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right rail */}
      <aside className="grid content-start gap-4">
        <div className="grid gap-2 rounded-2xl border border-border bg-card p-4">
          <Button variant="outline" className="justify-start" onClick={printPicklist}>
            <Printer className="size-4" /> Pick list
          </Button>
          <Button variant="outline" className="justify-start" onClick={printPicklist}>
            <FileText className="size-4" /> Packing slip
          </Button>
        </div>

        <div className="rounded-2xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">Payment</div>
          <div className="grid gap-2 px-4 py-4 text-sm">
            <span
              className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${
                PAYMENT_TONE[order.payment_status] ?? "bg-muted text-muted-foreground"
              }`}
            >
              {PAYMENT_LABEL[order.payment_status] ?? order.payment_status}
            </span>
            <OrderPaidControl orderId={order.id} />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="font-semibold">{money(totals.total)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Deposit</span>
              <span className="font-semibold">{money(deposit)}</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">History</div>
          <ul className="grid gap-2 px-4 py-4 text-xs text-muted-foreground">
            {events.map((event) => (
              <li key={event.id}>
                <span className="block text-foreground">
                  {event.from_status ? `${event.from_status} → ` : ""}
                  {event.to_status}
                </span>
                {new Date(event.created_at).toLocaleString("en-GB")}
              </li>
            ))}
            {events.length === 0 ? <li>No events yet.</li> : null}
          </ul>
        </div>
      </aside>
    </div>
  );
}

function UnitPicker({
  line,
  orderId,
  onChange,
}: {
  line: LineRow;
  orderId: string;
  onChange: () => void;
}) {
  const { data: units = [] } = useQuery({
    queryKey: ["stock-units", line.equipment_id],
    enabled: Boolean(line.equipment_id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_items")
        .select("id, identifier, status")
        .eq("equipment_id", line.equipment_id!)
        .order("identifier");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: assigned = [] } = useQuery({
    queryKey: ["assignments", line.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_item_assignments")
        .select("id, stock_item_id, damaged")
        .eq("order_line_id", line.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const queryClient = useQueryClient();
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["assignments", line.id] });
    queryClient.invalidateQueries({ queryKey: ["stock-units", line.equipment_id] });
    onChange();
  };

  const toggle = async (stockItemId: string) => {
    const existing = assigned.find((a) => a.stock_item_id === stockItemId);
    if (existing) {
      const { error } = await supabase
        .from("stock_item_assignments")
        .delete()
        .eq("id", existing.id);
      if (error) {
        toast.error(error.message);
        return;
      }
    } else {
      const { error } = await supabase
        .from("stock_item_assignments")
        .insert({ order_line_id: line.id, stock_item_id: stockItemId });
      if (error) {
        toast.error(error.message);
        return;
      }
    }
    refresh();
  };

  const markDamaged = async (assignmentId: string, damaged: boolean) => {
    const { error } = await supabase
      .from("stock_item_assignments")
      .update({ damaged })
      .eq("id", assignmentId);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
  };

  return (
    <div className="mt-2 flex flex-wrap gap-2" data-order={orderId}>
      {units.map((unit) => {
        const assignment = assigned.find((a) => a.stock_item_id === unit.id);
        return (
          <span key={unit.id} className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => toggle(unit.id)}
              className={`rounded-full border px-2 py-0.5 text-xs ${
                assignment
                  ? "border-primary bg-primary/10 text-primary"
                  : unit.status === "in_stock"
                    ? "border-border text-muted-foreground"
                    : "border-border/60 text-muted-foreground/60"
              }`}
              title={unit.status}
            >
              {unit.identifier}
            </button>
            {assignment ? (
              <button
                type="button"
                onClick={() => markDamaged(assignment.id, !assignment.damaged)}
                className={`text-[10px] uppercase ${
                  assignment.damaged ? "text-destructive" : "text-muted-foreground"
                }`}
              >
                {assignment.damaged ? "damaged" : "OK"}
              </button>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

/** paid_at drives My invoice unlocking (paid AND job end + 24 h). Admin-only in the database. */
function OrderPaidControl({ orderId }: { orderId: string }) {
  const qc = useQueryClient();
  const key = ["order-paid-at", orderId];
  const { data: paidAt } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("paid_at")
        .eq("id", orderId)
        .single();
      if (error) throw error;
      return data.paid_at;
    },
  });
  const set = useMutation({
    mutationFn: async (paid: boolean) => {
      const { error } = await supabase
        .from("orders")
        .update({ paid_at: paid ? new Date().toISOString() : null })
        .eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["org-invoice-rows"] });
    },
    onError: (e: Error) =>
      toast.error(e.message.includes("forbidden") ? "Only admins can mark orders paid" : e.message),
  });
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">
        {paidAt ? `Paid ${paidAt.slice(0, 10)}` : "Not marked paid"}
      </span>
      <Button
        size="sm"
        variant={paidAt ? "ghost" : "default"}
        disabled={set.isPending}
        onClick={() => set.mutate(!paidAt)}
      >
        {paidAt ? "Undo paid" : "Mark paid"}
      </Button>
    </div>
  );
}
