import { unitErrorMessage } from "@/lib/units";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Printer } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CSV_TEMPLATE,
  batchName,
  importCreationOrder,
  parseCsv,
  planImportGroups,
  validateImport,
  type ImportProduct,
} from "@/lib/units";

type Created = {
  id: string;
  serial_code: string;
  unit_number: string;
  serial_number: string | null;
  product: string;
};

export function UnitImportDialog({
  products,
  units,
  onClose,
  onCreated,
  onPrint,
}: {
  products: ImportProduct[];
  units: { equipment_id: string; serial_number: string | null }[];
  onClose: () => void;
  onCreated: () => void;
  onPrint: (ids: string[], batch?: string | null) => void;
}) {
  const [text, setText] = useState("");
  const [skipErrors, setSkipErrors] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<{
    batch: string;
    created: Created[];
    failures: string[];
  } | null>(null);

  const existingSerials = useMemo(
    () =>
      new Set(
        units
          .filter((u) => u.serial_number)
          .map((u) => `${u.equipment_id}|${u.serial_number!.toLowerCase()}`),
      ),
    [units],
  );

  const validation = useMemo(
    () => (text.trim() ? validateImport(parseCsv(text), products, existingSerials) : null),
    [text, products, existingSerials],
  );

  const rows = validation?.rows ?? [];
  const errorRows = rows.filter((r) => r.errors.length > 0);
  const validRows = rows.filter((r) => r.errors.length === 0);
  const blocked =
    !validation ||
    validation.globalErrors.length > 0 ||
    validRows.length === 0 ||
    (errorRows.length > 0 && !skipErrors);

  // Non-binding S/N preview in the exact order create_units will issue them; nothing is reserved.
  const order = useMemo(() => importCreationOrder(planImportGroups(validRows)), [validRows]);
  const { data: predicted } = useQuery({
    queryKey: ["serial-preview", order.map((o) => o.equipmentId).join(",")],
    enabled: order.length > 0 && !result,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("preview_serial_codes", {
        _equipment_ids: order.map((o) => o.equipmentId),
      });
      if (error) throw error;
      return new Map(order.map((o, i) => [o.line, (data ?? [])[i] ?? null]));
    },
  });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2_000_000) {
      toast.error("The file is larger than 2 MB.");
      return;
    }
    setText(await file.text());
  };

  const downloadTemplate = () => {
    const blob = new Blob(["\uFEFF" + CSV_TEMPLATE + "\n"], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "units-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const commit = async () => {
    if (blocked) return;
    setCommitting(true);
    const batch = batchName("import");
    const created: Created[] = [];
    const failures: string[] = [];
    const notes: { id: string; note: string }[] = [];

    for (const group of planImportGroups(validRows)) {
      const { data, error } = await supabase.rpc("create_units", {
        _equipment_id: group.product.id,
        _count: group.rows.length,
        _batch: batch,
        ...(group.withSerials ? { _serials: group.rows.map((r) => r.serial) } : {}),
        ...(group.location ? { _location: group.location } : {}),
      });
      if (error) {
        failures.push(
          `${group.product.name}${group.location ? ` (${group.location})` : ""}: ${unitErrorMessage(error.message)} — lines ${group.rows
            .map((r) => r.line)
            .join(", ")}`,
        );
        continue;
      }
      const made = data ?? [];
      // Map created units back to file rows: by serial when present, else in order.
      const bySerial = new Map(made.map((m) => [(m.serial_number ?? "").toLowerCase(), m]));
      group.rows.forEach((row, index) => {
        const unit = group.withSerials ? bySerial.get(row.serial.toLowerCase()) : made[index];
        if (!unit) return;
        created.push({
          id: unit.id,
          serial_code: unit.serial_code,
          unit_number: unit.unit_number,
          serial_number: unit.serial_number,
          product: group.product.name,
        });
        if (row.note) notes.push({ id: unit.id, note: row.note });
      });
    }

    for (let i = 0; i < notes.length; i += 20) {
      const chunk = notes.slice(i, i + 20);
      const results = await Promise.all(
        chunk.map((n) => supabase.from("stock_items").update({ notes: n.note }).eq("id", n.id)),
      );
      results.forEach((r, j) => {
        if (r.error) failures.push(`Note for ${chunk[j]?.id}: ${r.error.message}`);
      });
    }

    setResult({ batch, created, failures });
    setCommitting(false);
    if (created.length) {
      toast.success(`${created.length} unit${created.length === 1 ? "" : "s"} imported`);
      onCreated();
    }
    if (failures.length) toast.error("Some rows could not be imported");
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !committing && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Import units from CSV</DialogTitle>
          <DialogDescription>
            Columns: product (SKU, exact name or id), serial (manufacturer S/N, optional), location,
            note. Comma or semicolon separated, with a header row. Max 1000 rows.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="grid gap-4">
            <p className="text-sm">
              Batch <span className="font-mono">{result.batch}</span>: created{" "}
              {result.created.length} unit
              {result.created.length === 1 ? "" : "s"}.
            </p>
            {result.created.length > 0 && (
              <div className="max-h-60 overflow-y-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted text-left text-xs uppercase tracking-widest text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">S/N (final)</th>
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2">Manufacturer S/N</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.created.map((c) => (
                      <tr key={c.id} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-1.5 font-mono font-medium">{c.serial_code}</td>
                        <td className="px-3 py-1.5">{c.product}</td>
                        <td className="px-3 py-1.5 font-mono text-xs">{c.serial_number ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {result.failures.length > 0 && (
              <div
                role="alert"
                className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm"
              >
                <p className="font-medium text-destructive">Not imported</p>
                <ul className="mt-1 list-disc pl-5">
                  {result.failures.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Done
              </Button>
              <Button
                disabled={result.created.length === 0}
                onClick={() =>
                  onPrint(
                    result.created.map((c) => c.id),
                    result.batch,
                  )
                }
              >
                <Printer className="size-4" /> Print labels for this batch
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid gap-2">
                <Label htmlFor="csv-file">Upload a .csv file</Label>
                <input
                  id="csv-file"
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:text-secondary-foreground"
                  onChange={(e) => void onFile(e.target.files?.[0])}
                />
              </div>
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="size-4" /> Example CSV
              </Button>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="csv-text">…or paste the rows</Label>
              <Textarea
                id="csv-text"
                rows={6}
                className="font-mono text-xs"
                placeholder={CSV_TEMPLATE}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>

            {validation && (
              <>
                {validation.globalErrors.map((e) => (
                  <p key={e} role="alert" className="text-sm font-medium text-destructive">
                    {e}
                  </p>
                ))}
                <p className="text-sm text-muted-foreground">
                  {rows.length} row{rows.length === 1 ? "" : "s"} · {validRows.length} ready ·{" "}
                  <span className={errorRows.length ? "text-destructive" : ""}>
                    {errorRows.length} with errors
                  </span>
                  {!validation.hasHeader && " · no header row found, columns read in order"}
                </p>
                <div className="max-h-72 overflow-auto rounded-xl border border-border">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead className="sticky top-0 bg-muted text-left text-xs uppercase tracking-widest text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">Line</th>
                        <th className="px-3 py-2">S/N (preview)</th>
                        <th className="px-3 py-2">Product</th>
                        <th className="px-3 py-2">Manufacturer S/N</th>
                        <th className="px-3 py-2">Location</th>
                        <th className="px-3 py-2">Note</th>
                        <th className="px-3 py-2">Check</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 1000).map((r) => (
                        <tr
                          key={r.line}
                          className={`border-t border-border/60 align-top ${r.errors.length ? "bg-destructive/5" : ""}`}
                        >
                          <td className="px-3 py-1.5 text-muted-foreground">{r.line}</td>
                          <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">
                            {r.errors.length ? "—" : (predicted?.get(r.line) ?? "…")}
                          </td>
                          <td className="px-3 py-1.5">{r.product?.name ?? r.productInput}</td>
                          <td className="px-3 py-1.5 font-mono text-xs">{r.serial || "—"}</td>
                          <td className="px-3 py-1.5">{r.location || "—"}</td>
                          <td className="max-w-48 truncate px-3 py-1.5">{r.note || "—"}</td>
                          <td className="px-3 py-1.5">
                            {r.errors.length ? (
                              <ul className="text-xs text-destructive">
                                {r.errors.map((e) => (
                                  <li key={e}>{e}</li>
                                ))}
                              </ul>
                            ) : (
                              <span className="text-xs text-primary">OK</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {validRows.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    S/N codes above are a preview — the final code is assigned on save and can
                    differ if other items are registered in the meantime.
                  </p>
                )}
                {errorRows.length > 0 && (
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={skipErrors}
                      onCheckedChange={(v) => setSkipErrors(v === true)}
                    />
                    Skip the {errorRows.length} row{errorRows.length === 1 ? "" : "s"} with errors
                    and import the rest
                  </label>
                )}
              </>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={committing}>
                Cancel
              </Button>
              <Button onClick={() => void commit()} disabled={blocked || committing}>
                {committing
                  ? "Importing…"
                  : `Import ${validRows.length} unit${validRows.length === 1 ? "" : "s"}`}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
