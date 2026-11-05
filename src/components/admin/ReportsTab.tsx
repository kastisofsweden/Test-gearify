import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UnitHistorySheet } from "@/components/admin/UnitHistorySheet";
import { REPORTER_ROLE_LABEL, formatDateTime } from "@/lib/units";

type ReportRow = {
  id: string;
  stock_item_id: string;
  report_type: string;
  reporter_role: string;
  message: string;
  reporter_name: string | null;
  reporter_phone: string | null;
  reporter_email: string | null;
  status: string;
  handled_at: string | null;
  admin_note: string | null;
  created_at: string;
  stock_items: {
    unit_number: string;
    serial_code: string;
    equipment: { name: string } | null;
  } | null;
};

export const NEW_REPORTS_QUERY_KEY = ["unit-reports-new-count"] as const;

export function ReportsTab() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("new");
  const [type, setType] = useState("");
  const [unit, setUnit] = useState("");
  const [historyId, setHistoryId] = useState<string | null>(null);

  const {
    data: reports = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["unit-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("unit_reports")
        .select(
          "id, stock_item_id, report_type, reporter_role, message, reporter_name, reporter_phone, reporter_email, status, handled_at, admin_note, created_at, stock_items(unit_number, serial_code, equipment(name))",
        )
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as ReportRow[];
    },
  });

  const filtered = useMemo(() => {
    const q = unit.trim().toLowerCase();
    return reports.filter((r) => {
      if (status && r.status !== status) return false;
      if (type && r.report_type !== type) return false;
      if (
        q &&
        ![r.stock_items?.serial_code, r.stock_items?.unit_number].some((v) =>
          (v ?? "").toLowerCase().includes(q),
        )
      )
        return false;
      return true;
    });
  }, [reports, status, type, unit]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["unit-reports"] });
    queryClient.invalidateQueries({ queryKey: NEW_REPORTS_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ["unit-history"] });
  };

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-3">
        <label className="grid gap-1.5 text-sm font-medium">
          Status
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All</option>
            <option value="new">New</option>
            <option value="handled">Handled</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Type
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm font-normal"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">All types</option>
            <option value="fault">Fault</option>
            <option value="note">Note</option>
          </select>
        </label>
        <div className="grid gap-1.5">
          <Label htmlFor="report-unit">Unit</Label>
          <Input
            id="report-unit"
            placeholder="RM-000123"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          />
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading reports…</p>}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}
      {!isLoading && filtered.length === 0 && (
        <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {reports.length === 0 ? "No reports yet." : "No reports match the filters."}
        </p>
      )}

      <div className="grid gap-3">
        {filtered.map((r) => (
          <ReportCard
            key={r.id}
            report={r}
            onOpenUnit={() => setHistoryId(r.stock_item_id)}
            onChanged={refresh}
          />
        ))}
      </div>

      <UnitHistorySheet unitId={historyId} onOpenChange={(open) => !open && setHistoryId(null)} />
    </div>
  );
}

function ReportCard({
  report,
  onOpenUnit,
  onChanged,
}: {
  report: ReportRow;
  onOpenUnit: () => void;
  onChanged: () => void;
}) {
  const [note, setNote] = useState(report.admin_note ?? "");
  const isNew = report.status === "new";

  const update = useMutation({
    mutationFn: async (nextStatus: "new" | "handled") => {
      const { error } = await supabase
        .from("unit_reports")
        .update({ status: nextStatus, admin_note: note.trim() || null })
        .eq("id", report.id);
      if (error) throw error;
      return nextStatus;
    },
    onSuccess: (nextStatus) => {
      toast.success(nextStatus === "handled" ? "Marked as handled" : "Report reopened");
      onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reporter = [report.reporter_name, report.reporter_phone, report.reporter_email].filter(
    Boolean,
  );

  return (
    <article className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={report.report_type === "fault" ? "destructive" : "secondary"}>
            {report.report_type === "fault" ? "Fault" : "Note"}
          </Badge>
          <Badge variant={isNew ? "default" : "outline"}>{isNew ? "New" : "Handled"}</Badge>
          <button
            type="button"
            onClick={onOpenUnit}
            className="font-mono text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {report.stock_items?.serial_code ?? report.stock_items?.unit_number ?? "Unknown unit"}
          </button>
          <span className="text-sm text-muted-foreground">
            {report.stock_items?.equipment?.name}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">{formatDateTime(report.created_at)}</span>
      </div>

      <p className="mt-3 whitespace-pre-wrap text-sm">{report.message}</p>
      <p className="mt-2 text-xs text-muted-foreground">
        {REPORTER_ROLE_LABEL[report.reporter_role] ?? report.reporter_role}
        {reporter.length ? ` · ${reporter.join(" · ")}` : ""}
        {report.handled_at ? ` · handled ${formatDateTime(report.handled_at)}` : ""}
      </p>

      <div className="mt-4 grid gap-2">
        <Label htmlFor={`note-${report.id}`}>Admin note</Label>
        <Textarea
          id={`note-${report.id}`}
          rows={2}
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What was done, who follows up…"
        />
        <div className="flex flex-wrap gap-2">
          {isNew ? (
            <Button size="sm" onClick={() => update.mutate("handled")} disabled={update.isPending}>
              Mark handled
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => update.mutate("new")}
              disabled={update.isPending}
            >
              Reopen
            </Button>
          )}
          {!isNew && note !== (report.admin_note ?? "") && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => update.mutate("handled")}
              disabled={update.isPending}
            >
              Save note
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
