import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Barcode,
  ImageIcon,
  Pencil,
  Plus,
  Printer,
  Shuffle,
  Trash2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BarcodeDialog } from "@/components/admin/BarcodeDialog";
import { type BarcodeType } from "@/lib/barcodes";
import { barcodeSaveError } from "@/lib/barcodeErrors";
import { UnitPrintDialog } from "@/components/admin/UnitPrintDialog";
import { StockConversionDialog } from "@/components/admin/StockConversionDialog";
import { ItemDetailsDialog } from "@/components/admin/ItemDetailsDialog";
import {
  SERIAL_REPAIR_QUERY_KEY,
  SerialRepairDialog,
  useSerialRepairPreview,
} from "@/components/admin/SerialRepairDialog";
import { useOrganizations } from "@/components/admin/OrganizationsTab";
import { useFullAdmin } from "@/hooks/use-admin-access";
import { STOCK_STATUS_LABEL, addDaysISO, todayISO } from "@/lib/booking";
import { unitErrorMessage } from "@/lib/units";

type EquipmentRow = {
  id: string;
  name: string;
  category: string;
  tracking: string;
  quantity: number;
  sku: string | null;
  page_type: string | null;
  page_slug: string | null;
  is_active: boolean;
  barcode: string | null;
  barcode_type: string;
  label_print_count: number;
  serial_code: string;
  legacy_barcode: string | null;
  organization_id: string | null;
  image_url: string | null;
  comment: string | null;
  external_report_email: string | null;
  forward_reports_to_external: boolean;
  commission_type: string | null;
  commission_value: number | null;
};

type StockItem = {
  id: string;
  equipment_id: string;
  identifier: string;
  unit_number: string;
  serial_code: string;
  qr_token: string;
  created_at: string;
  status: string;
  notes: string | null;
  barcode: string | null;
  barcode_type: string;
  label_print_count: number;
};

type DialogTarget = {
  kind: "equipment" | "unit";
  id: string;
  title: string;
  subtitle?: string | undefined;
  value: string;
  type: BarcodeType;
};

const DAYS = 14;

