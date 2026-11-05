import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { LeadsTab } from "@/components/admin/LeadsTab";
import { OffersTab } from "@/components/admin/OffersTab";
import { EquipmentTab } from "@/components/admin/EquipmentTab";
import { ContentTab } from "@/components/admin/ContentTab";
import { OrdersTab } from "@/components/admin/OrdersTab";
import { StockTab } from "@/components/admin/StockTab";
import { ScanTab } from "@/components/admin/ScanTab";
import { ShippingTab } from "@/components/admin/ShippingTab";
import { PricingTab } from "@/components/admin/PricingTab";
import { CustomersTab } from "@/components/admin/CustomersTab";
import { UnitsTab } from "@/components/admin/UnitsTab";
import { NEW_REPORTS_QUERY_KEY, ReportsTab } from "@/components/admin/ReportsTab";
import { OrganizationsTab } from "@/components/admin/OrganizationsTab";
import { WarehousesTab } from "@/components/admin/WarehousesTab";
import { StaffTab } from "@/components/admin/StaffTab";
import { MyJobsTab } from "@/components/admin/MyJobsTab";
import { MyInvoiceTab } from "@/components/admin/MyInvoiceTab";
import { CalculationsTab } from "@/components/admin/CalculationsTab";
import { QrSettingsTab } from "@/components/admin/QrSettingsTab";

import { Button } from "@/components/ui/button";
import { formatSek, type Lead } from "@/lib/rental";
import { OperationsPanel } from "@/components/admin/OperationsPanel";
import { useFullAdmin } from "@/hooks/use-admin-access";
import { BrandLogo } from "@/components/BrandLogo";
import { NoAccess } from "@/components/admin/NoAccess";
import { loadStaffAccess } from "@/lib/staffAccess";
import {
  Boxes,
  Briefcase,
  Building2,
  Calculator,
  Receipt,
  UserCog,
  Warehouse as WarehouseIcon,
  Camera,
  ClipboardList,
  FileText,
  Globe,
  LayoutDashboard,
  LogOut,
  MessageSquareWarning,
  QrCode,
  ScanLine,
  Tags,
  Truck,
  Users,
} from "lucide-react";

