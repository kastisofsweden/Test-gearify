import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { formatSek } from "@/lib/rental";

type Job = {
  id: string;
  order_number: string;
  status: string;
  starts_on: string;
  ends_on: string;
  shipping_method: string;
  delivery_address: string | null;
  delivery_city: string | null;
  customer_name: string | null;
  customer_company: string | null;
  company_name: string | null;
  responsible_staff: string | null;
  transport_amount: number | null;
  transport_status: string;
  lines: { description: string; quantity: number }[];
};

/** Assigned jobs (staff), company jobs (partners), or every open order (admins, toggle). */
export function MyJobsTab({ isAdmin }: { isAdmin: boolean }) {
  const [all, setAll] = useState(false);
  const {
    data: jobs = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["my-jobs", all],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_jobs", { _all: all });
      if (error) throw error;
      return (data ?? []) as unknown as Job[];
    },
  });

  return (
    <div className="grid gap-4">
      {isAdmin && (
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={all} onCheckedChange={setAll} /> Show all open orders
        </label>
      )}
      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">Could not load jobs.</p>}
      {!isLoading && jobs.length === 0 && (
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
          No open jobs assigned to you.
        </p>
      )}
      <div className="grid gap-3 lg:grid-cols-2">
        {jobs.map((job) => (
          <article key={job.id} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-display text-xl">{job.order_number}</h2>
              <span className="text-xs uppercase tracking-wider text-muted-foreground">
                {job.status}
              </span>
            </div>
            <p className="mt-1 text-sm">
              {job.starts_on} → {job.ends_on} · {job.customer_name ?? "—"}
              {job.customer_company ? ` (${job.customer_company})` : ""}
            </p>
            <p className="text-sm text-muted-foreground">
              {job.shipping_method === "delivery"
                ? `Delivery: ${[job.delivery_address, job.delivery_city].filter(Boolean).join(", ")}`
                : "Pickup"}
              {" · "}Transport:{" "}
              {job.transport_amount != null ? formatSek(Number(job.transport_amount)) : "pending"}
            </p>
            <p className="text-xs text-muted-foreground">
              {job.company_name} · Responsible: {job.responsible_staff ?? "—"}
            </p>
            <ul className="mt-3 grid gap-1 text-sm">
              {job.lines.map((l, i) => (
                <li key={i}>
                  {l.quantity} × {l.description}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}
