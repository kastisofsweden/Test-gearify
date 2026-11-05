import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Printer } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { STOCK_STATUS_LABEL } from "@/lib/booking";

export type SerialRepairChange = {
  stock_item_id: string;
  equipment_id: string;
  equipment_name: string;
  status: string;
  old_code: string;
  new_code: string;
  item_no_kept: boolean;
  label_print_count: number;
  old_code_ambiguous: boolean;
};

export type SerialReprint = {
  stock_item_id: string;
  equipment_name: string;
  serial_code: string;
  old_code: string;
  label_print_count: number;
};

export type SerialRepairResult = {
  applied: boolean;
  units_total: number;
  to_change: number;
  ambiguous: number;
  changes: SerialRepairChange[];
  reprint: SerialReprint[];
};

export const SERIAL_REPAIR_QUERY_KEY = ["unit-serial-repair"];

export function useSerialRepairPreview(enabled = true) {
  return useQuery({
    queryKey: SERIAL_REPAIR_QUERY_KEY,
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("unit_serial_repair", { _apply: false });
      if (error) throw error;
      return data as unknown as SerialRepairResult;
    },
  });
}

/**
 * Preview and apply the S/N repair: units that share an organization number get new free numbers
 * (item number kept). Units are updated in place; old S/Ns keep scanning as aliases.
 */
export function SerialRepairDialog({
  canApply,
  onClose,
  onApplied,
  onPrint,
}: {
  canApply: boolean;
  onClose: () => void;
  onApplied: () => void;
  onPrint: (unitIds: string[]) => void;
}) {
  const { data, isLoading, refetch } = useSerialRepairPreview();

  const apply = useMutation({
    mutationFn: async () => {
      const { data: result, error } = await supabase.rpc("unit_serial_repair", { _apply: true });
      if (error) throw error;
      return result as unknown as SerialRepairResult;
    },
    onSuccess: (result) => {
      toast.success(`Updated ${result.to_change} S/N${result.to_change === 1 ? "" : "s"}`);
      onApplied();
      refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const changes = data?.changes ?? [];
  const reprint = data?.reprint ?? [];
  const byItem = changes.reduce<Record<string, SerialRepairChange[]>>((acc, c) => {
    (acc[c.equipment_name] ??= []).push(c);
    return acc;
  }, {});

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Fix unit S/Ns</DialogTitle>
          <DialogDescription>
            The first part of a unit's S/N (e.g. 007 in DCB007-AS002) must be unique within the
            organization. Units that share it get the next free number; the unit number within the
            item, the QR code, status, bookings and history stay the same. Old S/Ns keep scanning to
            the same unit.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? <p className="text-sm text-muted-foreground">Checking units…</p> : null}

        {data && changes.length === 0 ? (
          <p
            className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm"
            data-testid="repair-clean"
          >
            <CheckCircle2 className="size-4 text-primary" />
            All {data.units_total} units have a unique organization number. Nothing to change.
          </p>
        ) : null}

        {changes.length > 0 ? (
          <div className="grid gap-3" data-testid="repair-preview">
            <p className="text-sm">
              <strong>{changes.length}</strong> of {data?.units_total} units share an organization
              number and get a new S/N. The other units keep theirs.
              {data?.ambiguous
                ? ` ${data.ambiguous} old S/N${data.ambiguous === 1 ? " is" : "s are"} ambiguous and will be flagged for review instead of scanning.`
                : ""}
            </p>
            {Object.entries(byItem).map(([name, rows]) => (
              <div key={name} className="rounded-lg border border-border">
                <p className="border-b border-border px-3 py-2 text-sm font-medium">
                  {name} · {rows.length} unit{rows.length === 1 ? "" : "s"}
                </p>
                <ul className="max-h-56 divide-y divide-border overflow-y-auto text-sm">
                  {rows.map((c) => (
                    <li
                      key={c.stock_item_id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5"
                    >
                      <span className="font-mono text-muted-foreground line-through">
                        {c.old_code}
                      </span>
                      <span aria-hidden>→</span>
                      <span className="font-mono font-semibold">{c.new_code}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {STOCK_STATUS_LABEL[c.status] ?? c.status}
                        {c.label_print_count > 0
                          ? ` · label printed ${c.label_print_count}× — replace`
                          : ""}
                        {c.old_code_ambiguous ? " · old code needs review" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : null}

        {reprint.length > 0 ? (
          <div
            role="alert"
            className="grid gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"
            data-testid="repair-reprint"
          >
            <p className="flex gap-2 font-medium">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              {reprint.length} printed label{reprint.length === 1 ? " shows" : "s show"} an old S/N
              and should be replaced
            </p>
            <ul className="grid gap-0.5 font-mono text-xs">
              {reprint.map((r) => (
                <li key={r.stock_item_id}>
                  {r.equipment_name}: {r.old_code} → {r.serial_code}
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground">
              The old labels still scan to the right unit until you replace them.
            </p>
            <div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onPrint(reprint.map((r) => r.stock_item_id))}
              >
                <Printer className="size-4" /> Print replacement labels ({reprint.length})
              </Button>
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {changes.length > 0 ? (
            <Button disabled={!canApply || apply.isPending} onClick={() => apply.mutate()}>
              {apply.isPending
                ? "Updating…"
                : `Update ${changes.length} S/N${changes.length === 1 ? "" : "s"}`}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
