import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Plus, Printer, Shuffle } from "lucide-react";
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
import { ProductLabelDialog } from "@/components/admin/ProductLabelDialog";
import { STOCK_STATUS_LABEL } from "@/lib/booking";
import { useLabelJobContext } from "@/components/admin/labelContext";
import { byRegistration, unitLabelInputs, unitsOfItem, unitsToPrint } from "@/lib/unitLabelJob";

export type PrintDialogUnit = {
  id: string;
  equipment_id: string;
  serial_code: string;
  qr_token: string;
  created_at: string;
  status: string;
  label_print_count: number;
};

export type PrintDialogItem = {
  id: string;
  name: string;
  category: string;
  quantity: number;
  tracking: string;
};

/**
 * Print labels for one item: pick one, several or all of its units by S/N, preview the single PDF
 * (one label per unit) and record the print. With `directIds` the picker is skipped.
 */
export function UnitPrintDialog({
  item,
  items,
  units,
  directIds,
  canEdit,
  onClose,
  onConvert,
  onAddUnit,
  onRecorded,
}: {
  /** The item whose units are offered. Omit (with `items` + `directIds`) to print units of several items. */
  item: PrintDialogItem | null;
  /** Name/category per item id, used for labels of units from several items. */
  items?: Record<string, { name: string; category: string }> | undefined;
  units: PrintDialogUnit[];
  directIds?: string[] | undefined;
  canEdit: boolean;
  onClose: () => void;
  onConvert: () => void;
  onAddUnit: () => void;
  onRecorded: () => void;
}) {
  const own = useMemo(
    () =>
      item
        ? unitsOfItem(units, item.id)
        : units.filter((u) => (directIds ?? []).includes(u.id)).sort(byRegistration),
    [units, item, directIds],
  );
  const [selected, setSelected] = useState<Set<string>>(() => new Set(directIds ?? []));
  const [step, setStep] = useState<"select" | "preview" | "confirm">(
    directIds?.length ? "preview" : "select",
  );

  const withItem = (list: PrintDialogUnit[]) =>
    list.map((u) => ({
      ...u,
      equipment:
        items?.[u.equipment_id] ?? (item ? { name: item.name, category: item.category } : null),
    }));
  const toPrint = useMemo(() => unitsToPrint(own, selected), [own, selected]);
  const ctx = useLabelJobContext();
  const labels = useMemo(
    () => (ctx.ready ? unitLabelInputs(withItem(toPrint), ctx) : []),
    [toPrint, ctx.ready, ctx.baseUrl, ctx.brandingFor], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const record = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data, error } = await supabase.rpc("record_label_print", { _unit_ids: ids });
      if (error) throw error;
      return Number(data ?? 0);
    },
    onSuccess: (count) => {
      toast.success(`Recorded ${count} printed label${count === 1 ? "" : "s"}`);
      onRecorded();
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allSelected = own.length > 0 && own.every((u) => selected.has(u.id));

  if (step === "preview" && labels.length) {
    return (
      <ProductLabelDialog
        labels={labels}
        fileName={`labels-${labels[0]?.barcodeValue ?? item?.name ?? "units"}${labels.length > 1 ? `-${labels.length}` : ""}`}
        onClose={() => (directIds?.length ? onClose() : setStep("select"))}
        onPrinted={() => setStep("confirm")}
      />
    );
  }

  if (step === "confirm") {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Did the labels print correctly?</DialogTitle>
            <DialogDescription>
              Yes records {toPrint.length} printed label{toPrint.length === 1 ? "" : "s"} on the
              selected units.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              No
            </Button>
            <Button
              onClick={() => record.mutate(toPrint.map((u) => u.id))}
              disabled={record.isPending}
            >
              Yes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Print labels · {item?.name ?? `${own.length} units`}</DialogTitle>
          <DialogDescription>
            One label per selected unit (62 × 30 mm), each with that unit's own S/N, QR code and
            Code 128.
          </DialogDescription>
        </DialogHeader>

        {own.length === 0 ? (
          <div
            className="grid gap-3 rounded-lg border border-border bg-muted/40 p-4 text-sm"
            data-testid="no-units"
          >
            <p className="font-medium">
              This item has no registered units yet, so there is no S/N to print.
            </p>
            <p className="text-muted-foreground">
              The code in the Product code column identifies the item, not a physical unit.{" "}
              {item?.tracking === "bulk" && item.quantity > 0
                ? `Convert the stock of ${item.quantity} into ${item.quantity} individual units – each gets its own S/N – or add units one by one.`
                : "Add units one by one; each gets its own S/N."}
            </p>
            <div className="flex flex-wrap gap-2">
              {item?.tracking === "bulk" && item.quantity > 0 && (
                <Button size="sm" onClick={onConvert}>
                  <Shuffle className="size-4" /> Convert stock to units
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={onAddUnit} disabled={!canEdit}>
                <Plus className="size-4" /> Add a unit
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-border">
            <div className="flex items-center justify-between gap-2 border-b border-border p-2 text-sm">
              <label className="flex items-center gap-2 px-1">
                <Checkbox
                  aria-label="Select all units"
                  checked={allSelected}
                  onCheckedChange={() =>
                    setSelected(allSelected ? new Set() : new Set(own.map((u) => u.id)))
                  }
                />
                Select all ({own.length})
              </label>
              <span className="text-muted-foreground">{toPrint.length} selected</span>
            </div>
            <ul
              className="max-h-[45vh] divide-y divide-border overflow-y-auto"
              data-testid="unit-print-list"
            >
              {own.map((u) => (
                <li key={u.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-secondary/60">
                    <Checkbox
                      aria-label={`Select ${u.serial_code}`}
                      checked={selected.has(u.id)}
                      onCheckedChange={() => toggle(u.id)}
                    />
                    <span className="flex-1 font-mono font-medium">{u.serial_code}</span>
                    <span className="text-xs text-muted-foreground">
                      {STOCK_STATUS_LABEL[u.status] ?? u.status} · printed {u.label_print_count}×
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {own.length > 0 && (
            <Button disabled={toPrint.length === 0} onClick={() => setStep("preview")}>
              <Printer className="size-4" /> Print {toPrint.length} label
              {toPrint.length === 1 ? "" : "s"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
