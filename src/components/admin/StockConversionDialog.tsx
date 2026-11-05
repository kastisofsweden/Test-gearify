import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Shuffle } from "lucide-react";
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
import { unitErrorMessage } from "@/lib/units";

export type ConversionPlan = {
  equipment_id: string;
  name: string;
  category: string;
  item_kind: string;
  tracking: string;
  quantity: number;
  product_code: string;
  units_total: number;
  units_counted: number;
  to_create: number;
  status: "convert" | "done" | "skip" | "conflict";
  note: string | null;
  next_codes: (string | null)[];
};

const STATUS_TEXT: Record<ConversionPlan["status"], string> = {
  convert: "Ready to convert",
  done: "Units",
  skip: "Nothing to convert",
  conflict: "Check first",
};

/** Preview and run the bulk-stock → individual-units conversion (server-side, idempotent). */
export function StockConversionDialog({
  focusId,
  canRun,
  onClose,
  onConverted,
}: {
  focusId?: string | null;
  canRun: boolean;
  onClose: () => void;
  onConverted: () => void;
}) {
  const preview = useQuery({
    queryKey: ["stock-conversion-preview"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("stock_conversion_preview");
      if (error) throw error;
      return (data ?? []) as unknown as ConversionPlan[];
    },
  });
  const plans = useMemo(() => preview.data ?? [], [preview.data]);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const convertible = useMemo(() => plans.filter((p) => p.status === "convert"), [plans]);
  // Default selection: the item the dialog was opened from, otherwise every convertible item.
  useEffect(() => {
    if (picked || !preview.data) return;
    const ids = convertible
      .filter((p) => !focusId || p.equipment_id === focusId)
      .map((p) => p.equipment_id);
    setPicked(new Set(ids));
  }, [preview.data, convertible, focusId, picked]);

  const selected = picked ?? new Set<string>();
  const chosen = convertible.filter((p) => selected.has(p.equipment_id));
  const unitsToCreate = chosen.reduce((n, p) => n + p.to_create, 0);
  const visible = showAll ? plans : plans.filter((p) => p.status !== "skip");

  const run = useMutation({
    mutationFn: async (ids: string[]) => {
      const { data, error } = await supabase.rpc("convert_stock_to_units", { _equipment_ids: ids });
      if (error) throw error;
      return (data ?? []) as unknown as (ConversionPlan & {
        result: string;
        created_codes: string[];
      })[];
    },
    onSuccess: (rows) => {
      const created = rows.reduce((n, r) => n + (r.created_codes?.length ?? 0), 0);
      const items = rows.filter((r) => r.result === "converted").length;
      toast.success(
        `Converted ${items} item${items === 1 ? "" : "s"} · ${created} unit${created === 1 ? "" : "s"} created`,
      );
      setConfirming(false);
      setPicked(null);
      onConverted();
      void preview.refetch();
    },
    onError: (error: Error) => toast.error(unitErrorMessage(error.message)),
  });

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Convert stock to units</DialogTitle>
          <DialogDescription>
            Items counted as a bulk quantity become that many individual units, each with its own
            S/N under the same item. The stock, bookings and history stay as they are, and running
            it again never creates duplicates.
          </DialogDescription>
        </DialogHeader>

        {preview.isLoading ? (
          <p className="text-sm text-muted-foreground">Checking stock…</p>
        ) : preview.error ? (
          <p className="text-sm text-destructive">{(preview.error as Error).message}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[720px] text-sm" data-testid="conversion-table">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="w-8 px-3 py-2" />
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2 text-right">Stock</th>
                  <th className="px-3 py-2 text-right">Existing units</th>
                  <th className="px-3 py-2 text-right">To create</th>
                  <th className="px-3 py-2">New S/N</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p) => {
                  const codes = p.next_codes.filter((c): c is string => Boolean(c));
                  return (
                    <tr key={p.equipment_id} className="border-t border-border/60 align-top">
                      <td className="px-3 py-2">
                        {p.status === "convert" && (
                          <Checkbox
                            aria-label={`Convert ${p.name}`}
                            checked={selected.has(p.equipment_id)}
                            onCheckedChange={() => toggle(p.equipment_id)}
                            disabled={!canRun}
                          />
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-medium">{p.name}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">
                          Product code {p.product_code}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {p.item_kind === "rental"
                          ? p.tracking === "serialized"
                            ? p.units_counted
                            : p.quantity
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {p.units_counted}
                        {p.units_total > p.units_counted
                          ? ` (+${p.units_total - p.units_counted})`
                          : ""}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">
                        {p.to_create || "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {codes.length === 0 ? (
                          "—"
                        ) : codes.length === 1 ? (
                          codes[0]
                        ) : (
                          <details>
                            <summary className="cursor-pointer">
                              {codes[0]} … {codes[codes.length - 1]}
                            </summary>
                            <p className="mt-1 whitespace-normal break-words">{codes.join(", ")}</p>
                          </details>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <span
                          className={`inline-flex items-center gap-1 font-medium ${
                            p.status === "conflict"
                              ? "text-destructive"
                              : p.status === "done"
                                ? "text-primary"
                                : ""
                          }`}
                        >
                          {p.status === "conflict" && <AlertTriangle className="size-3.5" />}
                          {p.status === "done" && <CheckCircle2 className="size-3.5" />}
                          {STATUS_TEXT[p.status]}
                        </span>
                        {p.note && <p className="mt-0.5 text-muted-foreground">{p.note}</p>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={showAll} onCheckedChange={(v) => setShowAll(v === true)} />
          Also show packages, services and empty stock (never converted)
        </label>

        {confirming && (
          <p role="alert" className="rounded-lg border border-border bg-muted/50 p-3 text-sm">
            This creates <strong>{unitsToCreate}</strong> unit{unitsToCreate === 1 ? "" : "s"} for{" "}
            {chosen.length} item
            {chosen.length === 1 ? "" : "s"}. S/N numbers are permanent and never reused.
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {!canRun ? (
            <span className="self-center text-sm text-muted-foreground">
              Only admins can run the conversion.
            </span>
          ) : confirming ? (
            <Button
              disabled={run.isPending}
              onClick={() => run.mutate(chosen.map((p) => p.equipment_id))}
            >
              <Shuffle className="size-4" /> Yes, create {unitsToCreate} unit
              {unitsToCreate === 1 ? "" : "s"}
            </Button>
          ) : (
            <Button disabled={chosen.length === 0} onClick={() => setConfirming(true)}>
              <Shuffle className="size-4" /> Convert {chosen.length} item
              {chosen.length === 1 ? "" : "s"} · {unitsToCreate} unit
              {unitsToCreate === 1 ? "" : "s"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
