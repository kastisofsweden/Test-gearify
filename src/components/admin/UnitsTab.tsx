import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Copy, History, Pencil, Plus, Printer, Upload } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { UnitHistorySheet } from "@/components/admin/UnitHistorySheet";
import { UnitImportDialog } from "@/components/admin/UnitImportDialog";
import { unitPublicUrl } from "@/lib/unitUrls";
import {
  MAX_PRINT_IDS,
  MAX_UNITS_PER_CALL,
  UNIT_STATUSES,
  UNIT_STATUS_LABEL,
  UNIT_STATUS_TONE,
  batchName,
  formatDateTime,
  printLabelsSearch,
  unitErrorMessage,
  type ImportProduct,
} from "@/lib/units";

export type UnitRow = {
  id: string;
  equipment_id: string;
  unit_number: string;
  serial_code: string;
  qr_token: string;
  serial_number: string | null;
  status: string;
  location: string | null;
  import_batch: string | null;
  is_test: boolean;
  label_print_count: number;
  label_last_printed_at: string | null;
  created_at: string;
  notes: string | null;
  equipment: { name: string; sku: string | null; category: string | null } | null;
};

const PAGE = 100;

export async function fetchAllUnits(): Promise<UnitRow[]> {
  const all: UnitRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("stock_items")
      .select(
        "id, equipment_id, unit_number, serial_code, qr_token, serial_number, status, location, import_batch, is_test, label_print_count, label_last_printed_at, created_at, notes, equipment(name, sku, category)",
      )
      .order("created_at", { ascending: false })
      .order("serial_code", { ascending: false })
      .range(from, from + 999);
    if (error) throw error;
    all.push(...((data ?? []) as UnitRow[]));
    if (!data || data.length < 1000) break;
  }
  return all;
}

export function useUnitProducts() {
  return useQuery({
    queryKey: ["unit-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipment")
        .select("id, name, sku, item_kind")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as ImportProduct[];
    },
  });
}

