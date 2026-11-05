# Research inventory (no changes made)

## 1. Label printing
- Layout + PDF: `src/lib/productLabel.ts` — `layoutLabel`, `layoutBatch`, `labelGrid`, `renderLabels`, `buildLabelPdf` (jsPDF), `printPdfBlob`, `qrSvg`, `code128Svg`. No HTML/SVG print page; one PDF drives preview/print/download.
- Dialog: `src/components/admin/ProductLabelDialog.tsx`; unit job selection: `src/lib/unitLabelJob.ts`; route `src/routes/_authenticated/print-labels.tsx` (calls RPC `record_label_print(_unit_ids)`).
- Input type `LabelInput` = `{ name, qrValue, barcodeValue, idText, category? }` — **no organization field**. Batch print does not fetch or pass the parent organization today.
- Footer hardcoded: `LABEL_FOOTER = "rent@dreamgroupsweden.se"` (productLabel.ts:57). No logo on labels; logo lives only in `src/components/BrandLogo.tsx` (storefront).
- Fonts/metrics: `src/lib/labelFonts.ts`, `src/lib/labelFontMetrics.ts`; tests in `productLabel.test.ts`, `unitLabelJob.test.ts`.

## 2. Organizations
- Columns: `id, name, org_number, email, notes, is_active, created_by, created_at, updated_at, parent_id, item_prefix, next_item_number, item_prefix_locked`. (Has `email`; no logo column.)
- Rows (all main orgs, active, prefix locked):
  - AV Rental `9691ddb1-74db-492b-9810-f885317dee7b` — AR — 1 item, 3 units
  - Dream Crazy Big `dd8c5a96-5e94-42dc-a454-c04f290f92f3` — DCB — 16 items, 81 units
  - Inderes `9b744ea0-f417-4703-aaa2-bf6951348369` — IS — 7 items, 7 units
- Links: `equipment.organization_id` (required), `equipment.item_root_org_id`; units link via `stock_items.equipment_id` → equipment, plus `stock_items.sn_series_id` (main org of the S/N series). Admin UI: `src/components/admin/OrganizationsTab.tsx`.

## 3. QR / public unit page
- Route: `src/routes/i.$token.tsx` (`get_public_unit(_token)` RPC); contact `UNIT_CONTACT_EMAIL = "contact@dreamgroupsweden.se"` in `src/components/site/UnitReportForm.tsx:9`.
- URL builder: `src/lib/unitUrls.ts` — `VITE_PUBLIC_SITE_URL` → browser origin → `PUBLISHED_SITE_URL = "https://renthub.se"`; path `/i/<token>`. VITE_PUBLIC_SITE_URL is not set.
- Token column: `stock_items.qr_token` (default `new_qr_token()`).

## 4. Unit reports
- `UnitReportForm.tsx` calls RPC `submit_unit_report(_token, _type, _role, _message, _name, _phone, _email, _honeypot)` directly from the browser (anon; role forced to customer per migration 0036). Writes `unit_reports`.
- No email is sent on report.

## 5. Email capability
- No Resend, nodemailer, `@lovable.dev/email-js`, or send helper in code/package.json. No email templates folder.
- Secrets: `BOOKING_FINGERPRINT_SALT`, `FIRECRAWL_API_KEY`, `LOVABLE_API_KEY`, `LOVABLE_CRON_SECRET`. No email secrets.
- Sanctioned path: Lovable Emails (needs a verified sender domain, e.g. notify.renthub.se or dreamgroupsweden.se) + scaffolded app-email templates; send from a server function (report → owner notification is one recipient per event, OK as app email).

## 6. Storage
- One bucket `item-images`: public, 5 MB, JPEG/PNG/WebP. Upload in `src/components/admin/ItemDetailsDialog.tsx` (`getPublicUrl`), images under `catalogue/<slug>.<ext>` for seeded products; URL saved on `equipment.image_url`.

## 7. App settings
- No `app_settings`/`site_settings` table. Nearest: singleton `business_rules` (id boolean, VAT, pickup_location, terms…) and `site_page_overrides`.

## 8. Migrations
- Latest: `drizzle/migrations/0042_0042_convert_calculation_customer.sql` (next = 0043).

## Checklist for the implementation prompt
- Labels: add org fields to `LabelInput`, fetch `organizations` (resolve parent via `parent_id`) in batch/unit jobs, replace `LABEL_FOOTER` constant with per-org email/logo (fallback current).
- Orgs: decide new columns (e.g. `logo_url`, `label_email`, `contact_email`) in 0043; logo upload into `item-images` or new bucket.
- QR page: show owning org contact instead of hardcoded `UNIT_CONTACT_EMAIL`; set `VITE_PUBLIC_SITE_URL`.
- Reports email: move submit to a server function, set up Lovable email domain, add one template, send to org/contact email.
- Settings: create `app_settings` singleton if global defaults needed, or extend `business_rules`.
