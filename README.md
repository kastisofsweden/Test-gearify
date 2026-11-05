# Renthub (Rentmarket)

> All user-facing UI is English (storefront + back office). Catalog content in the database may remain as entered; legacy Swedish URLs (e.g. `/hyra`, `/varukorg`) still work and render English.

AV equipment rental platform: a public storefront (English) where customers
browse products and kits, pick one global hire period and send booking requests, plus an
English-only back office for orders, inventory, physical units, label printing and scanning.

Live app: https://gear-gems-finder.lovable.app

## Architecture

| Layer     | Technology                                                                                                 |
| --------- | ---------------------------------------------------------------------------------------------------------- |
| Framework | [TanStack Start](https://tanstack.com/start) v1 (React 19, file-based routes in `src/routes`, SSR) on Vite |
| Runtime   | Edge worker (Cloudflare Workers compatible); server code runs on workerd, not Node                         |
| Backend   | Lovable Cloud (managed Supabase: Postgres, Auth, Storage)                                                  |
| Styling   | Tailwind CSS v4 (`src/styles.css`), shadcn/ui components                                                   |
| Tests     | Vitest (`src/lib/*.test.ts`)                                                                               |

- **Server functions** (`createServerFn` in `src/lib/*.functions.ts`) run app-internal server logic,
  e.g. the website booking (`booking.functions.ts`) and the public order lookup (`orders.functions.ts`).
  Code that needs the service-role key loads the admin client inside the handler only.
- **Database RPCs** (`SECURITY DEFINER`, `search_path = public`) hold the business rules: availability,
  pricing, booking, unit moves, serial numbers. The browser talks to the database through the
  publishable key; row-level security decides what each role can see.
- Main folders: `src/routes` (pages), `src/components/site` (storefront), `src/components/admin`
  (back office), `src/lib` (shared logic, server functions and tests), `drizzle/migrations` (SQL).

## Local setup

`bun.lock` resolves packages through Lovable's internal registry. Outside Lovable, delete it and run
`bun install` to create a fresh lockfile.

Requirements: [Bun](https://bun.sh) (or Node 20+ with npm).

```sh
bun install
bun run dev        # http://localhost:8080
bunx vitest run    # unit tests
bun run lint       # eslint + prettier
```

Environment variables (names only; values come from the Lovable Cloud project):

| Name                            | Where             | Purpose                                                                                                                |
| ------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`             | browser           | Backend URL                                                                                                            |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | browser           | Publishable (anon) key                                                                                                 |
| `VITE_SUPABASE_PROJECT_ID`      | browser           | Project id                                                                                                             |
| `VITE_PUBLIC_SITE_URL`          | browser, optional | Base URL encoded in unit QR codes                                                                                      |
| `SUPABASE_URL`                  | server            | Backend URL for server functions                                                                                       |
| `SUPABASE_PUBLISHABLE_KEY`      | server            | Publishable key for server-side public reads                                                                           |
| `SUPABASE_SERVICE_ROLE_KEY`     | server only       | Privileged calls (booking RPC, public order lookup)                                                                    |
| `BOOKING_FINGERPRINT_SALT`      | server only       | Salt for hashing client IPs used in booking/lead/transport rate limits                                                 |
| `GOOGLE_MAPS_API_KEY`           | server only       | Google key with the **Routes API** enabled, used for transport pricing. Optional: when missing, transport is "pending" |

Never put server-only values in `VITE_*` variables.

## Roles and the allowlist

- Roles live in `public.user_roles` (`admin`, `tester`), never on the profile. Policies check them
  with `has_role()`.
- A role is granted only from `public.admin_email_allowlist` (`email`, `role`, default `admin`), and
  only once the account's email is confirmed (on sign-up, on confirmation, or when an email is added to
  the allowlist).
- Staff must either be **invited** or **confirm via the email link** (`invited_at` or
  `confirmation_sent_at` set). Accounts that are confirmed without going through either flow
  (auto-confirmed) do not get a role, even if their email is allowlisted. Existing roles are not
  revoked by this rule.
- `/auth` is sign-in only (plus password reset); there is no self-service sign-up. Staff are
  invited. Any account that exists without an allowlist entry receives **no role**: the back office
  shows "Ingen behörighet" and every staff table/RPC refuses them.
- The allowlist is kept in sync with roles: deleting an allowlist row removes that email's role, and
  changing a row's `role` (admins only) swaps the role, using the same invited/confirmed rule.
- **Admin**: full back office. **Tester**: reads everything, writes only records they created, and
  may record label prints.
- **Partner**: an external company's user. The allowlist row needs `role = 'partner'` and a
  `company_id` (enforced by a check constraint); granting the role also links the account in
  `user_companies`, and deleting/changing the row removes/moves that link. Partners only see
  **My jobs** and **Calculations** in `/admin` (no `/print-labels`). RLS (`is_partner_of(company_id)`)
  limits them to orders, order lines, calculations, staff and the company row of their own
  companies; they can't read customers, units, leads or other companies' staff rates.
- `/admin` and `/print-labels` check the role in `beforeLoad`; the database remains the security
  boundary.

## Warehouses, staff and companies

- `warehouses` (admin tab **Warehouses**): address (optional lat/lng), loading and rig-up hours,
  truck cost per 10 km and staff per delivery. Default **Örebro**, Östra vagnvägen 4 (1 h + 1 h,
  25 kr/10 km, 1 person). Every product has a required `equipment.warehouse_id` (default Örebro),
  set in the Price list editor and the Inventory item dialog. The column is not granted to anon:
  transport is computed server-side from product ids.
- `companies` + `staff` (admin tab **Staff & companies**): staff have a company, hourly rate
  (default 600 kr/h) and an optional link to a login (`user_id`, used by My jobs). Seeded: company
  **Dream Crazy Big**, staff Marcus Bornold and Samuel Kastberg.
- Every order has `company_id` (default Dream Crazy Big) and `responsible_staff_id` (default Marcus,
  changeable on the order page).

## Transport pricing

Pure formula in `src/lib/transportPricing.ts` (tests beside it). Per warehouse in the cart:

```
round_trip_hours = 2 × one-way duration in traffic
staff_hours      = loading + rig-up + round_trip_hours
staff_cost       = staff_hours × staff_per_delivery × hourly rate (responsible staff)
truck_cost       = ceil(2 × one-way km / 10) × truck cost per 10 km
subtotal         = round(staff_cost + truck_cost)        → summed over warehouses
```

Example: 45 min / 30 km one way, 1 + 1 h, 600 kr/h → 3.5 h = 2100 kr + 6 × 25 = 150 kr = **2250 kr**.

- Routes come from Google **Routes API** `computeRoutes` (DRIVE, `TRAFFIC_AWARE_OPTIMAL`,
  `PESSIMISTIC`, departure next weekday 16:30 Europe/Stockholm) in `src/lib/transport.server.ts`,
  cached 24 h per address + warehouse in `transport_cache`. If the key is a Lovable connector key,
  the call falls back to the connector gateway.
- `quoteTransport` (public server function) is rate limited to 30/hour per salted IP hash
  (`transport_quote_log`). `quoteTransportForStaff` (signed in) prices with a chosen staff member's
  rate, read through the caller's RLS.
- Missing key, API error, bad address or rate limit → `pending` with "Transport beräknas och
  bekräftas i offerten"; checkout and booking still work.
- `createBooking` recomputes transport server-side after the order is created (client amounts are
  never trusted) and stores `orders.transport_amount / transport_status / transport_breakdown /
transport_distance_m / transport_duration_s` (`null` amount = pending, pickup = `waived`, 0).
  `shipping_cost` stays the legacy shipping-zone fee; transport is separate and added on top.

## My jobs and calculations

- **My jobs** (`/admin?tab=my-jobs`, RPC `my_jobs`): orders assigned to the staff row linked to your
  login; partners see their companies' open orders; admins can toggle all open orders.
- **Calculations** (`/admin?tab=calculations`, tables `calculations` + `calculation_lines`): internal
  kalkyler (not public offers). Items, quantities, dates, delivery address, company and responsible
  staff; live total = rental − discount + transport, then VAT (`src/lib/calculations.ts`). Saving
  never touches stock. **Create order** calls `convert_calculation_to_order`, which creates the
  customer (from name/email) and a draft order with lines, then runs `confirm_order` (row-locked
  stock check) in the same transaction: either the order ends up `reserved` and the calculation
  `converted`, or nothing is created and the calculation stays editable.

## Public unit page `/i/{token}`

Every physical unit has a random 128-bit `qr_token` (32 hex characters). The QR code on its label
links to `/i/{token}`, an English mobile page (no login) with the unit name, image and a form to
report a note or fault (`get_public_unit`, `submit_unit_report` with honeypot and throttling).

QR base URL: `VITE_PUBLIC_SITE_URL`, else the browser origin, else `https://renthub.se`
(`PUBLISHED_SITE_URL`; the domain is not connected yet, so set `VITE_PUBLIC_SITE_URL` until it is). Set
`VITE_PUBLIC_SITE_URL` in production so labels printed from a preview still point at the live site.

### Changeable QR domain (`/admin?tab=qr-settings`)

`app_settings.qr_base_url` (admin-only write) overrides the chain above for **new** labels
(`resolveQrBaseUrl` in `src/lib/unitUrls.ts`). Changing it automatically appends the previous base to
`qr_legacy_domains` (DB trigger). `/i/{token}` is served in place on every host the app answers on (no
redirect), so old labels keep working as long as their domain still points at this project. "Check
domains" calls `GET <domain>/api/public/qr-health` (admin-only, max 10 domains, once per 30 s,
https public hosts only). **Recommendation:** use one dedicated permanent QR domain (e.g.
`qr.renthub.se`) that never changes, and set both the DB setting and `VITE_PUBLIC_SITE_URL` to it.

### Forwarding reports to an external e-mail

Per item (Inventory → item → edit): "Skicka nya registreringar till extern e-post" +
`equipment.external_report_email`. After `submit_unit_report` succeeds, the unit page calls the
`forwardUnitReport` server function: it claims the newest unforwarded report (≤ 5 min old,
`unit_reports.external_notified_at`), skips identical messages within an hour, caps 5 forwards per
unit per hour, and builds an escaped English e-mail (`src/lib/unitReportEmail.ts`, Stockholm time,
link to `/admin?tab=reports`). Outcome is stored in `unit_reports.external_notify_status`. Sending
uses Lovable's built-in app e-mails; **no sender domain is verified yet**, so the sender
(`src/lib/reportEmail.server.ts`) soft-skips with `skipped:email_not_configured`. A failed or skipped
e-mail never fails the report. To enable: More → Emails → set up and verify a sender domain you own
(paid plan, DNS records shown there), then ask to wire the app-email template into the sender. No
extra secret or `VITE_` variable is needed.

## Back office tools

- **Scanner** (`/admin?tab=scan`): camera or handheld scanner, QR or Code 128, check-out/check-in
  against an order via `unit_move`; every move lands in the append-only `unit_movements` log.
  Check-out against an order requires the order to be `reserved` or `picked_up` (`order_not_active`
  otherwise). Retired units can never be moved, not even when forcing. Status changes caused by an
  order (pick-up/return) record that order on the movement row.
- **Labels**: one PDF layout (`src/lib/productLabel.ts`) for preview, download and print on a
  Brother QL-1100c with 62 mm continuous tape (62 × 30 mm and 62 × 40 mm templates). Unit labels carry
  the unit QR, a Code 128 of the S/N and the S/N text. The footer e-mail and an optional black logo
  (right of the footer, never over the codes) come from the item's owner organization
  (`organizations.label_email` / `label_brand_name` / `label_logo_url`, edited in Organizations);
  sub-organizations inherit each field from their main organization, else the default
  `rent@dreamgroupsweden.se` without logo. Mixed batches print each unit with its own branding.
  Logos live in the `item-images` bucket at `org-logos/<org id>.<ext>` (PNG/JPEG/WebP; SVG is not
  accepted in public storage). Inderes logo: official Inderes Brand Book, Black PNG/SVG,
  https://brand.inderes.com/logo/ — source SVG kept in `docs/brand/inderes-logo-black.svg`, the
  print-sized PNG in `docs/brand/inderes-logo-black-label.png`.
- **Inventory / Units**: items with organization, category, image and internal comment; units are
  created, converted from bulk stock, deleted (only without rental history) or retired via RPCs.

## Booking flow

1. The checkout calls the `createBooking` server function, which hashes the client IP
   (sha256 of salt + IP) and calls `create_booking` with the service role. Browsers cannot call the
   RPC directly. The IP comes only from Cloudflare's `cf-connecting-ip` (spoofable `x-real-ip` /
   `x-forwarded-for` are ignored); if it is missing, all such requests share one `unknown` bucket. If
   `BOOKING_FINGERPRINT_SALT` is missing the function fails closed and no booking is created. The
   per-IP limit is always applied.
