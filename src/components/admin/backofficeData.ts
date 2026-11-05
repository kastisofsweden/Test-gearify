import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export const DEFAULT_WAREHOUSE_ID = "00000000-0000-4000-a000-000000000001";
export const DEFAULT_COMPANY_ID = "00000000-0000-4000-a000-0000000000c1";
export const DEFAULT_STAFF_ID = "00000000-0000-4000-a000-0000000000a1";

export type Warehouse = {
  id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  loading_time_hours: number;
  rig_up_time_hours: number;
  truck_cost_per_10km_sek: number;
  staff_per_delivery: number;
  is_active: boolean;
};

export type Company = { id: string; name: string; is_active: boolean };

export type StaffMember = {
  id: string;
  name: string;
  email: string;
  user_id: string | null;
  company_id: string;
  hourly_rate_sek: number;
  is_active: boolean;
};

export const WAREHOUSES_KEY = ["warehouses"];
export const COMPANIES_KEY = ["companies"];
export const STAFF_KEY = ["staff"];

export function useWarehouses() {
  return useQuery({
    queryKey: WAREHOUSES_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from("warehouses").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Warehouse[];
    },
  });
}

export function useCompanies() {
  return useQuery({
    queryKey: COMPANIES_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name, is_active")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Company[];
    },
  });
}

/** RLS limits partners to their own company's staff. */
export function useStaff() {
  return useQuery({
    queryKey: STAFF_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("id, name, email, user_id, company_id, hourly_rate_sek, is_active")
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as StaffMember[];
    },
  });
}

export const selectClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";
