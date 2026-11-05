import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useWarehouses, WAREHOUSES_KEY, type Warehouse } from "@/components/admin/backofficeData";

type Draft = Omit<Warehouse, "id"> & { id?: string };

const EMPTY: Draft = {
  name: "",
  address: "",
  lat: null,
  lng: null,
  loading_time_hours: 1,
  rig_up_time_hours: 1,
  truck_cost_per_10km_sek: 25,
  staff_per_delivery: 1,
  is_active: true,
};

export function WarehousesTab() {
  const qc = useQueryClient();
  const { data: warehouses = [], isLoading } = useWarehouses();
  const [draft, setDraft] = useState<Draft | null>(null);

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const payload = {
        name: d.name.trim(),
        address: d.address.trim(),
        lat: d.lat == null || String(d.lat) === "" ? null : Number(d.lat),
        lng: d.lng == null || String(d.lng) === "" ? null : Number(d.lng),
        loading_time_hours: Number(d.loading_time_hours),
        rig_up_time_hours: Number(d.rig_up_time_hours),
        truck_cost_per_10km_sek: Number(d.truck_cost_per_10km_sek),
        staff_per_delivery: Math.max(1, Math.round(Number(d.staff_per_delivery))),
        is_active: d.is_active,
      };
      const { error } = d.id
        ? await supabase.from("warehouses").update(payload).eq("id", d.id)
        : await supabase.from("warehouses").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Warehouse saved");
      setDraft(null);
      qc.invalidateQueries({ queryKey: WAREHOUSES_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("warehouses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Warehouse deleted");
      setDraft(null);
      qc.invalidateQueries({ queryKey: WAREHOUSES_KEY });
    },
    onError: () => toast.error("Products still use this warehouse — deactivate it instead"),
  });

  const num = (key: keyof Draft, label: string, step = "0.25") => (
    <div className="grid gap-2">
      <Label htmlFor={`wh-${key}`}>{label}</Label>
      <Input
        id={`wh-${key}`}
        type="number"
        min={0}
        step={step}
        value={String(draft?.[key] ?? "")}
        onChange={(e) => setDraft((d) => (d ? { ...d, [key]: e.target.value } : d))}
      />
    </div>
  );

  return (
    <div className="grid gap-6">
      <div className="flex justify-between">
        <p className="text-sm text-muted-foreground">
          Every product ships from one warehouse. Transport is priced per warehouse in the cart.
        </p>
        <Button onClick={() => setDraft({ ...EMPTY })}>
          <Plus className="size-4" /> New warehouse
        </Button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Address</th>
              <th className="p-3">Load / rig (h)</th>
              <th className="p-3">Truck / 10 km</th>
              <th className="p-3">Staff</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td className="p-3 text-muted-foreground" colSpan={6}>
                  Loading…
                </td>
              </tr>
            )}
            {warehouses.map((w) => (
              <tr
                key={w.id}
                className="cursor-pointer border-t border-border hover:bg-secondary/50"
                onClick={() => setDraft({ ...w })}
              >
                <td className="p-3 font-medium">{w.name}</td>
                <td className="p-3">{w.address}</td>
                <td className="p-3">
                  {Number(w.loading_time_hours)} / {Number(w.rig_up_time_hours)}
                </td>
                <td className="p-3">{Number(w.truck_cost_per_10km_sek)} kr</td>
                <td className="p-3">{w.staff_per_delivery}</td>
                <td className="p-3">{w.is_active ? "Active" : "Inactive"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {draft && (
        <form
          className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.name.trim() || !draft.address.trim()) {
              toast.error("Name and address are required");
              return;
            }
            save.mutate(draft);
          }}
        >
          <h2 className="font-display text-xl sm:col-span-2">
            {draft.id ? `Edit ${draft.name}` : "New warehouse"}
          </h2>
          <div className="grid gap-2">
            <Label htmlFor="wh-name">Name *</Label>
            <Input
              id="wh-name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="wh-address">Address *</Label>
            <Input
              id="wh-address"
              value={draft.address}
              onChange={(e) => setDraft({ ...draft, address: e.target.value })}
            />
          </div>
          {num("lat", "Latitude (optional)", "any")}
          {num("lng", "Longitude (optional)", "any")}
          {num("loading_time_hours", "Loading time (hours)")}
          {num("rig_up_time_hours", "Rig-up time (hours)")}
          {num("truck_cost_per_10km_sek", "Truck cost per 10 km (SEK)", "1")}
          {num("staff_per_delivery", "Staff per delivery", "1")}
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={draft.is_active}
              onCheckedChange={(v) => setDraft({ ...draft, is_active: v })}
            />
            Active
          </label>
          <div className="flex justify-end gap-2 sm:col-span-2">
            {draft.id && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (confirm(`Delete ${draft.name}?`)) remove.mutate(draft.id!);
                }}
              >
                Delete
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              Save
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
