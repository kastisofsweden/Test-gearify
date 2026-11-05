import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  MOVEMENT_LABEL,
  REPORTER_ROLE_LABEL,
  UNIT_STATUS_LABEL,
  formatDateTime,
} from "@/lib/units";

type HistoryEntry =
  | {
      kind: "movement";
      id: string;
      at: string;
      action: string;
      from: string | null;
      to: string | null;
      forced: boolean;
      reference: string | null;
      note: string | null;
      order: string | null;
    }
  | {
      kind: "report";
      id: string;
      at: string;
      type: string;
      role: string;
      message: string;
      status: string;
      reporter: string | null;
      adminNote: string | null;
    };

export function UnitHistorySheet({
  unitId,
  onOpenChange,
}: {
  unitId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["unit-history", unitId],
    enabled: Boolean(unitId),
    queryFn: async () => {
      const id = unitId!;
      const [unit, movements, reports] = await Promise.all([
        supabase
          .from("stock_items")
          .select("unit_number, serial_code, status, serial_number, equipment(name)")
          .eq("id", id)
          .maybeSingle(),
        supabase
          .from("unit_movements")
          .select(
            "id, action, from_status, to_status, forced, reference, note, performed_at, orders(order_number)",
          )
          .eq("stock_item_id", id)
          .order("performed_at", { ascending: false }),
        supabase
          .from("unit_reports")
          .select(
            "id, report_type, reporter_role, message, status, reporter_name, reporter_phone, reporter_email, admin_note, created_at",
          )
          .eq("stock_item_id", id)
          .order("created_at", { ascending: false }),
      ]);
      if (unit.error) throw unit.error;
      if (movements.error) throw movements.error;
      if (reports.error) throw reports.error;

      const entries: HistoryEntry[] = [
        ...(movements.data ?? []).map((m) => ({
          kind: "movement" as const,
          id: m.id,
          at: m.performed_at,
          action: m.action,
          from: m.from_status,
          to: m.to_status,
          forced: m.forced,
          reference: m.reference,
          note: m.note,
          order: m.orders?.order_number ?? null,
        })),
        ...(reports.data ?? []).map((r) => ({
          kind: "report" as const,
          id: r.id,
          at: r.created_at,
          type: r.report_type,
          role: r.reporter_role,
          message: r.message,
          status: r.status,
          reporter:
            [r.reporter_name, r.reporter_phone, r.reporter_email].filter(Boolean).join(" · ") ||
            null,
          adminNote: r.admin_note,
        })),
      ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

      return { unit: unit.data, entries };
    },
  });

  return (
    <Sheet open={Boolean(unitId)} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="font-mono">{data?.unit?.serial_code ?? "Unit history"}</SheetTitle>
          <SheetDescription>
            {data?.unit
              ? `${data.unit.equipment?.name ?? "Unknown product"}${
                  data.unit.serial_number ? ` · Manufacturer S/N ${data.unit.serial_number}` : ""
                } · Nr ${data.unit.unit_number} · ${UNIT_STATUS_LABEL[data.unit.status] ?? data.unit.status}`
              : "Movements and reports, newest first."}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 grid gap-3">
          {isLoading && <p className="text-sm text-muted-foreground">Loading history…</p>}
          {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
          {data && data.entries.length === 0 && (
            <p className="text-sm text-muted-foreground">No movements or reports yet.</p>
          )}
          {data?.entries.map((entry) =>
            entry.kind === "movement" ? (
              <div key={`m-${entry.id}`} className="rounded-xl border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {MOVEMENT_LABEL[entry.action] ?? entry.action}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(entry.at)}</span>
                </div>
                <p className="mt-1 text-muted-foreground">
                  {entry.from ? `${UNIT_STATUS_LABEL[entry.from] ?? entry.from} → ` : ""}
                  {entry.to ? (UNIT_STATUS_LABEL[entry.to] ?? entry.to) : ""}
                  {entry.order ? ` · Order ${entry.order}` : ""}
                  {entry.reference ? ` · ${entry.reference}` : ""}
                </p>
                {entry.note ? <p className="mt-1">{entry.note}</p> : null}
                {entry.forced ? (
                  <Badge variant="destructive" className="mt-2">
                    Warning overridden
                  </Badge>
                ) : null}
              </div>
            ) : (
              <div
                key={`r-${entry.id}`}
                className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-medium">
                    {entry.type === "fault" ? "Fault report" : "Note"}
                    <Badge variant={entry.status === "new" ? "default" : "secondary"}>
                      {entry.status === "new" ? "New" : "Handled"}
                    </Badge>
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(entry.at)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap">{entry.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {REPORTER_ROLE_LABEL[entry.role] ?? entry.role}
                  {entry.reporter ? ` · ${entry.reporter}` : ""}
                </p>
                {entry.adminNote ? (
                  <p className="mt-2 rounded-lg bg-muted/60 p-2 text-xs">
                    Admin note: {entry.adminNote}
                  </p>
                ) : null}
              </div>
            ),
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
