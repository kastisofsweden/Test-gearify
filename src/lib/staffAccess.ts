import { supabase } from "@/integrations/supabase/client";

export type StaffAccess = {
  /** Any back-office role: admin, tester or partner. */
  isStaff: boolean;
  isAdmin: boolean;
  isTester: boolean;
  isPartner: boolean;
  /** No admin/tester role (partner and/or organization member): limited back office. */
  partnerOnly: boolean;
  /** Linked to at least one owner organization (sees "My invoice"). */
  isOrgMember: boolean;
  organizationIds: string[];
};

const NONE: StaffAccess = {
  isStaff: false,
  isAdmin: false,
  isTester: false,
  isPartner: false,
  partnerOnly: false,
  isOrgMember: false,
  organizationIds: [],
};

export function accessFromRoles(
  roles: Iterable<string>,
  organizationIds: string[] = [],
): StaffAccess {
  const set = new Set(roles);
  const isOrgMember = organizationIds.length > 0;
  const isAdmin = set.has("admin");
  const isTester = set.has("tester");
  const isPartner = set.has("partner");
  return {
    isStaff: isAdmin || isTester || isPartner || isOrgMember,
    isAdmin,
    isTester,
    isPartner,
    partnerOnly: (isPartner || isOrgMember) && !isAdmin && !isTester,
    isOrgMember,
    organizationIds,
  };
}

/**
 * Back-office access for the signed-in user, read from user_roles (RLS lets a
 * user read only their own rows). Used by the beforeLoad of every back-office
 * route; the database policies remain the real security boundary.
 */
export async function loadStaffAccess(): Promise<StaffAccess> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NONE;
  const [{ data, error }, orgs] = await Promise.all([
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["admin", "tester", "partner"]),
    supabase.from("user_organizations").select("organization_id").eq("user_id", user.id),
  ]);
  if (error) return NONE;
  return accessFromRoles(
    (data ?? []).map((r) => r.role),
    (orgs.data ?? []).map((o) => o.organization_id),
  );
}
