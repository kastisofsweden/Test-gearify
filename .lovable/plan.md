# Read-only findings (nothing changed)

## 1) Staff access
- `src/lib/staffAccess.ts`: `accessFromRoles` -> `isAdmin/isTester/isPartner`; `partnerOnly = isPartner && !isAdmin && !isTester`. Roles are read from `user_roles` where role is in admin/tester/partner.
- `src/routes/_authenticated/admin.tsx:172`: `partnerOnly ? Boolean(n.partner) : !n.adminOnly || fullAdmin`. Partner-only users see only **My jobs** and **Calculations** (`partner: true`, lines 107–108).
- Calculations: partners can create and edit calculations for their company (RLS `is_partner_of`). The "Create order" button calls `convert_calculation_to_order`. That function (0042, lines 11–14) allows admin, tester (own rows only) or `is_partner_of(company_id)`, so **partners can convert their company's calculations to orders**.
- My jobs: `MyJobsTab({ isAdmin })`. Admin-only controls sit behind `isAdmin &&` (line 44), so partners can only view their own jobs.
- Role enum `public.app_role` has admin, tester and partner (`0040_partner_role_enum.sql`). There is also a `user` value in the base type. Allowlist `role public.app_role DEFAULT 'admin'` (0027:370).

## 2) Warehouse per item
- `ItemDetailsDialog.tsx:77–241` has a **Warehouse** select (active warehouses, default `DEFAULT_WAREHOUSE_ID`) and saves `warehouse_id`. Admins can choose a warehouse for each item.
- `transport.server.ts:99–160` reads the distinct `equipment.warehouse_id` for the products in the cart. It computes **one route leg per warehouse** to the delivery address (cached).
- `transportPricing.transportTotal` **sums each warehouse's subtotal**. Mixed carts pay a full delivery from each warehouse; there is no route consolidation.

## 3) Admin language
- NAV labels in admin.tsx are all English (Overview, Orders, My jobs, Calculations, …, QR domain, Website content).
- A search of Warehouses, Staff, MyJobs, Calculations, QrSettings and Organizations tabs found no Swedish UI strings. These tabs are English only.

## 4) Checkout / payment
- No Stripe anywhere in `src`. There is no `payment_method` or invoice field in the code. "Faktura" appears only in marketing copy (`site-content.json`).
- Flow: cart -> `CheckoutView` form (name, email, phone, company, pickup/delivery + address, note, honeypot) -> `createBooking` server fn -> `create_booking` RPC.
  - The RPC creates an order with status **`pending`**, which does not hold stock.
  - The customer is sent to `/…/order/$token`.
  - Staff then run `confirm_order`, which moves the order `pending -> reserved` (allowed transitions: reserved or cancelled).
- Later statuses: reserved -> picked_up -> returned/completed, or cancelled. Calculations go through `draft`.
- No payment step today. Invoicing is implicit, handled offline by staff.

## 5) Secrets (names only)
- GOOGLE_MAPS_API_KEY: present (server env)
- LOVABLE_API_KEY: present (server env)
- VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY: present (.env)
- TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY, VITE_TURNSTILE_SITE_KEY: **absent**
- No email-templates folder and no `supabase/functions`. Report email logic lives in `src/lib/reportEmail.server.ts`.
- The only API route is `src/routes/api/public/qr-health.ts`, which checks QR domains. There is no secrets or health-check endpoint.

## 6) Git
- `git log -5`: 64737bd Lade till Google Maps API · 46f2ee3 Changes · 4a8b3c6 Changes · ed78537 Bytte 75″ … · 4a9e430 Changes.
- f07b5ff, ed78537 and 64737bd are all ancestors of HEAD on the current working branch (`edit/edt-…`; main is managed internally).
- Nothing in the app records a commit SHA. `PUBLISHED_SITE_URL` in `unitUrls.ts` is only the default for QR labels (`https://renthub.se`). There is no way from code to prove that production matches HEAD; the publish history in Lovable is the source of truth.

## Suggested next step
No changes proposed. Reply with which follow-up to build, for example: invoice/Stripe checkout, combined multi-warehouse routes, Turnstile, or a version/health endpoint.