2. `create_booking` rejects bots (honeypot field gets a fake success, forms filled in under 3 s raise
   `too_fast`), rate limits (3/hour and 10/day per email, 10/hour per IP fingerprint, 60/hour for the
   whole site), caps 20 lines and 200 units, and checks each line against available stock.
3. The order is created as **pending**. Pending orders do **not** reduce availability; only
   `reserved` and `picked_up` do. The customer sees "request received, pending confirmation, stock
   not reserved until confirmed".
4. In the back office, **Confirm** calls `confirm_order`, which locks the products, reserves the
   order and re-checks availability (fails with a clear message if stock is gone). **Decline** moves it
   to `cancelled`. A direct status update from pending to reserved is refused by the status trigger.

Draft orders are reserved the same way: draft → reserved goes only through `confirm_order`.

Status machine (`orders_validate_status`): pending → reserved | cancelled; draft → reserved |
cancelled; reserved → picked_up | cancelled | draft; picked_up → returned; returned → completed |
picked_up; cancelled → draft.

Quote requests go through the `submitLead` server function, which adds the same salted IP
fingerprint (`src/lib/clientFingerprint.ts`) and calls `submit_lead` with the service role (honeypot,
minimum fill time, length and email checks, 3/hour per email, 5/hour per IP fingerprint, 60/hour
overall). Offers are shared at `/offer/{token}` through `get_public_offer`,
which returns only public fields of non-draft offers.