export function StockTab() {
  const queryClient = useQueryClient();
  const { data: isAdmin } = useFullAdmin();
  const [selected, setSelectedRaw] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const setSelected = (id: string | null) => {
    setSelectedRaw(id);
    setPicked(new Set());
  };
  const [dialog, setDialog] = useState<DialogTarget | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sortBy, setSortBy] = useState<"category" | "name" | "units">("category");
  const [search, setSearch] = useState("");
  /** itemId null = units of several items (e.g. replacement labels after an S/N fix). */
  const [printJob, setPrintJob] = useState<{ itemId: string | null; directIds?: string[] } | null>(
    null,
  );
  const [itemDialog, setItemDialog] = useState<{ edit: EquipmentRow | null } | null>(null);
  const [repairOpen, setRepairOpen] = useState(false);
  const [unitsToAdd, setUnitsToAdd] = useState(1);
  const { data: orgs = [] } = useOrganizations();
  const { data: repair } = useSerialRepairPreview();
  const reprintIds = new Set((repair?.reprint ?? []).map((r) => r.stock_item_id));
  const [conversion, setConversion] = useState<{ focusId: string | null } | null>(null);
  const [renaming, setRenaming] = useState<EquipmentRow | null>(null);

  const { data: equipment = [] } = useQuery({
    queryKey: ["stock-equipment"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipment")
        .select(
          "id, name, category, tracking, quantity, sku, page_type, page_slug, is_active, barcode, barcode_type, label_print_count, serial_code, legacy_barcode, organization_id, warehouse_id, image_url, comment, external_report_email, forward_reports_to_external, commission_type, commission_value",
        )
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as EquipmentRow[];
    },
  });

  const { data: units = [] } = useQuery({
    queryKey: ["stock-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_items")
        .select(
          "id, equipment_id, identifier, unit_number, serial_code, qr_token, created_at, status, notes, barcode, barcode_type, label_print_count",
        )
        .order("created_at")
        .order("serial_code")
        .range(0, 9999);
      if (error) throw error;
      return (data ?? []) as StockItem[];
    },
  });

  const days = Array.from({ length: DAYS }, (_, i) => addDaysISO(todayISO(), i));

  const { data: calendar = {} } = useQuery({
    queryKey: ["stock-calendar", equipment.map((e) => e.id).join(",")],
    enabled: equipment.length > 0,
    queryFn: async () => {
      const result: Record<string, number[]> = {};
      for (const item of equipment) {
        const values: number[] = [];
        for (const day of days) {
          const { data, error } = await supabase.rpc("available_quantity", {
            _equipment_id: item.id,
            _start: day,
            _end: day,
          });
          if (error) throw error;
          values.push(Number(data ?? 0));
        }
        result[item.id] = values;
      }
      return result;
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["stock-equipment"] });
    queryClient.invalidateQueries({ queryKey: ["stock-items"] });
    queryClient.invalidateQueries({ queryKey: ["stock-calendar"] });
    queryClient.invalidateQueries({ queryKey: SERIAL_REPAIR_QUERY_KEY });
  };

  const updateEquipment = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<EquipmentRow> }) => {
      const { error } = await supabase.from("equipment").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const addUnit = useMutation({
    mutationFn: async ({ equipmentId, count }: { equipmentId: string; count: number }) => {
      const { data, error } = await supabase.rpc("create_units", {
        _equipment_id: equipmentId,
        _count: count,
      });
      if (error) throw error;
      return (data ?? []).map((u) => u.serial_code);
    },
    onSuccess: (codes) => {
      toast.success(
        codes.length === 1
          ? `Unit ${codes[0]} added`
          : `${codes.length} units added (${codes[0]} … ${codes[codes.length - 1]})`,
      );
      invalidate();
    },
    onError: (error: Error) => toast.error(unitErrorMessage(error.message)),
  });

  const updateUnit = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<StockItem> }) => {
      const { error } = await supabase.from("stock_items").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const [confirmDelete, setConfirmDelete] = useState<
    { kind: "units"; ids: string[]; label: string } | { kind: "item"; item: EquipmentRow } | null
  >(null);

  const removeUnits = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data, error } = await supabase.rpc("delete_units", { _unit_ids: ids });
      if (error) throw error;
      return Number(data ?? 0);
    },
    onSuccess: (n) => {
      toast.success(n === 1 ? "Unit deleted" : `${n} units deleted`);
      setPicked(new Set());
      setConfirmDelete(null);
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["units"] });
    },
    onError: (error: Error) => toast.error(unitErrorMessage(error.message)),
  });

  const removeItem = useMutation({
    mutationFn: async (item: EquipmentRow) => {
      const { error } = await supabase.rpc("delete_item", { _equipment_id: item.id });
      if (error) throw error;
      return item;
    },
    onSuccess: (item) => {
      toast.success(`${item.name} deleted`);
      if (selected === item.id) setSelected(null);
      setConfirmDelete(null);
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["units"] });
    },
    onError: (error: Error) => toast.error(unitErrorMessage(error.message)),
  });

  const current = equipment.find((e) => e.id === selected) ?? null;

  const categories = [...new Set(equipment.map((e) => e.category))].sort((a, b) =>
    a.localeCompare(b),
  );
  const unitCount = (id: string) => units.filter((u) => u.equipment_id === id).length;
  // Same rule as the availability engine: units in stock or with a customer make up the stock.
  const countedUnits = (id: string) =>
    units.filter(
      (u) => u.equipment_id === id && (u.status === "in_stock" || u.status === "with_customer"),
    ).length;
  const q = search.trim().toLowerCase();
  const matches = (e: EquipmentRow) =>
    !q ||
    [e.name, e.serial_code, e.legacy_barcode, e.barcode, e.sku].some((v) =>
      (v ?? "").toLowerCase().includes(q),
    ) ||
    units.some(
      (u) =>
        u.equipment_id === e.id &&
        [u.serial_code, u.unit_number].some((v) => v.toLowerCase().includes(q)),
    );
  const rows = equipment
    .filter((e) => !categoryFilter || e.category === categoryFilter)
    .filter(matches)
    .sort((a, b) =>
      sortBy === "units"
        ? unitCount(b.id) - unitCount(a.id) || a.name.localeCompare(b.name)
        : sortBy === "name"
          ? a.name.localeCompare(b.name)
          : a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
    );

  const saveBarcode = useMutation({
    mutationFn: async ({
      target,
      value,
      type,
    }: {
      target: DialogTarget;
      value: string | null;
      type: BarcodeType;
    }) => {
      const table = target.kind === "equipment" ? "equipment" : "stock_items";
      const { error } = await supabase
        .from(table)
        .update({ barcode: value, barcode_type: type })
        .eq("id", target.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setDialog(null);
      toast.success("Barcode saved");
      invalidate();
    },
    onError: (error: Error) => toast.error(barcodeSaveError(error.message)),
  });

  /** Print label on an item: pick which of its units (by S/N) to print. */
  const printProductLabels = (item: EquipmentRow) => setPrintJob({ itemId: item.id });
  const printItem = printJob?.itemId
    ? (equipment.find((e) => e.id === printJob.itemId) ?? null)
    : null;
  const itemNames = Object.fromEntries(
    equipment.map((e) => [e.id, { name: e.name, category: e.category }]),
  );
  const orgName = (id: string | null) => orgs.find((o) => o.id === id)?.name ?? "—";

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1.5 text-sm font-medium">
          Search
          <Input
            className="h-9 w-56 font-normal"
            placeholder="Name, S/N or product code"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Category
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Sort by
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          >
            <option value="category">Category</option>
            <option value="name">Name</option>
            <option value="units">Units (most first)</option>
          </select>
        </label>
        <span className="pb-2 text-sm text-muted-foreground">{rows.length} items</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setRepairOpen(true)}>
            <Wrench className="size-4" /> Fix S/Ns
            {repair && repair.to_change + repair.reprint.length > 0 ? (
              <span className="rounded-full bg-destructive px-1.5 text-[11px] font-semibold text-destructive-foreground">
                {repair.to_change || repair.reprint.length}
              </span>
            ) : null}
          </Button>
          <Button variant="outline" onClick={() => setConversion({ focusId: null })}>
            <Shuffle className="size-4" /> Convert stock to units
          </Button>
          {isAdmin ? (
            <Button onClick={() => setItemDialog({ edit: null })}>
              <Plus className="size-4" /> Add item
            </Button>
          ) : null}
        </div>
      </div>
      {repair && repair.to_change > 0 ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm"
        >
          <AlertTriangle className="size-4 shrink-0 text-destructive" />
          <span className="flex-1">
            {repair.to_change} unit{repair.to_change === 1 ? " shares" : "s share"} an organization
            number with another unit (the first part of the S/N repeats). Review the new S/Ns before
            printing more labels.
          </span>
          <Button size="sm" variant="outline" onClick={() => setRepairOpen(true)}>
            Review fix
          </Button>
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[920px] text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Item</th>
              <th
                className="px-4 py-3"
                title="S/N of the item's physical units (first … last). Bulk items show their product code."
              >
                S/N
              </th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Tracking</th>
              <th className="px-4 py-3">Quantity</th>
              <th className="px-4 py-3">Units</th>
              <th className="px-4 py-3">Barcode</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>

          <tbody>
            {rows.map((item) => (
              <tr
                key={item.id}
                className={`border-t border-border/60 ${selected === item.id ? "bg-muted/40" : ""}`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="flex items-center gap-3 text-left hover:text-primary"
                      aria-label={`Show details for ${item.name}`}
                      onClick={() => {
                        const next = selected === item.id ? null : item.id;
                        setSelected(next);
                        if (next)
                          setTimeout(
                            () =>
                              document
                                .querySelector('[data-testid="item-details"]')
                                ?.scrollIntoView({ behavior: "smooth", block: "start" }),
                            50,
                          );
                      }}
                    >
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt=""
                          className="size-10 shrink-0 rounded-md border border-border object-cover"
                        />
                      ) : (
                        <span className="grid size-10 shrink-0 place-items-center rounded-md border border-dashed border-border text-muted-foreground">
                          <ImageIcon className="size-4" />
                        </span>
                      )}
                      <span>
                        <span className="block font-medium underline-offset-2 hover:underline">
                          {item.name}
                        </span>
                        {item.comment ? (
                          <span className="block max-w-[220px] truncate text-xs text-muted-foreground">
                            {item.comment}
                          </span>
                        ) : null}
                      </span>
                    </button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      aria-label={`Rename ${item.name}`}
                      onClick={() => setRenaming(item)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {(() => {
                    const itemUnits = units.filter((u) => u.equipment_id === item.id);
                    if (item.tracking === "serialized" || itemUnits.length > 0) {
                      if (itemUnits.length === 0) {
                        return (
                          <p className="whitespace-nowrap text-xs text-muted-foreground">
                            No units yet
                          </p>
                        );
                      }
                      return (
                        <>
                          <p className="whitespace-nowrap font-mono text-xs font-semibold">
                            {itemUnits[0]?.serial_code}
                          </p>
                          {itemUnits.length > 1 && (
                            <p className="whitespace-nowrap text-[11px] text-muted-foreground">
                              … {itemUnits[itemUnits.length - 1]?.serial_code} ({itemUnits.length}{" "}
                              units)
                            </p>
                          )}
                        </>
                      );
                    }
                    return (
                      <p className="whitespace-nowrap font-mono text-xs font-semibold">
                        {item.serial_code}
                      </p>
                    );
                  })()}
                  {item.legacy_barcode && (
                    <p
                      className="whitespace-nowrap font-mono text-[11px] text-muted-foreground"
                      title="Code on labels printed before the S/N change"
                    >
                      Old: {item.legacy_barcode}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                    {item.category}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <select
                    className="h-8 rounded-md border border-border bg-background px-2 text-sm"
                    value={item.tracking}
                    onChange={(e) =>
                      updateEquipment.mutate({ id: item.id, patch: { tracking: e.target.value } })
                    }
                  >
                    <option value="bulk">Bulk quantity</option>
                    <option value="serialized">Serialized units</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  {item.tracking === "serialized" ? (
                    <span
                      className="tabular-nums"
                      title="Counted from units in stock or with a customer"
                    >
                      {countedUnits(item.id)}
                    </span>
                  ) : (
                    <Input
                      type="number"
                      min={0}
                      defaultValue={item.quantity}
                      className="w-20"
                      onBlur={(e) =>
                        updateEquipment.mutate({
                          id: item.id,
                          patch: { quantity: Number(e.target.value) || 0 },
                        })
                      }
                    />
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{unitCount(item.id)} pcs</td>
                <td className="px-4 py-3">
                  {item.tracking === "serialized" ? (
                    <span
                      className="whitespace-nowrap text-xs text-muted-foreground"
                      title="Each unit's label carries its own S/N as barcode"
                    >
                      On each unit
                    </span>
                  ) : (
                    <button
                      className="flex items-center gap-2 whitespace-nowrap font-mono text-xs text-primary"
                      onClick={() =>
                        setDialog({
                          kind: "equipment",
                          id: item.id,
                          title: item.name,
                          subtitle: item.sku ?? undefined,
                          value: item.barcode ?? "",
                          type: (item.barcode_type as BarcodeType) ?? "code128",
                        })
                      }
                    >
                      <Barcode className="size-4" />
                      {item.barcode ?? "Add barcode"}
                    </button>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={`Print label for ${item.name}`}
                      onClick={() => printProductLabels(item)}
                    >
                      <Printer className="size-4" /> Print label
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelected(selected === item.id ? null : item.id)}
                    >
                      Units
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-9 text-destructive hover:text-destructive"
                      aria-label={`Delete ${item.name}`}
                      onClick={() => setConfirmDelete({ kind: "item", item })}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {current ? (
        <div className="rounded-2xl border border-border bg-card p-6">
          <div
            className="mb-5 flex flex-wrap items-start gap-4 border-b border-border pb-5"
            data-testid="item-details"
          >
            {current.image_url ? (
              <img
                src={current.image_url}
                alt={current.name}
                className="size-24 rounded-xl border border-border object-cover"
              />
            ) : (
              <div className="grid size-24 place-items-center rounded-xl border border-dashed border-border text-muted-foreground">
                <ImageIcon className="size-6" />
              </div>
            )}
            <div className="grid min-w-0 flex-1 gap-1 text-sm">
              <p className="text-xl font-bold">{current.name}</p>
              <p className="text-muted-foreground">
                {orgName(current.organization_id)} · {current.category} · Product code{" "}
                <span className="font-mono">{current.serial_code}</span>
              </p>
              <p className={current.comment ? "whitespace-pre-wrap" : "text-muted-foreground"}>
                {current.comment || "No comment"}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setItemDialog({ edit: current })}>
              <Pencil className="size-4" /> Edit image & comment
            </Button>
          </div>
          {(() => {
            const ids = units.filter((u) => u.equipment_id === current.id).map((u) => u.id);
            const all = ids.length > 0 && ids.every((id) => picked.has(id));
            return (
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-lg font-bold">Units · {current.name}</h2>
                <span className="text-sm text-muted-foreground">
                  {ids.length} unit{ids.length === 1 ? "" : "s"}
                </span>
                {ids.length > 0 && (
                  <>
                    <label className="ml-auto flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={all}
                        onChange={() => setPicked(all ? new Set() : new Set(ids))}
                      />
                      Select all
                    </label>
                    <Button
                      size="sm"
                      disabled={picked.size === 0}
                      onClick={() => setPrintJob({ itemId: current.id, directIds: [...picked] })}
                    >
                      <Printer className="size-4" /> Print selected ({picked.size})
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      disabled={picked.size === 0}
                      onClick={() =>
                        setConfirmDelete({
                          kind: "units",
                          ids: [...picked],
                          label: `${picked.size} unit${picked.size === 1 ? "" : "s"} of ${current.name}`,
                        })
                      }
                    >
                      <Trash2 className="size-4" /> Delete selected ({picked.size})
                    </Button>
                  </>
                )}
              </div>
            );
          })()}
          <div className="mt-4 grid gap-2">
            {units
              .filter((u) => u.equipment_id === current.id)
              .map((unit) => (
                <div
                  key={unit.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3"
                >
                  <input
                    type="checkbox"
                    aria-label={`Select ${unit.serial_code}`}
                    checked={picked.has(unit.id)}
                    onChange={() =>
                      setPicked((prev) => {
                        const next = new Set(prev);
                        if (next.has(unit.id)) next.delete(unit.id);
                        else next.add(unit.id);
                        return next;
                      })
                    }
                  />
                  <span className="min-w-40 font-mono text-sm">
                    S/N: {unit.serial_code}
                    <span className="block text-[11px] text-muted-foreground">
                      Nr: {unit.unit_number}
                    </span>
                    {reprintIds.has(unit.id) ? (
                      <span className="mt-0.5 block text-[11px] font-semibold text-destructive">
                        Label shows old S/N — reprint
                      </span>
                    ) : null}
                  </span>
                  <select
                    className="h-8 rounded-md border border-border bg-background px-2 text-sm"
                    value={unit.status}
                    onChange={(e) =>
                      updateUnit.mutate({ id: unit.id, patch: { status: e.target.value } })
                    }
                  >
                    {Object.entries(STOCK_STATUS_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <Input
                    defaultValue={unit.notes ?? ""}
                    placeholder="Note"
                    className="max-w-xs"
                    onBlur={(e) =>
                      updateUnit.mutate({ id: unit.id, patch: { notes: e.target.value } })
                    }
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setDialog({
                        kind: "unit",
                        id: unit.id,
                        title: current.name,
                        subtitle: `S/N: ${unit.serial_code}`,
                        value: unit.barcode ?? "",
                        type: (unit.barcode_type as BarcodeType) ?? "code128",
                      })
                    }
                  >
                    <Barcode className="size-4" />
                    <span className="font-mono text-xs">{unit.barcode ?? "Add barcode"}</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`Print label for ${unit.serial_code}`}
                    onClick={() => setPrintJob({ itemId: current.id, directIds: [unit.id] })}
                  >
                    <Printer className="size-4" /> Print
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto text-destructive hover:text-destructive"
                    aria-label={`Delete unit ${unit.serial_code}`}
                    onClick={() =>
                      setConfirmDelete({
                        kind: "units",
                        ids: [unit.id],
                        label: `unit ${unit.serial_code}`,
                      })
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            {unitCount(current.id) === 0 && (
              <p className="rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">
                No units registered yet.
                {current.tracking === "bulk" && current.quantity > 0
                  ? ` The stock of ${current.quantity} is a bulk count – convert it to get ${current.quantity} units with their own S/N.`
                  : ""}
              </p>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <p className="w-full text-sm text-muted-foreground">
              Each new unit gets its own S/N: the organization's next free number, then the next
              unit number for this item.
            </p>
            <label className="grid gap-1.5 text-sm font-medium">
              Units to add
              <Input
                type="number"
                min={1}
                max={100}
                className="h-9 w-24 font-normal"
                value={unitsToAdd}
                onChange={(e) =>
                  setUnitsToAdd(Math.max(1, Math.min(100, Math.floor(Number(e.target.value) || 1))))
                }
              />
            </label>
            <Button
              disabled={addUnit.isPending || !isAdmin}
              onClick={() => addUnit.mutate({ equipmentId: current.id, count: unitsToAdd })}
            >
              <Plus className="size-4" /> Add {unitsToAdd} unit{unitsToAdd === 1 ? "" : "s"}
            </Button>
            {current.tracking === "bulk" && current.quantity > 0 && (
              <Button variant="outline" onClick={() => setConversion({ focusId: current.id })}>
                <Shuffle className="size-4" /> Convert stock to units
              </Button>
            )}
          </div>
        </div>
      ) : null}

      {printJob && (printItem || printJob.directIds?.length) ? (
        <UnitPrintDialog
          key={`${printJob.itemId}-${printJob.directIds?.join(",") ?? ""}`}
          item={printItem}
          items={itemNames}
          units={units}
          directIds={printJob.directIds}
          canEdit={Boolean(isAdmin)}
          onClose={() => setPrintJob(null)}
          onConvert={() => {
            setPrintJob(null);
            if (printItem) setConversion({ focusId: printItem.id });
          }}
          onAddUnit={() => {
            setPrintJob(null);
            if (printItem) setSelected(printItem.id);
          }}
          onRecorded={invalidate}
        />
      ) : null}

      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDelete?.kind === "item"
                ? `Delete ${confirmDelete.item.name}?`
                : `Delete ${confirmDelete?.label ?? ""}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.kind === "item"
                ? `The item, its image and comment, its price rules and all ${unitCount(confirmDelete.item.id)} unit(s) are removed for good. `
                : "The unit is removed for good. "}
              Its S/N codes are never given out again. Units that have been out on rent can't be
              deleted – set them to Retired instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={removeUnits.isPending || removeItem.isPending}
              onClick={() => {
                if (!confirmDelete) return;
                if (confirmDelete.kind === "item") removeItem.mutate(confirmDelete.item);
                else removeUnits.mutate(confirmDelete.ids);
              }}
            >
              <Trash2 className="size-4" /> Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {conversion ? (
        <StockConversionDialog
          focusId={conversion.focusId}
          canRun={Boolean(isAdmin)}
          onClose={() => setConversion(null)}
          onConverted={() => {
            invalidate();
            queryClient.invalidateQueries({ queryKey: ["units"] });
          }}
        />
      ) : null}

      {repairOpen ? (
        <SerialRepairDialog
          canApply={Boolean(isAdmin)}
          onClose={() => setRepairOpen(false)}
          onApplied={() => {
            invalidate();
            queryClient.invalidateQueries({ queryKey: ["units"] });
          }}
          onPrint={(ids) => {
            setRepairOpen(false);
            const owners = new Set(
              units.filter((u) => ids.includes(u.id)).map((u) => u.equipment_id),
            );
            setPrintJob({ itemId: owners.size === 1 ? [...owners][0]! : null, directIds: ids });
          }}
        />
      ) : null}

      {itemDialog ? (
        <ItemDetailsDialog
          item={itemDialog.edit ?? undefined}
          categories={categories}
          onClose={() => setItemDialog(null)}
          onSaved={(id) => {
            setItemDialog(null);
            invalidate();
            queryClient.invalidateQueries({ queryKey: ["equipment"] });
            queryClient.invalidateQueries({ queryKey: ["organizations", "counts"] });
            if (!itemDialog.edit) setSearch("");
            setSelectedRaw(id);
          }}
        />
      ) : null}

      {renaming ? (
        <RenameDialog
          item={renaming}
          printedLabels={
            renaming.label_print_count +
            units
              .filter((u) => u.equipment_id === renaming.id)
              .reduce((n, u) => n + u.label_print_count, 0)
          }
          labelledUnits={
            units.filter((u) => u.equipment_id === renaming.id && u.label_print_count > 0).length
          }
          onClose={() => setRenaming(null)}
          onSaved={(item) => {
            setRenaming(null);
            invalidate();
            queryClient.invalidateQueries({ queryKey: ["equipment"] });
            queryClient.invalidateQueries({ queryKey: ["units"] });
            if (item) printProductLabels(item);
          }}
        />
      ) : null}

      {dialog ? (
        <BarcodeDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          title={dialog.title}
          subtitle={dialog.subtitle}
          value={dialog.value}
          type={dialog.type}
          onSave={(value, type) => saveBarcode.mutate({ target: dialog, value, type })}
          onDelete={() => saveBarcode.mutate({ target: dialog, value: null, type: dialog.type })}
        />
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-border bg-card p-4">
        <h2 className="text-lg font-bold">Availability for the next {DAYS} days</h2>
        <table className="mt-4 w-full text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="px-2 py-1 text-left">Item</th>
              {days.map((day) => (
                <th key={day} className="px-2 py-1">
                  {day.slice(5)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {equipment.map((item) => (
              <tr key={item.id} className="border-t border-border/60">
                <td className="px-2 py-1 text-left">{item.name}</td>
                {(calendar[item.id] ?? days.map(() => 0)).map((value, index) => (
                  <td
                    key={index}
                    className={`px-2 py-1 text-center font-medium ${
                      value === 0 ? "bg-destructive/10 text-destructive" : "text-foreground"
                    }`}
                  >
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Renames a product; warns when labels with the old name have already been printed. */
function RenameDialog({
  item,
  printedLabels,
  labelledUnits,
  onClose,
  onSaved,
}: {
  item: EquipmentRow;
  printedLabels: number;
  labelledUnits: number;
  onClose: () => void;
  /** Called with the renamed item when the user wants to reprint labels. */
  onSaved: (reprint: EquipmentRow | null) => void;
}) {
  const [name, setName] = useState(item.name);
  const [acknowledged, setAcknowledged] = useState(false);
  const trimmed = name.replace(/\s+/g, " ").trim();
  const changed = trimmed !== item.name;
  const needsAck = printedLabels > 0;

  const save = useMutation({
    mutationFn: async (reprint: boolean) => {
      const { error } = await supabase
        .from("equipment")
        .update({ name: trimmed })
        .eq("id", item.id);
      if (error) throw error;
      return reprint;
    },
    onSuccess: (reprint) => {
      toast.success(`Renamed to ${trimmed}`);
      onSaved(reprint ? { ...item, name: trimmed } : null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const disabled = !trimmed || !changed || (needsAck && !acknowledged) || save.isPending;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename item</DialogTitle>
          <DialogDescription>
            The S/N and QR codes stay the same — only the printed name changes.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="rename-item">Name</Label>
          <Input
            id="rename-item"
            value={name}
            maxLength={160}
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        {needsAck ? (
          <div
            role="alert"
            className="grid gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
          >
            <p className="flex gap-2 font-medium">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              {printedLabels} label{printedLabels === 1 ? " has" : "s have"} already been printed
              with the name “{item.name}”
              {labelledUnits ? ` (${labelledUnits} unit${labelledUnits === 1 ? "" : "s"})` : ""}.
            </p>
            <p className="text-muted-foreground">
              Printed labels won't update. They still scan correctly, but will show the old name
              until you reprint them.
            </p>
            <label className="flex items-center gap-2">
              <Checkbox
                checked={acknowledged}
                onCheckedChange={(v) => setAcknowledged(v === true)}
              />
              I understand the printed labels will show the old name
            </label>
          </div>
        ) : null}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {needsAck ? (
            <Button variant="outline" disabled={disabled} onClick={() => save.mutate(true)}>
              <Printer className="size-4" /> Rename & reprint
            </Button>
          ) : null}
          <Button disabled={disabled} onClick={() => save.mutate(false)}>
            Rename
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
