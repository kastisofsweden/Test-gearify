import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { escapeHtml } from "@/lib/escapeHtml";
import { Button } from "@/components/ui/button";
import { NEXT_STATUSES, STATUS_LABEL, type OrderStatus } from "@/lib/booking";
import { formatDate } from "@/lib/rental";

type OpsOrder = {
  id: string;
  order_number: string;
  status: string;
  starts_on: string;
  ends_on: string;
  shipping_method: string;
  delivery_city: string | null;
  customers: { name: string; phone: string | null } | null;
};

const today = () => new Date().toISOString().slice(0, 10);

/** Today's warehouse work: hand-outs, returns, late orders and fresh bookings. */
export function OperationsPanel() {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["admin-ops"],
    queryFn: async () => {
      const { data: orders, error } = await supabase
        .from("orders")
        .select(
          "id, order_number, status, starts_on, ends_on, shipping_method, delivery_city, customers(name, phone)",
        )
        .in("status", ["reserved", "picked_up", "returned"])
        .order("starts_on");
      if (error) throw error;
      const rows = (orders ?? []) as unknown as OpsOrder[];
      const day = today();
      return {
        pickups: rows.filter((o) => o.status === "reserved" && o.starts_on <= day),
        returns: rows.filter((o) => o.status === "picked_up" && o.ends_on === day),
        late: rows.filter((o) => o.status === "picked_up" && o.ends_on < day),
        upcoming: rows.filter((o) => o.status === "reserved" && o.starts_on > day).slice(0, 8),
        toClose: rows.filter((o) => o.status === "returned"),
      };
    },
  });

  const advance = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: OrderStatus }) => {
      const { error } = await supabase.from("orders").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status updated");
      queryClient.invalidateQueries({ queryKey: ["admin-ops"] });
      queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const printDay = async () => {
    const { data: rows, error } = await supabase
      .from("order_lines")
      .select("description, quantity, orders!inner(order_number, starts_on, status)")
      .eq("orders.starts_on", today())
      .eq("orders.status", "reserved");
    if (error) {
      toast.error(error.message);
      return;
    }
    const win = window.open("", "_blank", "width=800,height=900");
    if (!win) return;
    const body = (rows ?? [])
      .map((row) => {
        const order = row.orders as unknown as { order_number: string };
        return `<tr><td>${escapeHtml(order.order_number)}</td><td>${escapeHtml(row.quantity)} pcs</td><td>${escapeHtml(row.description)}</td></tr>`;
      })
      .join("");
    win.document.write(
      `<html><head><title>Pick list ${escapeHtml(today())}</title></head><body style="font-family:Arial">
        <h1>Pick list ${escapeHtml(today())}</h1>
        <table border="1" cellpadding="6" cellspacing="0">${body}</table>
      </body></html>`,
    );
    win.document.close();
    win.print();
  };

  const Group = ({
    title,
    orders,
    accent = false,
  }: {
    title: string;
    orders: OpsOrder[];
    accent?: boolean;
  }) => (
    <div
      className={`rounded-2xl border p-5 ${accent ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"}`}
    >
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        <span className="text-sm text-muted-foreground">{orders.length}</span>
      </div>
      <ul className="mt-3 grid gap-2 text-sm">
        {orders.map((order) => (
          <li
            key={order.id}
            className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2"
          >
            <span>
              <span className="font-medium">{order.order_number}</span> ·{" "}
              {order.customers?.name ?? "—"}
              <span className="block text-xs text-muted-foreground">
                {formatDate(order.starts_on)} – {formatDate(order.ends_on)} ·{" "}
                {order.shipping_method === "delivery"
                  ? `Delivery ${order.delivery_city ?? ""}`
                  : "Pickup"}
              </span>
            </span>
            <span className="flex gap-2">
              {(NEXT_STATUSES[order.status as OrderStatus] ?? [])
                .filter(
                  (next) => next === "picked_up" || next === "returned" || next === "completed",
                )
                .map((next) => (
                  <Button
                    key={next}
                    size="sm"
                    variant="outline"
                    onClick={() => advance.mutate({ id: order.id, status: next })}
                  >
                    {STATUS_LABEL[next].en}
                  </Button>
                ))}
            </span>
          </li>
        ))}
        {orders.length === 0 ? <li className="text-muted-foreground">Nothing right now.</li> : null}
      </ul>
    </div>
  );

  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={printDay}>
          <Printer className="size-4" /> Today's pick list
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Group title="Ready for pickup" orders={data?.pickups ?? []} />
        <Group title="Returns today" orders={data?.returns ?? []} />
        <Group title="Overdue returns" orders={data?.late ?? []} accent />
        <Group title="Ready to close" orders={data?.toClose ?? []} />
        <Group title="Upcoming bookings" orders={data?.upcoming ?? []} />
      </div>
    </div>
  );
}