## Serial numbers

Unit S/N format: `ORG###-CC###[-KK]`, e.g. `DCB042-AS031`.

- `ORG` – the main organization's prefix (letters, editable; changes affect future codes only).
  Sub-organizations share their main organization's prefix and counters.
- first `###` – the unit's number within the organization (counter per main organization).
- `CC` – first and last letter of the category (e.g. `accessories` → `AS`).
- second `###` – the unit's number within the item (counter per item).
- `-KK` – overflow suffix (`-01`, `-02`, …) once the organization number passes 999.
- Products carry a product-level code with `000` as the item part (e.g. `DCB015-LT000`); it is never
  printed as a unit S/N.

Codes are issued only by database triggers, registered in `serial_codes` and never reused. New units
get `unit_number = serial_code` (older units keep their legacy unit number). Manually entered
barcodes on units or products are rejected (`barcode_in_use`) if they match any current, old or alias
code of another product or unit. Legacy
codes (`equipment.item_code`, `equipment.legacy_barcode`, `stock_items.unit_number`, aliases from
S/N repairs) still resolve through `scan_lookup`.

## Security model

- Row-level security on every table. Anonymous visitors can only read the public catalogue tables
  (active equipment, kits, prices, tax rates, zones, page content); they have no access to orders,
  customers, leads, offers, roles or units. On `equipment`, anon has column-level SELECT on storefront
  columns only (no comment, barcode, serial/legacy codes, label counters or `created_by`); storefront
  queries must list columns explicitly instead of `select("*")`.