const adminSearchSchema = z.object({
  tab: z.string().optional().catch(undefined),
  new: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/_authenticated/admin")({
  validateSearch: adminSearchSchema,
  beforeLoad: async () => ({ staff: await loadStaffAccess() }),
  head: () => ({
    meta: [
      { title: "Back office | Renthub" },
      {
        name: "description",
        content: "Manage rental leads, build offers and maintain the AV equipment catalog.",
      },
      { property: "og:title", content: "Back office | Renthub" },
      { property: "og:description", content: "Leads, offers and catalog management for Renthub." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminGate,
});

type TabKey =
  | "dashboard"
  | "orders"
  | "scan"
  | "stock"
  | "units"
  | "reports"
  | "customers"
  | "pricing"
  | "shipping"
  | "leads"
  | "offers"
  | "equipment"
  | "organizations"
  | "warehouses"
  | "staff"
  | "qr-settings"
  | "my-jobs"
  | "my-invoice"
  | "calculations"
  | "content";

const NAV: {
  key: TabKey;
  label: string;
  icon: typeof Users;
  adminOnly?: boolean;
  /** Visible to partner-only users (everything else is hidden for them). */
  partner?: boolean;
  /** Visible to organization members (My invoice). */
  orgInvoice?: boolean;
}[] = [
  { key: "dashboard", label: "Overview", icon: LayoutDashboard },
  { key: "orders", label: "Orders", icon: ClipboardList },
  { key: "my-jobs", label: "My jobs", icon: Briefcase, partner: true },
  { key: "calculations", label: "Calculations", icon: Calculator, partner: true },
  { key: "my-invoice", label: "My invoice", icon: Receipt, orgInvoice: true },
  { key: "scan", label: "Scan in / out", icon: ScanLine, adminOnly: true },
  { key: "stock", label: "Inventory", icon: Boxes },
  { key: "units", label: "Units", icon: QrCode, adminOnly: true },
  { key: "reports", label: "Reports", icon: MessageSquareWarning, adminOnly: true },
  { key: "customers", label: "Customers", icon: Users },
  { key: "pricing", label: "Pricing & tax", icon: Tags },
  { key: "shipping", label: "Shipping & rules", icon: Truck },
  { key: "leads", label: "Leads", icon: Users },
  { key: "offers", label: "Offers", icon: FileText },
  { key: "equipment", label: "Price list", icon: Camera },
  { key: "organizations", label: "Organizations", icon: Building2, adminOnly: true },
  { key: "warehouses", label: "Warehouses", icon: WarehouseIcon, adminOnly: true },
  { key: "staff", label: "Staff & companies", icon: UserCog, adminOnly: true },
  { key: "qr-settings", label: "QR domain", icon: QrCode, adminOnly: true },
  { key: "content", label: "Website content", icon: Globe },
];

const TAB_KEYS = new Set<string>(NAV.map((n) => n.key));

function AdminGate() {
  const { staff } = Route.useRouteContext();
  if (!staff.isStaff) return <NoAccess />;
  return <AdminPage />;
}

function AdminPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const search = Route.useSearch();
  const { staff } = Route.useRouteContext();
  const partnerOnly = staff.partnerOnly;
  const tab: TabKey =
    search.tab && TAB_KEYS.has(search.tab)
      ? (search.tab as TabKey)
      : partnerOnly
        ? staff.isPartner
          ? "my-jobs"
          : "my-invoice"
        : "orders";
  const setTab = (key: TabKey) =>
    navigate({ to: "/admin", search: (prev) => ({ ...prev, tab: key }), replace: false });
  const [pendingLead, setPendingLead] = useState<Lead | null>(null);

  // Back-office data queries below are for admin/tester only; partners never load them.
  const isAdmin = staff.isStaff && !partnerOnly;

  // Testers may open the back office, but Units and Reports are admin-only.
  const { data: isFullAdmin = false } = useFullAdmin(isAdmin === true);
  const fullAdmin = isFullAdmin && staff.isAdmin;

  const { data: newReports = 0 } = useQuery({
    queryKey: NEW_REPORTS_QUERY_KEY,
    enabled: fullAdmin,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("unit_reports")
        .select("id", { count: "exact", head: true })
        .eq("status", "new");
      if (error) throw error;
      return count ?? 0;
    },
  });

  const navAllowed = (n: (typeof NAV)[number]) =>
    partnerOnly
      ? (Boolean(n.partner) && staff.isPartner) || (Boolean(n.orgInvoice) && staff.isOrgMember)
      : !n.adminOnly || fullAdmin;
  const nav = NAV.filter(navAllowed);
  const current = NAV.find((n) => n.key === tab);
  const tabAllowed = current ? navAllowed(current) : false;

  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    enabled: isAdmin === true,
    queryFn: async () => {
      const [leads, offers, items] = await Promise.all([
        supabase
          .from("leads")
          .select("id, status, name, created_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("offers")
          .select("id, status, offer_number, customer_name, created_at")
          .order("created_at", { ascending: false }),
        supabase.from("offer_items").select("quantity, days, unit_price, offer_id"),
      ]);
      if (leads.error) throw leads.error;
      if (offers.error) throw offers.error;
      if (items.error) throw items.error;
      const sentOfferIds = new Set(
        (offers.data ?? []).filter((o) => o.status !== "draft").map((o) => o.id),
      );
      const pipeline = (items.data ?? [])
        .filter((i) => sentOfferIds.has(i.offer_id))
        .reduce((sum, i) => sum + Number(i.quantity) * Number(i.days) * Number(i.unit_price), 0);
      return {
        newLeads: (leads.data ?? []).filter((l) => l.status === "new").length,
        totalLeads: (leads.data ?? []).length,
        openOffers: (offers.data ?? []).filter((o) => o.status === "sent").length,
        wonLeads: (leads.data ?? []).filter((l) => l.status === "won").length,
        pipeline,
        recentLeads: (leads.data ?? []).slice(0, 5),
        recentOffers: (offers.data ?? []).slice(0, 5),
      };
    },
  });

  // Open the Offers tab when a lead is handed over; navigate is stable across renders.
  useEffect(() => {
    if (pendingLead)
      navigate({ to: "/admin", search: (prev) => ({ ...prev, tab: "offers" }), replace: false });
  }, [pendingLead, navigate]);

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen bg-background font-sans lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-border bg-card/60 p-5 lg:min-h-screen lg:border-b-0 lg:border-r">
        <Link to="/" aria-label="Renthub.se home" className="inline-flex">
          <BrandLogo className="h-8 w-auto max-w-[185px]" />
        </Link>
        <p className="mt-1 text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Back office
        </p>
        <nav className="mt-6 flex gap-2 overflow-x-auto lg:grid lg:gap-1">
          {nav.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors ${
                tab === key
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              <Icon className="size-4" /> {label}
              {key === "reports" && newReports > 0 && (
                <span
                  className="ml-auto rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground"
                  aria-label={`${newReports} new reports`}
                >
                  {newReports}
                </span>
              )}
            </button>
          ))}
        </nav>
        <Button variant="ghost" className="mt-6 w-full justify-start" onClick={signOut}>
          <LogOut className="size-4" /> Sign out
        </Button>
      </aside>

      <main className="p-5 lg:p-8">
        <header className="mb-6">
          <h1 className="font-display text-3xl tracking-wide lg:text-4xl">
            {NAV.find((n) => n.key === tab)?.label}
          </h1>
          <p className="text-sm text-muted-foreground">
            Bookings, inventory, customers and website content for Renthub.se.
          </p>
        </header>

        {tab === "dashboard" && tabAllowed && (
          <div className="grid gap-6">
            <OperationsPanel />
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "New leads", value: stats?.newLeads ?? 0 },
                { label: "Total leads", value: stats?.totalLeads ?? 0 },
                { label: "Offers out", value: stats?.openOffers ?? 0 },
                { label: "Won", value: stats?.wonLeads ?? 0 },
              ].map((card) => (
                <div key={card.label} className="rounded-2xl border border-border bg-card p-5">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">
                    {card.label}
                  </p>
                  <p className="mt-2 font-display text-4xl">{card.value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                Value of offers sent
              </p>
              <p className="mt-2 font-display text-4xl text-primary">
                {formatSek(stats?.pipeline ?? 0)}
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card p-5">
                <h2 className="font-display text-xl tracking-wide">Latest leads</h2>
                <ul className="mt-3 grid gap-2 text-sm">
                  {(stats?.recentLeads ?? []).map((lead) => (
                    <li
                      key={lead.id}
                      className="flex justify-between border-b border-border/60 pb-2"
                    >
                      <span>{lead.name}</span>
                      <span className="text-muted-foreground">{lead.status}</span>
                    </li>
                  ))}
                  {(stats?.recentLeads ?? []).length === 0 && (
                    <li className="text-muted-foreground">No leads yet.</li>
                  )}
                </ul>
              </div>
              <div className="rounded-2xl border border-border bg-card p-5">
                <h2 className="font-display text-xl tracking-wide">Latest offers</h2>
                <ul className="mt-3 grid gap-2 text-sm">
                  {(stats?.recentOffers ?? []).map((offer) => (
                    <li
                      key={offer.id}
                      className="flex justify-between border-b border-border/60 pb-2"
                    >
                      <span>
                        {offer.offer_number} · {offer.customer_name ?? "—"}
                      </span>
                      <span className="text-muted-foreground">{offer.status}</span>
                    </li>
                  ))}
                  {(stats?.recentOffers ?? []).length === 0 && (
                    <li className="text-muted-foreground">No offers yet.</li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        )}

        {tab === "orders" && tabAllowed && <OrdersTab />}
        {tab === "scan" && tabAllowed && <ScanTab />}
        {tab === "stock" && tabAllowed && <StockTab />}
        {!tabAllowed && (
          <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
            This section is not available for your account.
          </p>
        )}
        {tab === "units" && tabAllowed && <UnitsTab />}
        {tab === "reports" && tabAllowed && <ReportsTab />}
        {tab === "customers" && tabAllowed && <CustomersTab />}
        {tab === "pricing" && tabAllowed && <PricingTab />}

        {tab === "shipping" && tabAllowed && <ShippingTab />}
        {tab === "leads" && tabAllowed && (
          <LeadsTab onCreateOffer={(lead) => setPendingLead(lead)} />
        )}
        {tab === "offers" && tabAllowed && (
          <OffersTab pendingLead={pendingLead} onConsumeLead={() => setPendingLead(null)} />
        )}
        {tab === "equipment" && tabAllowed && <EquipmentTab />}
        {tab === "organizations" && tabAllowed && <OrganizationsTab />}
        {tab === "content" && tabAllowed && <ContentTab />}
        {tab === "warehouses" && tabAllowed && <WarehousesTab />}
        {tab === "staff" && tabAllowed && <StaffTab />}
        {tab === "qr-settings" && tabAllowed && <QrSettingsTab />}
        {tab === "my-jobs" && tabAllowed && <MyJobsTab isAdmin={fullAdmin} />}
        {tab === "calculations" && tabAllowed && (
          <CalculationsTab startNewOrder={search.new === "order"} />
        )}
        {tab === "my-invoice" && tabAllowed && (
          <MyInvoiceTab isStaff={!partnerOnly} organizationIds={staff.organizationIds} />
        )}
      </main>
    </div>
  );
}
