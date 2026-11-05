import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { accessFromRoles } from "./staffAccess";

describe("accessFromRoles", () => {
  it("limits a partner-only user", () => {
    const a = accessFromRoles(["partner"]);
    expect(a.isStaff).toBe(true);
    expect(a.isAdmin).toBe(false);
    expect(a.partnerOnly).toBe(true);
  });
  it("admin + partner is not partner-only", () => {
    expect(accessFromRoles(["admin", "partner"]).partnerOnly).toBe(false);
  });
  it("no roles means no access", () => {
    expect(accessFromRoles([]).isStaff).toBe(false);
  });
  it("organization member without a role is limited staff", () => {
    const a = accessFromRoles([], ["org-1"]);
    expect(a.isStaff).toBe(true);
    expect(a.isOrgMember).toBe(true);
    expect(a.partnerOnly).toBe(true);
    expect(accessFromRoles(["admin"], ["org-1"]).partnerOnly).toBe(false);
  });
});
