import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { selectClass, useStaff } from "@/components/admin/backofficeData";
import { formatSek } from "@/lib/rental";
import type { TransportBreakdown } from "@/lib/transportPricing";

/** Transport amount/breakdown and the responsible staff member of one order. */
export function OrderTransportPanel({ orderId }: { orderId: string }) {
  const qc = useQueryClient();
  const { data: staff = [] } = useStaff();
  const key = ["order-transport", orderId];
  const { data: order } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "responsible_staff_id, company_id, transport_amount, transport_status, transport_breakdown",
        )
        .eq("id", orderId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const setStaff = useMutation({
    mutationFn: async (staffId: string) => {
      const { error } = await supabase
        .from("orders")
        .update({ responsible_staff_id: staffId || null })
        .eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Responsible staff updated");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setAmount = useMutation({
    mutationFn: async (amount: number | null) => {
      const { error } = await supabase
        .from("orders")
        .update({
          transport_amount: amount,
          transport_status: amount == null ? "pending" : "quoted",
        })
        .eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (!order) return null;
  const breakdown = order.transport_breakdown as unknown as TransportBreakdown | null;

  return (
    <div className="mt-4 grid gap-3 rounded-xl border border-border p-4 text-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold">Transport</p>
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          {order.transport_status}
        </span>
      </div>
      <label className="flex items-center gap-2">
        <span className="text-muted-foreground">Amount (SEK)</span>
        <input
          type="number"
          min={0}
          aria-label="Transport amount"
          className="h-8 w-28 rounded-md border border-input bg-background px-2"
          defaultValue={order.transport_amount == null ? "" : String(order.transport_amount)}
          key={String(order.transport_amount)}
          onBlur={(e) => {
            const v = e.target.value === "" ? null : Number(e.target.value);
            if (v !== (order.transport_amount == null ? null : Number(order.transport_amount)))
              setAmount.mutate(v);
          }}
        />
        <span className="text-muted-foreground">
          {order.transport_amount == null ? "pending" : formatSek(Number(order.transport_amount))}
        </span>
      </label>
      {breakdown?.warehouses?.length ? (
        <ul className="text-xs text-muted-foreground">
          {breakdown.warehouses.map((w) => (
            <li key={w.warehouse_id}>
              {w.warehouse_name}: {Math.round(w.distance_m / 100) / 10} km,{" "}
              {Math.round(w.duration_s / 60)} min one way · {w.staff_hours} h staff{" "}
              {formatSek(w.staff_cost)} + truck {formatSek(w.truck_cost)} = {formatSek(w.subtotal)}
            </li>
          ))}
        </ul>
      ) : null}
      <label className="grid gap-1">
        <span className="text-muted-foreground">Responsible staff</span>
        <select
          className={selectClass}
          value={order.responsible_staff_id ?? ""}
          onChange={(e) => setStaff.mutate(e.target.value)}
        >
          <option value="">Unassigned</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.is_active ? "" : " (inactive)"}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