- Public writes go only through `SECURITY DEFINER` RPCs with validation and rate limits:
  `submit_unit_report`, plus `submit_lead` and `create_booking` (service role only, via server
  functions that add an IP fingerprint).
- Public reads of private records are token-based projections: `get_public_offer`, `get_public_unit`,
  and the `getOrderByToken` server function.
- Internal helpers and trigger functions are not executable by `anon`; `has_role` is executable only
  by signed-in users (policies need it).
- Item images: public `item-images` bucket; only staff can upload, JPEG/PNG/WebP only.
- There is no generic rate-limiting service; limits are enforced inside the RPCs.

## Migrations: `drizzle/` and `supabase/`

The base schema (`profiles`, `user_roles`, `has_role`, `leads`, `offers`, `offer_items`) was created
by early migrations that were removed from the repo in commit `fc7deb4`; `docs/schema.sql` is a
reference DDL dump of the current live schema (documentation only, never applied).

`drizzle/migrations` is the source of truth: plain SQL files applied in journal order by Drizzle Kit
(`drizzle/schema.ts` is intentionally empty). `supabase/migrations` holds two early migrations
(the `tester` role and `created_by` columns) applied by the original backend tooling before the
project switched to Drizzle; they are kept for history and must not be re-applied or edited.

## Tests

