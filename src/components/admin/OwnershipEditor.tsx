import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOrganizations } from "@/components/admin/OrganizationsTab";
import { bpsToPercent, percentToBps, validateShares } from "@/lib/invoiceShares";

type Row = { organization_id: string; percent: string };

/** Co-owners of one item (shares sum to 100 %). No rows = 100 % the item's organization. */
export function OwnershipEditor({ equipmentId }: { equipmentId: string }) {
  const qc = useQueryClient();
  const { data: orgs = [] } = useOrganizations();
  const key = ["equipment-ownership", equipmentId];
  const { data: saved } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipment_ownership")
        .select("organization_id, share_bps")
        .eq("equipment_id", equipmentId)
        .order("share_bps", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    if (saved)
      setRows(
        saved.map((s) => ({
          organization_id: s.organization_id,
          percent: String(bpsToPercent(s.share_bps)),
        })),
      );
  }, [saved]);

  const shares = rows.map((r) => ({
    organization_id: r.organization_id,
    share_bps: percentToBps(Number(r.percent) || 0),
  }));
  const problem = validateShares(shares);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("set_equipment_ownership", {
        _equipment_id: equipmentId,
        _shares: shares,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ownership saved — applies to new bookings");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-2 rounded-xl border border-border p-3">
      <Label>Ownership shares</Label>
      <p className="text-xs text-muted-foreground">
        Leave empty for a single owner (the item&apos;s organization). Co-owners split the base
        rental; commission stays with the platform.
      </p>
      {rows.map((r, i) => (
        <div key={i} className="flex gap-2">
          <select
            aria-label="Owner organization"
            className="h-9 flex-1 rounded-md border border-input bg-background px-3 text-sm"
            value={r.organization_id}
            onChange={(e) =>
              setRows(rows.map((x, j) => (j === i ? { ...x, organization_id: e.target.value } : x)))
            }
          >
            <option value="">Pick organization…</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <Input
            className="w-24"
            type="number"
            min={0.01}
            max={100}
            step="0.01"
            aria-label="Share percent"
            value={r.percent}
            onChange={(e) =>
              setRows(rows.map((x, j) => (j === i ? { ...x, percent: e.target.value } : x)))
            }
          />
          <span className="self-center text-sm">%</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove owner"
            onClick={() => setRows(rows.filter((_, j) => j !== i))}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setRows([...rows, { organization_id: "", percent: "" }])}
        >
          <Plus className="size-4" /> Add owner
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!!problem || save.isPending}
          onClick={() => save.mutate()}
        >
          Save ownership
        </Button>
        {problem && <span className="text-xs text-destructive">{problem}</span>}
      </div>
    </div>
  );
}
