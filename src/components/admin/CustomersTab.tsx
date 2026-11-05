import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { STATUS_LABEL, type OrderStatus } from "@/lib/booking";
import { formatDate } from "@/lib/rental";

type Customer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  city: string | null;
  created_at: string;
};

export function CustomersTab() {
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: customers = [] } = useQuery({
    queryKey: ["admin-customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, email, phone, company, city, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Customer[];
    },
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["admin-customer-orders", openId],
    enabled: Boolean(openId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, status, starts_on, ends_on")
        .eq("customer_id", openId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const visible = customers.filter((c) => {
    if (!search.trim()) return true;
    const needle = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(needle) ||
      (c.email ?? "").toLowerCase().includes(needle) ||
      (c.company ?? "").toLowerCase().includes(needle)
    );
  });

  return (
    <div className="grid gap-6">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search customers"
        className="max-w-sm"
      />

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">City</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {visible.map((customer) => (
              <tr key={customer.id} className="border-t border-border/60">
                <td className="px-4 py-3">
                  <p className="font-medium">{customer.name}</p>
                  {customer.company ? (
                    <p className="text-xs text-muted-foreground">{customer.company}</p>
                  ) : null}
                </td>
                <td className="px-4 py-3">{customer.email ?? "—"}</td>
                <td className="px-4 py-3">{customer.phone ?? "—"}</td>
                <td className="px-4 py-3">{customer.city ?? "—"}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    className="text-sm text-primary"
                    onClick={() => setOpenId(openId === customer.id ? null : customer.id)}
                  >
                    {openId === customer.id ? "Close" : "Orders"}
                  </button>
                </td>
              </tr>
            ))}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No customers yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {openId ? (
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-lg font-bold">Order history</h2>
          <ul className="mt-3 grid gap-2 text-sm">
            {orders.map((order) => (
              <li key={order.id} className="flex justify-between border-b border-border/60 pb-2">
                <span>
                  {order.order_number} · {formatDate(order.starts_on)} – {formatDate(order.ends_on)}
                </span>
                <span className="text-muted-foreground">
                  {STATUS_LABEL[order.status as OrderStatus]?.en ?? order.status}
                </span>
              </li>
            ))}
            {orders.length === 0 ? <li className="text-muted-foreground">No orders.</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