```sh
bunx vitest run
```

Pure logic is tested in `src/lib`: serial-number format (`serialCode.test.ts`), CSV import and unit
rules (`units.test.ts`), label layout (`productLabel.test.ts`), unit label jobs
(`unitLabelJob.test.ts`) and the QR base URL fallback (`unitUrls.test.ts`).

## Commission & My invoice

- **Base rental** = line price from the pricing engine before commission (qty × days × unit price).
- **Percent** commission = % of the base line total. **Fixed** = SEK per rented unit (quantity) per order line, not per day (100 kr × qty 3 = 300 kr).
- **Customer line total** = base + commission. The owner organization is owed the base (`net_to_org`).
- Resolution: item override (type + value both set, Item details → "Commission override") → owner organization → its main organization → none. Set org rates in Organizations.
- Snapshotted on every order line at insert (website booking, calculation → order, manual lines) and on calculation lines; rate changes never alter booked lines. Historical lines were backfilled with commission 0.
- **Co-ownership** (`equipment_ownership`, shares in basis points, must sum to 10000 = 100 %): edit in Item details → "Ownership shares". Items without rows are 100 % owned by `equipment.organization_id` (legacy single owner); the catalog owner never changes.
- **Invoice rows** (`org_invoice_rows`): an AFTER INSERT trigger on `order_lines` (all paths: website booking, calculation → order, manual) writes one `rental_share` row per owner with its share of the base (last share, lowest bps, gets leftover öre) plus one admin-only `commission` row. **Commission stays with the platform and is never split to owners.** Rows snapshot order number, customer, item and period.
- **Status** (computed, no cron; `src/lib/invoiceShares.ts` mirrors `list_org_invoice_rows`): `pending` until the order has `paid_at` AND 24 h have passed after the job end (end of `ends_on`, Stockholm); then `invoiceable`; `invoiced` once a member/admin marks it (`invoiced_at`, Archived tab). Only admins can set `orders.paid_at` ("Mark paid" on the order; Stripe can set it later).
- **My invoice** (`/admin?tab=my-invoice`): card list with Uninvoiced/Archived tabs, pending/invoiceable/invoiced totals, month/status filters, details dialog and CSV export. Admins see all orgs; members only their org's rental shares. Draft and cancelled orders are excluded.
- **New order** (Orders → "+ New order"): opens a new calculation (pick existing customer, items, dates, delivery/transport); "Create order" runs `convert_calculation_to_order`, so pricing and commission snapshots match bookings.
- **Partner example (EPEAK)**: org and company "EPEAK" exist. To give access (default placeholder e-mail `partner@epeak.se`): Staff & companies / allowlist → add `partner@epeak.se`, role `partner`, organization EPEAK, company EPEAK → invite the address from the backend Users screen. Access starts only after they confirm the e-mail.
- Granting membership: add or edit a row in `admin_email_allowlist` with the person's e-mail, a role (e.g. `partner`) and `organization_id`; it syncs to `user_organizations` when the account has a confirmed e-mail.
