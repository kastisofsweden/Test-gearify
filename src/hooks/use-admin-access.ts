import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/** True only for the full 'admin' role (testers are excluded). */
export function useFullAdmin(enabled = true) {
  return useQuery({
    queryKey: ["is-full-admin"],
    enabled,
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return false;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id)
        .eq("role", "admin");
      return Boolean(data?.length);
    },
  });
}
