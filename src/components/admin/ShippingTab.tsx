import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ShippingZone } from "@/lib/booking";

type Rules = {
  id: boolean;
  min_rental_days: number;
  lead_time_days: number;
  max_horizon_days: number;
  vat_percent: number;
  pickup_location: string;
  terms: string | null;
};

export function ShippingTab() {
  const queryClient = useQueryClient();
  const [newZone, setNewZone] = useState({ name: "", cities: "", prefixes: "", base_fee: "" });

  const { data: zones = [] } = useQuery({
    queryKey: ["admin-zones"],
    queryFn: async () => {
      const { data, error } = await supabase.from("shipping_zones").select("*").order("sort_order");
      if (error) throw error;
      return (data ?? []) as ShippingZone[];
    },
  });

  const { data: rules } = useQuery({
    queryKey: ["admin-rules"],
    queryFn: async () => {
      const { data, error } = await supabase.from("business_rules").select("*").maybeSingle();
      if (error) throw error;
      return (data ?? null) as Rules | null;
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-zones"] });
    queryClient.invalidateQueries({ queryKey: ["admin-rules"] });
  };

  const updateZone = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ShippingZone> }) => {
      const { error } = await supabase.from("shipping_zones").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const addZone = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("shipping_zones").insert({
        name: newZone.name,
        cities: newZone.cities
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean),
        postal_prefixes: newZone.prefixes
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean),
        base_fee: Number(newZone.base_fee) || 0,
        sort_order: zones.length + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewZone({ name: "", cities: "", prefixes: "", base_fee: "" });
      toast.success("Zone added");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeZone = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("shipping_zones").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const saveRules = useMutation({
    mutationFn: async (patch: Partial<Rules>) => {
      const { error } = await supabase
        .from("business_rules")
        .upsert({ id: true, ...patch })
        .eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rules saved");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="grid gap-6">
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-bold">Shipping zones</h2>
        <p className="text-sm text-muted-foreground">
          Pickup from the Örebro warehouse is always free. These zones apply to delivery.
        </p>
        <div className="mt-4 grid gap-3">
          {zones.map((zone) => (
            <div
              key={zone.id}
              className="grid gap-3 rounded-xl border border-border p-3 lg:grid-cols-[1fr_1fr_1fr_120px_auto]"
            >
              <div className="grid gap-1">
                <Label className="text-xs">Name</Label>
                <Input
                  defaultValue={zone.name}
                  onBlur={(e) =>
                    updateZone.mutate({ id: zone.id, patch: { name: e.target.value } })
                  }
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Cities (comma-separated)</Label>
                <Input
                  defaultValue={zone.cities.join(", ")}
                  onBlur={(e) =>
                    updateZone.mutate({
                      id: zone.id,
                      patch: {
                        cities: e.target.value
                          .split(",")
                          .map((c) => c.trim())
                          .filter(Boolean),
                      },
                    })
                  }
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Postal code prefixes</Label>
                <Input
                  defaultValue={zone.postal_prefixes.join(", ")}
                  onBlur={(e) =>
                    updateZone.mutate({
                      id: zone.id,
                      patch: {
                        postal_prefixes: e.target.value
                          .split(",")
                          .map((p) => p.trim())
                          .filter(Boolean),
                      },
                    })
                  }
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Price (SEK)</Label>
                <Input
                  type="number"
                  defaultValue={zone.base_fee}
                  onBlur={(e) =>
                    updateZone.mutate({
                      id: zone.id,
                      patch: { base_fee: Number(e.target.value) || 0 },
                    })
                  }
                />
              </div>
              <div className="flex items-end">
                <Button variant="ghost" size="icon" onClick={() => removeZone.mutate(zone.id)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 grid gap-3 rounded-xl border border-dashed border-border p-3 lg:grid-cols-[1fr_1fr_1fr_120px_auto]">
          <Input
            placeholder="New zone"
            value={newZone.name}
            onChange={(e) => setNewZone({ ...newZone, name: e.target.value })}
          />
          <Input
            placeholder="Cities"
            value={newZone.cities}
            onChange={(e) => setNewZone({ ...newZone, cities: e.target.value })}
          />
          <Input
            placeholder="Postal code prefixes"
            value={newZone.prefixes}
            onChange={(e) => setNewZone({ ...newZone, prefixes: e.target.value })}
          />
          <Input
            placeholder="Price"
            type="number"
            value={newZone.base_fee}
            onChange={(e) => setNewZone({ ...newZone, base_fee: e.target.value })}
          />
          <Button onClick={() => newZone.name.trim() && addZone.mutate()}>Add</Button>
        </div>
      </div>

      {rules ? (
        <form
          className="rounded-2xl border border-border bg-card p-6"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            saveRules.mutate({
              min_rental_days: Number(form.get("min_rental_days")) || 1,
              lead_time_days: Number(form.get("lead_time_days")) || 0,
              max_horizon_days: Number(form.get("max_horizon_days")) || 365,
              vat_percent: Number(form.get("vat_percent")) || 25,
              pickup_location: String(form.get("pickup_location") ?? ""),
              terms: String(form.get("terms") ?? ""),
            });
          }}
        >
          <h2 className="text-lg font-bold">Rental rules</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="grid gap-2">
              <Label>Minimum rental days</Label>
              <Input name="min_rental_days" type="number" defaultValue={rules.min_rental_days} />
            </div>
            <div className="grid gap-2">
              <Label>Lead time (days)</Label>
              <Input name="lead_time_days" type="number" defaultValue={rules.lead_time_days} />
            </div>
            <div className="grid gap-2">
              <Label>Maximum booking horizon (days)</Label>
              <Input name="max_horizon_days" type="number" defaultValue={rules.max_horizon_days} />
            </div>
            <div className="grid gap-2">
              <Label>VAT %</Label>
              <Input name="vat_percent" type="number" defaultValue={rules.vat_percent} />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <Label>Pickup address</Label>
              <Input name="pickup_location" defaultValue={rules.pickup_location} />
            </div>
            <div className="grid gap-2 sm:col-span-2 lg:col-span-4">
              <Label>Terms</Label>
              <Textarea name="terms" rows={3} defaultValue={rules.terms ?? ""} />
            </div>
          </div>
          <Button type="submit" className="mt-4">
            Save rules
          </Button>
        </form>
      ) : null}
    </div>
  );
}
