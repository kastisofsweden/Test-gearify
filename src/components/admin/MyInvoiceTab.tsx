import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Lock } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOrganizations } from "@/components/admin/OrganizationsTab";
import { invoiceRowStatus, type InvoiceStatus } from "@/lib/invoiceShares";
import { formatSek } from "@/lib/rental";

type Row = {
  id: string;
  row_type: "rental_share" | "commission";
  organization_id: string | null;
  organization_name: string | null;
  order_id: string;
  order_number: string | null;
  order_status: string;
  customer_name: string | null;
  item_title: string | null;
  starts_on: string | null;
  ends_on: string | null;
  share_bps: number;
  base_amount: number;
  commission_amount: number;
  amount: number;
  paid_at: string | null;
  ends_at: string;
  invoiced_at: string | null;
};

const selectCls = "h-9 rounded-md border border-input bg-background px-3 text-sm";

/** Per-share invoice rows for the user's organization(s); admins see everything. */
export function MyInvoiceTab({
  isStaff,
  organizationIds,
}: {
  isStaff: boolean;
  organizationIds: string[];
}) {
  const qc = useQueryClient();
  const [view, setView] = useState<"uninvoiced" | "archived">("uninvoiced");
  const [orgId, setOrgId] = useState<string>(isStaff ? "" : (organizationIds[0] ?? ""));
  const [month, setMonth] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | InvoiceStatus>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<Row | null>(null);
  const { data: orgs = [] } = useOrganizations();

  const {
    data: raw = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["org-invoice-rows", orgId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_org_invoice_rows", {
        ...(orgId ? { _org_id: orgId } : {}),
      });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const rows = useMemo(() => {
    const now = new Date();
    return raw.map((r) => ({
      ...r,
      computed: invoiceRowStatus({
        paidAt: r.paid_at,
        endsAt: r.ends_at,
        invoicedAt: r.invoiced_at,
        now,
      }),
    }));
  }, [raw]);

  const months = useMemo(
    () =>
      [...new Set(rows.map((r) => (r.starts_on ?? "").slice(0, 7)).filter(Boolean))]
        .sort()
        .reverse(),
    [rows],
  );

  const filtered = rows.filter(
    (r) =>
      (!month || (r.starts_on ?? "").startsWith(month)) &&
      (!statusFilter || r.computed.status === statusFilter),
  );
  const tabRows = filtered.filter((r) =>
    view === "archived" ? r.computed.status === "invoiced" : r.computed.status !== "invoiced",
  );

  const sum = (s: InvoiceStatus) =>
    filtered.filter((r) => r.computed.status === s).reduce((t, r) => t + Number(r.amount), 0);
  const readyCount = filtered.filter((r) => r.computed.status === "invoiceable").length;
  const activeTotal = tabRows
    .filter((r) => r.computed.status !== "pending")
    .reduce((t, r) => t + Number(r.amount), 0);

  const markInvoiced = useMutation({
    mutationFn: async ({ ids, invoiced }: { ids: string[]; invoiced: boolean }) => {
      const { data, error } = await supabase.rpc("set_invoice_rows_invoiced", {
        _ids: ids,
        _invoiced: invoiced,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n, v) => {
      toast.success(`${n} row(s) ${v.invoiced ? "marked invoiced" : "moved back"}`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["org-invoice-rows"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportCsv = () => {
    const head = [
      "type",
      "order",
      "organization",
      "customer",
      "item",
      "starts_on",
      "ends_on",
      "share_pct",
      "amount_sek",
      "status",
    ];
    const lines = tabRows.map((r) =>
      [
        r.row_type,
        r.order_number,
        r.organization_name,
        r.customer_name,
        r.item_title,
        r.starts_on,
        r.ends_on,
        r.share_bps / 100,
        r.amount,
        r.computed.status,
      ]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `invoice-rows-${view}.csv`;
    a.click();
  };

  const orgOptions = isStaff
    ? orgs.map((o) => ({ id: o.id, name: o.name }))
    : organizationIds.map((id) => ({
        id,
        name: orgs.find((o) => o.id === id)?.name ?? "My organization",
      }));

  return (
    <div className="grid gap-4">
      <div>
        <h2 className="text-xl font-semibold">My invoice</h2>
        <p className="text-sm text-muted-foreground">
          Your organization&apos;s share of each rented line. Rows unlock once the order is paid and
          24 hours have passed after the job ends. Commission stays with the platform.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-dashed border-border p-4 text-muted-foreground">
          <div className="text-xs uppercase tracking-wider">Pending</div>
          <div className="text-2xl font-bold">{formatSek(sum("pending"))}</div>
        </div>
        <div className="rounded-xl border border-border p-4">
          <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
            Invoiceable
            {readyCount > 0 && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] text-primary-foreground normal-case">
                {readyCount} rows ready to invoice
              </span>
            )}
          </div>
          <div className="text-2xl font-bold">{formatSek(sum("invoiceable"))}</div>
        </div>
        <div className="rounded-xl border border-border p-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Invoiced</div>
          <div className="text-2xl font-bold">{formatSek(sum("invoiced"))}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="inline-flex rounded-md border border-border p-0.5">
          {(["uninvoiced", "archived"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                setView(v);
                setSelected(new Set());
              }}
              className={`rounded px-3 py-1.5 text-sm ${view === v ? "bg-secondary font-semibold" : "text-muted-foreground"}`}
            >
              {v === "uninvoiced" ? "Uninvoiced" : "Archived"}
            </button>
          ))}
        </div>
        {(isStaff || organizationIds.length > 1) && (
          <div className="grid gap-1">
            <Label htmlFor="inv-org">Organization</Label>
            <select
              id="inv-org"
              className={selectCls}
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
            >
              {isStaff && <option value="">All organizations</option>}
              {orgOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="grid gap-1">
          <Label htmlFor="inv-month">Month</Label>
          <select
            id="inv-month"
            className={selectCls}
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          >
            <option value="">All months</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <Label htmlFor="inv-status">Status</Label>
          <select
            id="inv-status"
            className={selectCls}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "" | InvoiceStatus)}
          >
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="invoiceable">Invoiceable</option>
            <option value="invoiced">Invoiced</option>
          </select>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!tabRows.length}>
            Export CSV
          </Button>
          {selected.size > 0 && (
            <Button
              size="sm"
              disabled={markInvoiced.isPending}
              onClick={() =>
                markInvoiced.mutate({ ids: [...selected], invoiced: view === "uninvoiced" })
              }
            >
              {view === "uninvoiced"
                ? `Mark ${selected.size} invoiced`
                : `Move ${selected.size} back`}
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-2">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && <p className="text-sm text-destructive">Could not load invoice rows.</p>}
        {!isLoading && !error && tabRows.length === 0 && (
          <p className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
            No rows here.
          </p>
        )}
        {tabRows.map((r) => {
          const locked = r.computed.status === "pending";
          return (
            <div
              key={r.id}
              className={`flex items-center gap-3 rounded-xl border p-3 ${locked ? "border-dashed border-border opacity-60" : "border-border bg-card"}`}
            >
              {locked ? (
                <Lock className="size-4 shrink-0 text-muted-foreground" aria-label="Locked" />
              ) : (
                <input
                  type="checkbox"
                  aria-label="Select row"
                  checked={selected.has(r.id)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(r.id);
                    else next.delete(r.id);
                    setSelected(next);
                  }}
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="rounded bg-secondary px-1.5 py-0.5 font-medium text-secondary-foreground">
                    {r.row_type === "commission" ? "Commission" : "Rental share"}
                  </span>
                  <span>{r.starts_on}</span>
                  <span>#{r.order_number}</span>
                  {isStaff && r.organization_name && <span>· {r.organization_name}</span>}
                  {locked && r.computed.reason && (
                    <span className="font-medium">{r.computed.reason}</span>
                  )}
                </div>
                <div className="truncate font-medium">{r.item_title}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {[
                    r.customer_name,
                    r.item_title,
                    `${r.starts_on} – ${r.ends_on}`,
                    `${r.share_bps / 100}%`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <div className="text-right font-semibold">{formatSek(Number(r.amount))}</div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Calculation details"
                onClick={() => setDetail(r)}
              >
                <Eye className="size-4" />
              </Button>
            </div>
          );
        })}
        {tabRows.length > 0 && (
          <div className="flex justify-end gap-2 border-t border-border pt-2 text-sm">
            <span className="text-muted-foreground">Total (excl. locked rows)</span>
            <span className="font-bold">{formatSek(activeTotal)}</span>
          </div>
        )}
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Calculation details</DialogTitle>
            <DialogDescription>
              #{detail?.order_number} · {detail?.item_title}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <dl className="grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Line base rental</dt>
              <dd className="text-right">
                {formatSek(
                  detail.row_type === "commission"
                    ? Number(detail.base_amount)
                    : detail.share_bps > 0
                      ? (Number(detail.base_amount) * 10000) / detail.share_bps
                      : 0,
                )}
              </dd>
              <dt className="text-muted-foreground">Ownership share</dt>
              <dd className="text-right">{detail.share_bps / 100}%</dd>
              <dt className="text-muted-foreground">
                {detail.row_type === "commission" ? "Platform commission" : "Your share"}
              </dt>
              <dd className="text-right font-semibold">{formatSek(Number(detail.amount))}</dd>
              <dt className="text-muted-foreground">Paid</dt>
              <dd className="text-right">
                {detail.paid_at ? detail.paid_at.slice(0, 10) : "Not yet"}
              </dd>
              <dd className="col-span-2 mt-2 text-xs text-muted-foreground">
                Commission is added on top for the customer and stays with the platform; it is never
                split between owners.
              </dd>
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
