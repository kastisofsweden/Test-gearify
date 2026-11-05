import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchAllUnits, useUnitProducts, type UnitRow } from "@/components/admin/UnitsTab";
import { ProductLabelDialog } from "@/components/admin/ProductLabelDialog";
import { useFullAdmin } from "@/hooks/use-admin-access";
import { NoAccess } from "@/components/admin/NoAccess";
import { loadStaffAccess } from "@/lib/staffAccess";
import { LABEL, printInstruction, type LabelInput } from "@/lib/productLabel";
import { publicSiteBaseUrl } from "@/lib/unitUrls";
import { useLabelJobContext } from "@/components/admin/labelContext";
import { byRegistration, parseUnitIds, unitLabelInputs, unitsToPrint } from "@/lib/unitLabelJob";
import { UNIT_STATUSES, UNIT_STATUS_LABEL, formatDateTime } from "@/lib/units";

const searchSchema = z.object({
  ids: z.string().optional().catch(undefined),
  batch: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/_authenticated/print-labels")({
  validateSearch: searchSchema,
  beforeLoad: async () => ({ staff: await loadStaffAccess() }),
  head: () => ({
    meta: [
      { title: "Print unit labels | Renthub back office" },
      {
        name: "description",
        content: "Print unit labels with QR, Code 128 and S/N on a Brother QL-1100c.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Print unit labels | Renthub back office" },
      { property: "og:description", content: "Print unit labels with QR, Code 128 and S/N." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrintLabelsPage,
});

function PrintLabelsPage() {
  const { staff } = Route.useRouteContext();
  if (!staff.isStaff || staff.partnerOnly) return <NoAccess />;
  return <PrintLabelsAdminCheck />;
}

function PrintLabelsAdminCheck() {
  const { data: isAdmin, isLoading } = useFullAdmin();
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Checking access…
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="font-display text-3xl tracking-wide">Admin access required</h1>
        <p className="max-w-md text-sm text-muted-foreground">Only admins can print unit labels.</p>
        <Button asChild variant="outline">
          <Link to="/admin">Back to the back office</Link>
        </Button>
      </div>
    );
  }
  return <PrintLabels />;
}

function PrintLabels() {
  const search = Route.useSearch();
  const queryClient = useQueryClient();
  const { data: units = [], isLoading } = useQuery({ queryKey: ["units"], queryFn: fetchAllUnits });
  const { data: products = [] } = useUnitProducts();

  const [product, setProduct] = useState("");
  const [batch, setBatch] = useState(search.batch ?? "");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [includeTest, setIncludeTest] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [job, setJob] = useState<{ ids: string[]; labels: LabelInput[] } | null>(null);
  const [confirmIds, setConfirmIds] = useState<string[] | null>(null);
  const preselected = useRef(false);

  // Pre-select from ?ids or ?batch once units are loaded.
  useEffect(() => {
    if (preselected.current || units.length === 0) return;
    preselected.current = true;
    const ids = parseUnitIds(search.ids);
    const picked = units.filter(
      (u) => ids.has(u.id) || (search.batch && u.import_batch === search.batch),
    );
    if (picked.length) {
      setSelected(new Set(picked.map((u) => u.id)));
      if (picked.some((u) => u.is_test)) setIncludeTest(true);
    }
  }, [units, search.ids, search.batch]);

  const batches = useMemo(
    () =>
      [...new Set(units.map((u) => u.import_batch).filter((b): b is string => Boolean(b)))]
        .sort()
        .reverse(),
    [units],
  );

  const filtered = useMemo(() => {
    const fromTs = from ? new Date(`${from}T00:00:00`).getTime() : null;
    const toTs = to ? new Date(`${to}T00:00:00`).getTime() + 86_400_000 : null;
    return units
      .filter((u) => {
        if (!includeTest && u.is_test) return false;
        if (product && u.equipment_id !== product) return false;
        if (batch && u.import_batch !== batch) return false;
        if (status && u.status !== status) return false;
        const created = new Date(u.created_at).getTime();
        if (fromTs !== null && created < fromTs) return false;
        if (toTs !== null && created >= toTs) return false;
        return true;
      })
      .sort(byRegistration);
  }, [units, includeTest, product, batch, status, from, to]);

  const toPrint = useMemo(() => unitsToPrint(units, selected), [units, selected]);
  const hiddenSelected = toPrint.filter((u) => !filtered.some((f) => f.id === u.id)).length;

  const labelCtx = useLabelJobContext();
  const ready = toPrint.length > 0 && labelCtx.ready;
  const print = () => {
    if (!ready) return;
    setJob({
      ids: toPrint.map((u) => u.id),
      labels: unitLabelInputs(toPrint, labelCtx),
    });
  };

  const record = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data, error } = await supabase.rpc("record_label_print", { _unit_ids: ids });
      if (error) throw error;
      return Number(data ?? 0);
    },
    onSuccess: (count) => {
      toast.success(`Recorded ${count} printed label${count === 1 ? "" : "s"}`);
      setConfirmIds(null);
      queryClient.invalidateQueries({ queryKey: ["units"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const selectAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      filtered.forEach((u) => next.add(u.id));
      return next;
    });
  const selectNone = () => setSelected(new Set());
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="print-root min-h-screen bg-background p-5 font-sans lg:p-8">
      <div className="no-print mx-auto grid max-w-6xl gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link
              to="/admin"
              search={{ tab: "units" }}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" /> Units
            </Link>
            <h1 className="font-display text-3xl tracking-wide">Print labels</h1>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Button onClick={print} disabled={!ready}>
              <Printer className="size-4" /> Print {toPrint.length} label
              {toPrint.length === 1 ? "" : "s"}
            </Button>
          </div>
        </div>

        <details className="rounded-2xl border border-border bg-card p-4 text-sm">
          <summary className="cursor-pointer font-semibold">
            Printing help · Brother QL-1100c
          </summary>
          <ol className="mt-3 grid list-decimal gap-2 pl-5">
            <li>
              Install the Brother QL-1100c driver (not "Generic") and load the matching DK roll.
            </li>
            <li>{printInstruction(LABEL.heightMm)}</li>
            <li>
              Labels are 62 × {LABEL.heightMm} mm; a job uses 62 × {LABEL.fallbackHeightMm} mm only
              when the codes don't fit scannably — the print window always shows the actual size,
              and the instruction there follows it.
            </li>
            <li>Chrome or Edge are recommended. Safari works but check the margins.</li>
            <li>Print one test label first.</li>
            <li>
              Worn label? Search the unit in Units, select it and reprint. The S/N and QR stay the
              same every time.
            </li>
          </ol>
          <p className="mt-3 text-muted-foreground">
            QR codes point to{" "}
            <span className="font-mono text-foreground">{publicSiteBaseUrl()}/i/…</span>
          </p>
        </details>

        <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-6">
          <FilterSelect label="Product" value={product} onChange={setProduct}>
            <option value="">All products</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Batch" value={batch} onChange={setBatch}>
            <option value="">All batches</option>
            {batches.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Status" value={status} onChange={setStatus}>
            <option value="">All statuses</option>
            {UNIT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {UNIT_STATUS_LABEL[s]}
              </option>
            ))}
          </FilterSelect>
          <div className="grid gap-1.5">
            <Label htmlFor="print-from">Created from</Label>
            <Input
              id="print-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="print-to">Created to</Label>
            <Input id="print-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <Checkbox checked={includeTest} onCheckedChange={(v) => setIncludeTest(v === true)} />
            Include test units
          </label>
        </div>

        <div className="rounded-2xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3 text-sm">
            <span>
              {toPrint.length} selected · {filtered.length} shown
              {hiddenSelected ? ` · ${hiddenSelected} selected but hidden by filters` : ""}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={selectAll}
                disabled={filtered.length === 0}
              >
                Select all
              </Button>
              <Button size="sm" variant="ghost" onClick={selectNone} disabled={selected.size === 0}>
                Select none
              </Button>
            </div>
          </div>
          <ul className="max-h-80 divide-y divide-border overflow-y-auto">
            {isLoading && <li className="p-4 text-sm text-muted-foreground">Loading units…</li>}
            {!isLoading && filtered.length === 0 && (
              <li className="p-4 text-sm text-muted-foreground">No units match the filters.</li>
            )}
            {filtered.map((u) => (
              <li key={u.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-secondary/60">
                  <Checkbox checked={selected.has(u.id)} onCheckedChange={() => toggle(u.id)} />
                  <span className="w-32 whitespace-nowrap font-mono font-medium">
                    {u.serial_code}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{u.equipment?.name ?? "—"}</span>
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    Printed {u.label_print_count}× · {formatDateTime(u.label_last_printed_at)}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {job && (
        <ProductLabelDialog
          labels={job.labels}
          fileName={`labels-${job.labels[0]?.barcodeValue ?? "units"}${job.labels.length > 1 ? `-${job.labels.length}` : ""}`}
          onClose={() => setJob(null)}
          onPrinted={() => setConfirmIds(job.ids)}
        />
      )}

      <Dialog open={Boolean(confirmIds)} onOpenChange={(open) => !open && setConfirmIds(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Did the labels print correctly?</DialogTitle>
            <DialogDescription>
              Yes records {confirmIds?.length ?? 0} printed label
              {confirmIds?.length === 1 ? "" : "s"} on the units.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmIds(null)}>
              No
            </Button>
            <Button
              onClick={() => confirmIds && record.mutate(confirmIds)}
              disabled={record.isPending}
            >
              Yes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      <select
        className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal text-foreground"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </label>
  );
}
