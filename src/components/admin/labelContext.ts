import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useOrganizations } from "@/components/admin/OrganizationsTab";
import { brandingByEquipment } from "@/lib/labelBranding";
import { resolveQrBaseUrl, type QrSettings } from "@/lib/unitUrls";

export const APP_SETTINGS_QUERY_KEY = ["app-settings"];

export function useAppSettings() {
  return useQuery({
    queryKey: APP_SETTINGS_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("qr_base_url, qr_legacy_domains, updated_at")
        .maybeSingle();
      if (error) throw error;
      return data as (QrSettings & { updated_at: string }) | null;
    },
  });
}

/** QR base + owner branding for print jobs; `ready` is false until both are loaded. */
export function useLabelJobContext() {
  const { data: orgs, isSuccess: orgsReady } = useOrganizations();
  const settings = useAppSettings();
  const equipment = useQuery({
    queryKey: ["equipment", "owners"],
    queryFn: async () => {
      const { data, error } = await supabase.from("equipment").select("id, organization_id");
      if (error) throw error;
      return data;
    },
  });
  const branding = useMemo(
    () => brandingByEquipment(equipment.data ?? [], orgs ?? []),
    [equipment.data, orgs],
  );
  const baseUrl = resolveQrBaseUrl(
    settings.data,
    import.meta.env["VITE_PUBLIC_SITE_URL"] as string | undefined,
    typeof window !== "undefined" ? window.location.origin : null,
  );
  const brandingFor = useCallback(
    (id: string | undefined) => (id ? branding.get(id) : undefined),
    [branding],
  );
  return {
    ready: orgsReady && equipment.isSuccess && !settings.isLoading,
    baseUrl,
    brandingFor,
  };
}
