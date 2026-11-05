<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep the storefront catalogue in `CatalogueExperience` and reuse it for home, catalog, kits, and category pages so filtering and global rental dates remain consistent.
- Keep branding in `BrandLogo` with generated dark/light raster variants and a matching favicon so the name remains legible across light and dark surfaces.
- All UI is English; routes pass `lang="en"`.
- Scope the dark chrome storefront theme under `storefront-dark` so the English back office retains its operational visual system.
- Physical units live in `stock_items` (no parallel units table) so availability functions keep counting serialized stock. Each unit's S/N is `stock_items.serial_code`, issued only by the BEFORE INSERT trigger via `allocate_unit_serial`: the unit number within the main organization (`sn_org_no`, counter `units:<main org id>`) and within the item (`sn_item_no`, counter `item:<equipment id>`), both row-locked upserts, unique-indexed, skipping codes in `serial_codes`, so codes are never shared or reused; counters are keyed by org id so prefix edits never reset them. Re-issuing an S/N happens only in `unit_serial_repair` (old code stays in `serial_codes` as kind alias/review so it keeps scanning). `equipment.serial_code` is a product-level code only. Labels print units only (QR = unit URL, Code 128 = serial_code); `unit_number`/`item_code` are legacy. Unit creation and moves go through the `create_units`/`convert_stock_to_units`/`unit_move` RPCs so every change lands in the append-only `unit_movements` log.
- Products belong to an owner in `organizations` (required `equipment.organization_id`); sub-organizations are one level deep and share their main organization's S/N prefix and counters; the prefix stays editable (future codes only) but the parent locks once the series has issued a code.
- Back office sections are selected by the `?tab=` search param on `/admin` (not local state) so every section is deep-linkable; admin-only sections are hidden from testers in the nav and guarded in the page.
- Pure unit-register logic (CSV parsing/validation, import grouping, labels, S/N format in `src/lib/serialCode.ts`) lives in `src/lib/units.ts` with vitest tests beside it (`bunx vitest run`), so import rules can be tested without the UI.
- Public unit URLs (QR codes, copy buttons) come only from `src/lib/unitUrls.ts` (`resolveQrBaseUrl`: `app_settings.qr_base_url`, else `VITE_PUBLIC_SITE_URL`, else browser origin, else the published site; path `/i/<token>`), and `/i/<token>` is served in place on every host (old bases are kept in `qr_legacy_domains` by trigger), so printed labels never break when the base changes.
- Label footer e-mail/logo come only from the owner organization via `src/lib/labelBranding.ts` (field-wise fallback to the main organization, then the default), passed per label in `LabelInput`, so mixed-owner batches print correctly.
- Public unit-report forwarding runs only in the `forwardUnitReport` server function after the RPC write (claim via `unit_reports.external_notified_at`, limits in `src/lib/unitReportEmail.ts`) and never fails the report, so e-mail problems can't block reporting.
- All labels come only from `src/lib/productLabel.ts` + `ProductLabelDialog`: one tested mm layout (`layoutLabel`/`labelGrid`, ink metrics from `labelFontMetrics.ts`, fonts from `labelFonts.ts`) builds one jsPDF used for preview (pdfjs), print and download, so preview and print never drift.

- Item images are stored in the public `item-images` storage bucket (back-office upload only) and saved on `equipment.image_url`; `equipment.comment` is internal and never printed.
- Items and units are deleted only via the `delete_item`/`delete_units` RPCs: hard delete is allowed only while `unit_has_rental_history` is false (creation/S/N-change log rows are purged with them) and the item is on no order lines; otherwise units are retired. Their S/N codes stay in `serial_codes` so they are never reissued.
- Website bookings go only through the `createBooking` server function (salted IP hash) calling `create_booking` with the service role; the RPC holds all abuse limits and creates `pending` orders that never count toward availability, and pending becomes reserved only via `confirm_order` (row-locked re-check, enforced by the status trigger), so stock can't be held by unconfirmed or scripted requests.
- Anonymous visitors never touch private tables directly: public writes and token reads go through validated SECURITY DEFINER RPCs (`submit_unit_report`, `get_public_offer`, `get_public_unit`; `submit_lead`/`create_booking` only via server functions that add the salted IP hash from `src/lib/clientFingerprint.ts`), anon gets column-level SELECT on `equipment` (storefront columns only, so storefront queries list columns, never `*`), and anon read policies must not call `has_role` (anon has no EXECUTE on it), so table grants and policies stay minimal.
- Roles are granted only from `admin_email_allowlist` (email + role) to email-confirmed accounts, never hard-coded in functions; back-office routes check the role in `beforeLoad` via `src/lib/staffAccess.ts` and show `NoAccess` otherwise.
- Transport price math lives only in `src/lib/transportPricing.ts` (pure, tested); Google routing, caching and DB writes live in `src/lib/transport.server.ts`, and warehouses are always derived server-side from product ids, so a client can never choose a warehouse or amount.
- Partner access is company-scoped through `user_companies` and `is_partner_of(company_id)` RLS (linked only from allowlist rows with role partner + company_id); the back office shows partner-only users just tabs flagged `partner` in `NAV`, so new partner-visible data needs both a policy and a flag.
- Calculations become orders only through `convert_calculation_to_order` (draft + `confirm_order` in one transaction), so a failed stock check never leaves a half-created order.
- Commission is computed only in the DB (`commission_for`, mirror `src/lib/commission.ts`), snapshotted by triggers; owner shares (`equipment_ownership`) become `org_invoice_rows` (status: `src/lib/invoiceShares.ts`).