export function UnitsTab() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    data: units = [],
    isLoading,
    error,
  } = useQuery({ queryKey: ["units"], queryFn: fetchAllUnits });
  const { data: products = [] } = useUnitProducts();

  const [product, setProduct] = useState("");
  const [status, setStatus] = useState("");
  const [batch, setBatch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [showTest, setShowTest] = useState(false);
  const [visible, setVisible] = useState(PAGE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [editing, setEditing] = useState<UnitRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);

  const batches = useMemo(
    () =>
      [...new Set(units.map((u) => u.import_batch).filter((b): b is string => Boolean(b)))]
        .sort()
        .reverse(),
    [units],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromTs = from ? new Date(`${from}T00:00:00`).getTime() : null;
    const toTs = to ? new Date(`${to}T00:00:00`).getTime() + 86_400_000 : null;
    return units.filter((u) => {
      if (!showTest && u.is_test) return false;
      if (product && u.equipment_id !== product) return false;
      if (status && u.status !== status) return false;
      if (batch && u.import_batch !== batch) return false;
      const created = new Date(u.created_at).getTime();
      if (fromTs !== null && created < fromTs) return false;
      if (toTs !== null && created >= toTs) return false;
      if (
        q &&
        ![u.serial_code, u.unit_number, u.serial_number ?? ""].some((v) =>
          v.toLowerCase().includes(q),
        )
      ) {
        return false;
      }
      return true;
    });
  }, [units, product, status, batch, from, to, search, showTest]);

  const filteredIds = filtered.map((u) => u.id);
  const selectedInView = filteredIds.filter((id) => selected.has(id)).length;
  const allSelected = filtered.length > 0 && selectedInView === filtered.length;

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) filteredIds.forEach((id) => next.delete(id));
      else filteredIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const goPrint = (ids: string[], batchLabel?: string | null) => {
    const searchParams = printLabelsSearch(ids, batchLabel);
    if (!searchParams) {
      toast.error(`Select at most ${MAX_PRINT_IDS} units per print run.`);
      return;
    }
    navigate({ to: "/print-labels", search: searchParams });
  };

  const copyUrl = async (token: string) => {
    try {
      await navigator.clipboard.writeText(unitPublicUrl(token));
      toast.success("Public link copied");
    } catch {
      toast.error("Could not copy the link");
    }
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["units"] });
    queryClient.invalidateQueries({ queryKey: ["unit-history"] });
    queryClient.invalidateQueries({ queryKey: ["stock-items"] });
    queryClient.invalidateQueries({ queryKey: ["stock-equipment"] });
  };

  const resetFilters = () => {
    setProduct("");
    setStatus("");
    setBatch("");
    setFrom("");
    setTo("");
    setSearch("");
    setShowTest(false);
    setVisible(PAGE);
  };

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setAdding(true)}>
          <Plus className="size-4" /> Add units
        </Button>
        <Button variant="outline" onClick={() => setImporting(true)}>
          <Upload className="size-4" /> Import CSV
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">{selected.size} selected</span>
          {selected.size > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          )}
          <Button
            variant="outline"
            disabled={selected.size === 0}
            onClick={() => goPrint([...selected])}
          >
            <Printer className="size-4" /> Print labels
          </Button>
        </div>
      </div>

      <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <div className="grid gap-1.5 xl:col-span-2">
          <Label htmlFor="unit-search">Search</Label>
          <Input
            id="unit-search"
            placeholder="S/N, unit number or manufacturer S/N"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setVisible(PAGE);
            }}
          />
        </div>
        <FilterSelect label="Product" value={product} onChange={setProduct}>
          <option value="">All products</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
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
        <FilterSelect label="Batch" value={batch} onChange={setBatch}>
          <option value="">All batches</option>
          {batches.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </FilterSelect>
        <div className="grid gap-1.5">
          <Label htmlFor="unit-from">Created from</Label>
          <Input
            id="unit-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="unit-to">Created to</Label>
          <Input id="unit-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-4 sm:col-span-2 lg:col-span-4 xl:col-span-7">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={showTest} onCheckedChange={(v) => setShowTest(v === true)} />
            Show test units
          </label>
          <span className="text-sm text-muted-foreground">
            {filtered.length} of {units.length} units
          </span>
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            Reset filters
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[1200px] text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-3 py-3">
                <Checkbox
                  aria-label="Select all filtered units"
                  checked={allSelected ? true : selectedInView > 0 ? "indeterminate" : false}
                  onCheckedChange={toggleAll}
                  disabled={filtered.length === 0}
                />
              </th>
              <th className="px-3 py-3">S/N</th>
              <th className="px-3 py-3">Product</th>
              <th className="px-3 py-3">Manufacturer S/N</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Location</th>
              <th className="px-3 py-3">Batch</th>
              <th className="px-3 py-3">Labels</th>
              <th className="px-3 py-3">Last printed</th>
              <th className="px-3 py-3">Created</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={11} className="px-4 py-6 text-center text-muted-foreground">
                  Loading units…
                </td>
              </tr>
            )}
            {error && (
              <tr>
                <td colSpan={11} className="px-4 py-6 text-center text-destructive">
                  {(error as Error).message}
                </td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-6 text-center text-muted-foreground">
                  {units.length === 0
                    ? "No units registered yet. Add units or import a CSV."
                    : "No units match the filters."}
                </td>
              </tr>
            )}
            {filtered.slice(0, visible).map((u) => (
              <tr key={u.id} className="border-t border-border/60 align-top">
                <td className="px-3 py-3">
                  <Checkbox
                    aria-label={`Select ${u.serial_code}`}
                    checked={selected.has(u.id)}
                    onCheckedChange={() => toggle(u.id)}
                  />
                </td>
                <td className="px-3 py-3">
                  <span className="whitespace-nowrap font-mono font-medium">{u.serial_code}</span>
                  {u.is_test && (
                    <Badge variant="outline" className="ml-2">
                      Test
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-3">{u.equipment?.name ?? "—"}</td>
                <td className="px-3 py-3 font-mono text-xs">{u.serial_number ?? "—"}</td>
                <td className="px-3 py-3">
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-medium ${UNIT_STATUS_TONE[u.status] ?? ""}`}
                  >
                    {UNIT_STATUS_LABEL[u.status] ?? u.status}
                  </span>
                </td>
                <td className="px-3 py-3">{u.location ?? "—"}</td>
                <td className="px-3 py-3 text-xs text-muted-foreground">{u.import_batch ?? "—"}</td>
                <td className="px-3 py-3 text-center">{u.label_print_count}</td>
                <td className="px-3 py-3 text-xs text-muted-foreground">
                  {formatDateTime(u.label_last_printed_at)}
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground">
                  {formatDateTime(u.created_at)}
                </td>
                <td className="px-3 py-3">
                  <div className="flex justify-end gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Copy public link"
                      onClick={() => copyUrl(u.qr_token)}
                    >
                      <Copy className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Edit ${u.serial_code}`}
                      onClick={() => setEditing(u)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setHistoryId(u.id)}>
                      <History className="size-4" /> History
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length > visible && (
        <Button
          variant="outline"
          className="justify-self-center"
          onClick={() => setVisible((v) => v + PAGE)}
        >
          Show more ({filtered.length - visible} remaining)
        </Button>
      )}

      <UnitHistorySheet unitId={historyId} onOpenChange={(open) => !open && setHistoryId(null)} />
      {editing && (
        <EditUnitDialog
          unit={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
          onCopy={copyUrl}
        />
      )}
      {adding && (
        <AddUnitsDialog
          products={products}
          onClose={() => setAdding(false)}
          onCreated={refresh}
          onPrint={goPrint}
        />
      )}
      {importing && (
        <UnitImportDialog
          products={products}
          units={units}
          onClose={() => setImporting(false)}
          onCreated={refresh}
          onPrint={goPrint}
        />
      )}
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

function EditUnitDialog({
  unit,
  onClose,
  onSaved,
  onCopy,
}: {
  unit: UnitRow;
  onClose: () => void;
  onSaved: () => void;
  onCopy: (token: string) => void;
}) {
  const [serial, setSerial] = useState(unit.serial_number ?? "");
  const [location, setLocation] = useState(unit.location ?? "");
  const [status, setStatus] = useState(unit.status);
  const [notes, setNotes] = useState(unit.notes ?? "");

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("stock_items")
        .update({
          serial_number: serial.trim() || null,
          location: location.trim() || null,
          status,
          notes: notes.trim() || null,
        })
        .eq("id", unit.id);
      if (error) {
        if (error.code === "23505")
          throw new Error("That manufacturer S/N already exists for this product.");
        throw error;
      }
    },
    onSuccess: () => {
      toast.success(`${unit.serial_code} saved`);
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit unit {unit.serial_code}</DialogTitle>
          <DialogDescription>{unit.equipment?.name}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-3 rounded-xl border border-border bg-muted/40 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">S/N</span>
              <span className="font-mono font-semibold">{unit.serial_code}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Legacy unit number</span>
              <span className="font-mono text-xs">{unit.unit_number}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Public link</span>
              <span className="flex min-w-0 items-center gap-1">
                <span className="truncate font-mono text-xs">{unitPublicUrl(unit.qr_token)}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Copy public link"
                  onClick={() => onCopy(unit.qr_token)}
                >
                  <Copy className="size-4" />
                </Button>
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              The S/N, unit number and QR link can never change.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-serial">Manufacturer S/N</Label>
            <Input
              id="edit-serial"
              maxLength={120}
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-location">Location</Label>
            <Input
              id="edit-location"
              maxLength={200}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <label className="grid gap-2 text-sm font-medium">
            Status
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {UNIT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {UNIT_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-2">
            <Label htmlFor="edit-notes">Note</Label>
            <Textarea
              id="edit-notes"
              maxLength={2000}
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type CreatedUnit = {
  id: string;
  serial_code: string;
  unit_number: string;
  qr_token: string;
  serial_number: string | null;
};

function AddUnitsDialog({
  products,
  onClose,
  onCreated,
  onPrint,
}: {
  products: ImportProduct[];
  onClose: () => void;
  onCreated: () => void;
  onPrint: (ids: string[], batch?: string | null) => void;
}) {
  const trackable = products.filter((p) => p.item_kind !== "service" && p.item_kind !== "bundle");
  const [equipmentId, setEquipmentId] = useState(trackable[0]?.id ?? "");
  const [count, setCount] = useState("1");
  const [batch, setBatch] = useState(() => batchName("manual"));
  const [location, setLocation] = useState("");
  const [isTest, setIsTest] = useState(false);
  const [created, setCreated] = useState<CreatedUnit[] | null>(null);

  const n = Number(count);
  const validCount = Number.isInteger(n) && n >= 1 && n <= MAX_UNITS_PER_CALL;

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("create_units", {
        _equipment_id: equipmentId,
        _count: n,
        _batch: batch.trim() || batchName("manual"),
        _is_test: isTest,
        ...(location.trim() ? { _location: location.trim() } : {}),
      });
      if (error) throw error;
      return (data ?? []) as CreatedUnit[];
    },
    onSuccess: (rows) => {
      setCreated(rows);
      toast.success(`${rows.length} unit${rows.length === 1 ? "" : "s"} created`);
      onCreated();
    },
    onError: (error: Error) => toast.error(unitErrorMessage(error.message)),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add units</DialogTitle>
          <DialogDescription>
            Each unit gets its own S/N — organization prefix, the organization's next free unit
            number, category code and the unit number within the item — and a QR link. The product
            switches to serialized tracking.
          </DialogDescription>
        </DialogHeader>

        {created ? (
          <div className="grid gap-3">
            <p className="text-sm">
              Created {created.length} unit{created.length === 1 ? "" : "s"}:{" "}
              <span className="font-mono">
                {created[0]?.serial_code}
                {created.length > 1 ? ` – ${created[created.length - 1]?.serial_code}` : ""}
              </span>
            </p>
            <div className="max-h-48 overflow-y-auto rounded-xl border border-border p-3 font-mono text-xs">
              {created.map((c) => c.serial_code).join(", ")}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Done
              </Button>
              <Button
                onClick={() =>
                  onPrint(
                    created.map((c) => c.id),
                    batch.trim(),
                  )
                }
              >
                <Printer className="size-4" /> Print these labels
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="grid gap-4">
              <label className="grid gap-2 text-sm font-medium">
                Product
                <select
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
                  value={equipmentId}
                  onChange={(e) => setEquipmentId(e.target.value)}
                >
                  {trackable.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-2">
                <Label htmlFor="add-count">Number of units (1–{MAX_UNITS_PER_CALL})</Label>
                <Input
                  id="add-count"
                  type="number"
                  min={1}
                  max={MAX_UNITS_PER_CALL}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  aria-invalid={!validCount || undefined}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="add-batch">Batch name</Label>
                <Input
                  id="add-batch"
                  maxLength={120}
                  value={batch}
                  onChange={(e) => setBatch(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="add-location">Location (optional)</Label>
                <Input
                  id="add-location"
                  maxLength={200}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={isTest} onCheckedChange={(v) => setIsTest(v === true)} />
                Test units (hidden from the list by default)
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={() => create.mutate()}
                disabled={!equipmentId || !validCount || create.isPending}
              >
                {create.isPending
                  ? "Creating…"
                  : `Create ${validCount ? n : ""} unit${n === 1 ? "" : "s"}`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
