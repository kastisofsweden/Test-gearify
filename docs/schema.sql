-- Reference DDL of the live public schema (documentation only, NOT a migration).
-- Generated 2026-11-05 from catalog queries. No data. Source of truth: drizzle/migrations.

CREATE TYPE public.app_role AS ENUM ('admin', 'user', 'tester');

CREATE TABLE public.admin_email_allowlist (
  email text NOT NULL,
  note text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  role app_role DEFAULT 'admin'::app_role NOT NULL
);
ALTER TABLE public.admin_email_allowlist ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.business_rules (
  id boolean DEFAULT true NOT NULL,
  min_rental_days integer DEFAULT 1 NOT NULL,
  lead_time_days integer DEFAULT 1 NOT NULL,
  max_horizon_days integer DEFAULT 365 NOT NULL,
  closed_weekdays integer[] DEFAULT '{}'::integer[] NOT NULL,
  vat_percent numeric DEFAULT 25 NOT NULL,
  pickup_location text DEFAULT 'Nikolaigatan 10, 702 10 Örebro'::text NOT NULL,
  terms text,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.business_rules ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.customers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  email text,
  phone text,
  company text,
  address text,
  postal_code text,
  city text,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid DEFAULT auth.uid()
);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.equipment (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  category text DEFAULT 'Camera'::text NOT NULL,
  description text,
  daily_price numeric(12,2) DEFAULT 0 NOT NULL,
  image_url text,
  tag text,
  is_active boolean DEFAULT true NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  quantity integer DEFAULT 1 NOT NULL,
  tracking text DEFAULT 'bulk'::text NOT NULL,
  sku text,
  page_type text,
  page_slug text,
  item_kind text DEFAULT 'rental'::text NOT NULL,
  parent_id uuid,
  variant_label text,
  rate_unit text DEFAULT 'day'::text NOT NULL,
  fixed_price numeric DEFAULT 0 NOT NULL,
  deposit_type text DEFAULT 'none'::text NOT NULL,
  deposit_value numeric DEFAULT 0 NOT NULL,
  tax_rate_id uuid,
  barcode text,
  barcode_type text DEFAULT 'code128'::text NOT NULL,
  created_by uuid DEFAULT auth.uid(),
  organization_id uuid,
  item_code text,
  item_seq integer,
  item_root_org_id uuid,
  next_unit_number integer DEFAULT 1 NOT NULL,
  label_print_count integer DEFAULT 0 NOT NULL,
  label_last_printed_at timestamp with time zone,
  serial_code text DEFAULT ''::text NOT NULL,
  legacy_barcode text,
  sn_prefix text,
  sn_org_no bigint,
  sn_category_code text,
  comment text
);
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.leads (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  email text,
  phone text,
  company text,
  message text,
  rental_start date,
  rental_end date,
  source text DEFAULT 'website'::text NOT NULL,
  status text DEFAULT 'new'::text NOT NULL,
  notes text,
  followup_date date,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid DEFAULT auth.uid(),
  client_fingerprint text
);
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.offer_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  offer_id uuid NOT NULL,
  equipment_id uuid,
  description text NOT NULL,
  quantity integer DEFAULT 1 NOT NULL,
  days integer DEFAULT 1 NOT NULL,
  unit_price numeric(12,2) DEFAULT 0 NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid DEFAULT auth.uid()
);
ALTER TABLE public.offer_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.offers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  lead_id uuid,
  offer_number text DEFAULT ((('OF-'::text || to_char(now(), 'YYMMDD'::text)) || '-'::text) || upper(substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 4))) NOT NULL,
  title text DEFAULT 'Rental offer'::text NOT NULL,
  customer_name text,
  customer_email text,
  rental_start date,
  rental_end date,
  discount_percent numeric(5,2) DEFAULT 0 NOT NULL,
  vat_percent numeric(5,2) DEFAULT 25 NOT NULL,
  valid_until date,
  terms text,
  intro text,
  internal_notes text,
  status text DEFAULT 'draft'::text NOT NULL,
  share_token text DEFAULT replace((gen_random_uuid())::text, '-'::text, ''::text) NOT NULL,
  sent_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid DEFAULT auth.uid()
);
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.order_events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  note text,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.order_lines (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_id uuid NOT NULL,
  equipment_id uuid,
  description text NOT NULL,
  quantity integer DEFAULT 1 NOT NULL,
  days integer DEFAULT 1 NOT NULL,
  unit_price numeric DEFAULT 0 NOT NULL,
  starts_on date,
  ends_on date,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  tax_percent numeric DEFAULT 25 NOT NULL,
  deposit_amount numeric DEFAULT 0 NOT NULL,
  created_by uuid DEFAULT auth.uid()
);
ALTER TABLE public.order_lines ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_number text DEFAULT ((('AV-'::text || to_char(now(), 'YYMMDD'::text)) || '-'::text) || upper(substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 4))) NOT NULL,
  customer_id uuid,
  lead_id uuid,
  offer_id uuid,
  status text DEFAULT 'draft'::text NOT NULL,
  starts_on date DEFAULT CURRENT_DATE NOT NULL,
  ends_on date DEFAULT CURRENT_DATE NOT NULL,
  discount_percent numeric DEFAULT 0 NOT NULL,
  vat_percent numeric DEFAULT 25 NOT NULL,
  shipping_method text DEFAULT 'pickup'::text NOT NULL,
  shipping_zone_id uuid,
  shipping_cost numeric DEFAULT 0 NOT NULL,
  delivery_address text,
  delivery_postal_code text,
  delivery_city text,
  customer_note text,
  internal_notes text,
  source text DEFAULT 'website'::text NOT NULL,
  share_token text DEFAULT replace((gen_random_uuid())::text, '-'::text, ''::text) NOT NULL,
  deposit_amount numeric DEFAULT 0 NOT NULL,
  payment_status text DEFAULT 'unpaid'::text NOT NULL,
  picked_up_at timestamp with time zone,
  returned_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid DEFAULT auth.uid(),
  client_fingerprint text
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.organizations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  org_number text,
  email text,
  notes text,
  is_active boolean DEFAULT true NOT NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  parent_id uuid,
  item_prefix text,
  next_item_number bigint DEFAULT 1 NOT NULL,
  item_prefix_locked boolean DEFAULT false NOT NULL
);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.price_rules (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  equipment_id uuid,
  name text DEFAULT ''::text NOT NULL,
  kind text NOT NULL,
  from_day integer,
  to_day integer,
  day_price numeric,
  weekdays integer[] DEFAULT '{}'::integer[] NOT NULL,
  starts_on date,
  ends_on date,
  adjust_type text,
  adjust_value numeric DEFAULT 0 NOT NULL,
  priority integer DEFAULT 0 NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid DEFAULT auth.uid()
);
ALTER TABLE public.price_rules ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.product_components (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  parent_equipment_id uuid NOT NULL,
  child_equipment_id uuid NOT NULL,
  quantity integer DEFAULT 1 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid DEFAULT auth.uid()
);
ALTER TABLE public.product_components ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  email text,
  full_name text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.serial_codes (
  code text NOT NULL,
  equipment_id uuid,
  stock_item_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  kind text DEFAULT 'current'::text NOT NULL,
  replaced_at timestamp with time zone
);
ALTER TABLE public.serial_codes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.serial_counters (
  scope text NOT NULL,
  last_value bigint NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.serial_counters ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.shipping_zones (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  cities text[] DEFAULT '{}'::text[] NOT NULL,
  postal_prefixes text[] DEFAULT '{}'::text[] NOT NULL,
  base_fee numeric DEFAULT 0 NOT NULL,
  per_km numeric DEFAULT 0 NOT NULL,
  distance_km numeric DEFAULT 0 NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid DEFAULT auth.uid()
);
ALTER TABLE public.shipping_zones ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.site_page_overrides (
  page_key text NOT NULL,
  page_type text NOT NULL,
  slug text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  image text,
  price_from numeric,
  sv jsonb DEFAULT '{}'::jsonb NOT NULL,
  en jsonb DEFAULT '{}'::jsonb NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.site_page_overrides ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.stock_item_assignments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_line_id uuid NOT NULL,
  stock_item_id uuid NOT NULL,
  checked_out_at timestamp with time zone,
  returned_at timestamp with time zone,
  damaged boolean DEFAULT false NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid DEFAULT auth.uid()
);
ALTER TABLE public.stock_item_assignments ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.stock_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  equipment_id uuid NOT NULL,
  identifier text NOT NULL,
  barcode text,
  status text DEFAULT 'in_stock'::text NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  barcode_type text DEFAULT 'code128'::text NOT NULL,
  created_by uuid DEFAULT auth.uid(),
  unit_number text DEFAULT ''::text NOT NULL,
  qr_token text DEFAULT ''::text NOT NULL,
  serial_number text,
  location text,
  import_batch text,
  is_test boolean DEFAULT false NOT NULL,
  label_print_count integer DEFAULT 0 NOT NULL,
  label_last_printed_at timestamp with time zone,
  serial_code text DEFAULT ''::text NOT NULL,
  sn_series_id uuid,
  sn_org_no bigint,
  sn_item_no integer
);
ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.tax_rates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  percent numeric DEFAULT 25 NOT NULL,
  is_default boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  created_by uuid DEFAULT auth.uid()
);
ALTER TABLE public.tax_rates ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.unit_movements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  stock_item_id uuid NOT NULL,
  action text NOT NULL,
  from_status text,
  to_status text,
  order_id uuid,
  reference text,
  note text,
  forced boolean DEFAULT false NOT NULL,
  performed_by uuid DEFAULT auth.uid(),
  performed_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.unit_movements ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.unit_reports (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  stock_item_id uuid NOT NULL,
  report_type text NOT NULL,
  reporter_role text NOT NULL,
  message text NOT NULL,
  reporter_name text,
  reporter_phone text,
  reporter_email text,
  status text DEFAULT 'new'::text NOT NULL,
  handled_by uuid,
  handled_at timestamp with time zone,
  admin_note text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.unit_reports ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  role app_role NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.admin_email_allowlist ADD CONSTRAINT admin_email_allowlist_email_check CHECK (((email = lower(btrim(email))) AND (POSITION(('@'::text) IN (email)) > 1)));
ALTER TABLE public.admin_email_allowlist ADD CONSTRAINT admin_email_allowlist_note_check CHECK (((note IS NULL) OR (char_length(note) <= 500)));
ALTER TABLE public.admin_email_allowlist ADD CONSTRAINT admin_email_allowlist_pkey PRIMARY KEY (email);
ALTER TABLE public.business_rules ADD CONSTRAINT business_rules_singleton CHECK (id);
ALTER TABLE public.business_rules ADD CONSTRAINT business_rules_pkey PRIMARY KEY (id);
ALTER TABLE public.customers ADD CONSTRAINT customers_pkey PRIMARY KEY (id);
ALTER TABLE public.equipment ADD CONSTRAINT equipment_category_not_blank CHECK ((btrim(category) <> ''::text));
ALTER TABLE public.equipment ADD CONSTRAINT equipment_comment_length CHECK (((comment IS NULL) OR (char_length(comment) <= 2000)));
ALTER TABLE public.equipment ADD CONSTRAINT equipment_deposit_type_check CHECK ((deposit_type = ANY (ARRAY['none'::text, 'fixed'::text, 'percent'::text])));
ALTER TABLE public.equipment ADD CONSTRAINT equipment_item_code_format CHECK (((item_code IS NULL) OR (item_code ~ '^[A-Z]{2}$'::text)));
ALTER TABLE public.equipment ADD CONSTRAINT equipment_item_kind_check CHECK ((item_kind = ANY (ARRAY['rental'::text, 'service'::text, 'bundle'::text])));
ALTER TABLE public.equipment ADD CONSTRAINT equipment_label_print_count_check CHECK ((label_print_count >= 0));
ALTER TABLE public.equipment ADD CONSTRAINT equipment_next_unit_number_positive CHECK ((next_unit_number >= 1));
ALTER TABLE public.equipment ADD CONSTRAINT equipment_rate_unit_check CHECK ((rate_unit = ANY (ARRAY['hour'::text, 'day'::text, 'week'::text, 'month'::text, 'fixed'::text])));
ALTER TABLE public.equipment ADD CONSTRAINT equipment_serial_code_format CHECK ((serial_code ~ '^[A-Z]{1,6}[0-9]{3}-[A-Z]{2}[0-9]{3}(-[0-9]{2,})?$'::text));
ALTER TABLE public.equipment ADD CONSTRAINT equipment_item_root_org_id_fkey FOREIGN KEY (item_root_org_id) REFERENCES organizations(id);
ALTER TABLE public.equipment ADD CONSTRAINT equipment_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES organizations(id);
ALTER TABLE public.equipment ADD CONSTRAINT equipment_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES equipment(id) ON DELETE CASCADE;
ALTER TABLE public.equipment ADD CONSTRAINT equipment_tax_rate_id_fkey FOREIGN KEY (tax_rate_id) REFERENCES tax_rates(id) ON DELETE SET NULL;
ALTER TABLE public.equipment ADD CONSTRAINT equipment_pkey PRIMARY KEY (id);
ALTER TABLE public.equipment ADD CONSTRAINT equipment_serial_code_key UNIQUE (serial_code);
ALTER TABLE public.leads ADD CONSTRAINT leads_pkey PRIMARY KEY (id);
ALTER TABLE public.offer_items ADD CONSTRAINT offer_items_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE SET NULL;
ALTER TABLE public.offer_items ADD CONSTRAINT offer_items_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE;
ALTER TABLE public.offer_items ADD CONSTRAINT offer_items_pkey PRIMARY KEY (id);
ALTER TABLE public.offers ADD CONSTRAINT offers_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;
ALTER TABLE public.offers ADD CONSTRAINT offers_pkey PRIMARY KEY (id);
ALTER TABLE public.offers ADD CONSTRAINT offers_share_token_key UNIQUE (share_token);
ALTER TABLE public.order_events ADD CONSTRAINT order_events_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
ALTER TABLE public.order_events ADD CONSTRAINT order_events_pkey PRIMARY KEY (id);
ALTER TABLE public.order_lines ADD CONSTRAINT order_lines_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE SET NULL;
ALTER TABLE public.order_lines ADD CONSTRAINT order_lines_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
ALTER TABLE public.order_lines ADD CONSTRAINT order_lines_pkey PRIMARY KEY (id);
ALTER TABLE public.orders ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD CONSTRAINT orders_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD CONSTRAINT orders_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD CONSTRAINT orders_shipping_zone_id_fkey FOREIGN KEY (shipping_zone_id) REFERENCES shipping_zones(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD CONSTRAINT orders_pkey PRIMARY KEY (id);
ALTER TABLE public.orders ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);
ALTER TABLE public.orders ADD CONSTRAINT orders_share_token_key UNIQUE (share_token);
ALTER TABLE public.organizations ADD CONSTRAINT organizations_item_prefix_format CHECK (((item_prefix IS NULL) OR (item_prefix ~ '^[A-Z]{1,6}$'::text)));
ALTER TABLE public.organizations ADD CONSTRAINT organizations_next_item_number_positive CHECK ((next_item_number >= 1));
ALTER TABLE public.organizations ADD CONSTRAINT organizations_not_own_parent CHECK (((parent_id IS NULL) OR (parent_id <> id)));
ALTER TABLE public.organizations ADD CONSTRAINT organizations_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES organizations(id);
ALTER TABLE public.organizations ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);
ALTER TABLE public.organizations ADD CONSTRAINT organizations_name_key UNIQUE (name);
ALTER TABLE public.price_rules ADD CONSTRAINT price_rules_adjust_type_check CHECK ((adjust_type = ANY (ARRAY['percent'::text, 'amount'::text])));
ALTER TABLE public.price_rules ADD CONSTRAINT price_rules_kind_check CHECK ((kind = ANY (ARRAY['tier'::text, 'calendar'::text])));
ALTER TABLE public.price_rules ADD CONSTRAINT price_rules_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE;
ALTER TABLE public.price_rules ADD CONSTRAINT price_rules_pkey PRIMARY KEY (id);
ALTER TABLE public.product_components ADD CONSTRAINT product_components_child_equipment_id_fkey FOREIGN KEY (child_equipment_id) REFERENCES equipment(id) ON DELETE CASCADE;
ALTER TABLE public.product_components ADD CONSTRAINT product_components_parent_equipment_id_fkey FOREIGN KEY (parent_equipment_id) REFERENCES equipment(id) ON DELETE CASCADE;
ALTER TABLE public.product_components ADD CONSTRAINT product_components_pkey PRIMARY KEY (id);
ALTER TABLE public.product_components ADD CONSTRAINT product_components_parent_equipment_id_child_equipment_id_key UNIQUE (parent_equipment_id, child_equipment_id);
ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE public.serial_codes ADD CONSTRAINT serial_codes_kind_check CHECK ((kind = ANY (ARRAY['current'::text, 'alias'::text, 'review'::text])));
ALTER TABLE public.serial_codes ADD CONSTRAINT serial_codes_single_owner CHECK (((equipment_id IS NULL) OR (stock_item_id IS NULL)));
ALTER TABLE public.serial_codes ADD CONSTRAINT serial_codes_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE SET NULL;
ALTER TABLE public.serial_codes ADD CONSTRAINT serial_codes_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES stock_items(id) ON DELETE SET NULL;
ALTER TABLE public.serial_codes ADD CONSTRAINT serial_codes_pkey PRIMARY KEY (code);
ALTER TABLE public.serial_counters ADD CONSTRAINT serial_counters_last_value_check CHECK ((last_value >= 0));
ALTER TABLE public.serial_counters ADD CONSTRAINT serial_counters_pkey PRIMARY KEY (scope);
ALTER TABLE public.shipping_zones ADD CONSTRAINT shipping_zones_pkey PRIMARY KEY (id);
ALTER TABLE public.site_page_overrides ADD CONSTRAINT site_page_overrides_pkey PRIMARY KEY (page_key);
ALTER TABLE public.stock_item_assignments ADD CONSTRAINT stock_item_assignments_order_line_id_fkey FOREIGN KEY (order_line_id) REFERENCES order_lines(id) ON DELETE CASCADE;
ALTER TABLE public.stock_item_assignments ADD CONSTRAINT stock_item_assignments_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES stock_items(id) ON DELETE CASCADE;
ALTER TABLE public.stock_item_assignments ADD CONSTRAINT stock_item_assignments_pkey PRIMARY KEY (id);
ALTER TABLE public.stock_item_assignments ADD CONSTRAINT stock_item_assignments_order_line_id_stock_item_id_key UNIQUE (order_line_id, stock_item_id);
ALTER TABLE public.stock_items ADD CONSTRAINT stock_items_label_print_count_check CHECK ((label_print_count >= 0));
ALTER TABLE public.stock_items ADD CONSTRAINT stock_items_serial_code_format CHECK ((serial_code ~ '^[A-Z]{1,6}[0-9]{3}-[A-Z]{2}[0-9]{3}(-[0-9]{2,})?$'::text));
ALTER TABLE public.stock_items ADD CONSTRAINT stock_items_status_check CHECK ((status = ANY (ARRAY['in_stock'::text, 'with_customer'::text, 'service'::text, 'damaged'::text, 'retired'::text])));
ALTER TABLE public.stock_items ADD CONSTRAINT stock_items_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE;
ALTER TABLE public.stock_items ADD CONSTRAINT stock_items_sn_series_id_fkey FOREIGN KEY (sn_series_id) REFERENCES organizations(id);
ALTER TABLE public.stock_items ADD CONSTRAINT stock_items_pkey PRIMARY KEY (id);
ALTER TABLE public.stock_items ADD CONSTRAINT stock_items_equipment_id_identifier_key UNIQUE (equipment_id, identifier);
ALTER TABLE public.stock_items ADD CONSTRAINT stock_items_qr_token_key UNIQUE (qr_token);
ALTER TABLE public.stock_items ADD CONSTRAINT stock_items_serial_code_key UNIQUE (serial_code);
ALTER TABLE public.stock_items ADD CONSTRAINT stock_items_unit_number_key UNIQUE (unit_number);
ALTER TABLE public.tax_rates ADD CONSTRAINT tax_rates_pkey PRIMARY KEY (id);
ALTER TABLE public.unit_movements ADD CONSTRAINT unit_movements_action_check CHECK ((action = ANY (ARRAY['check_out'::text, 'check_in'::text, 'status_change'::text, 'created'::text, 'sn_changed'::text])));
ALTER TABLE public.unit_movements ADD CONSTRAINT unit_movements_note_check CHECK (((note IS NULL) OR (char_length(note) <= 2000)));
ALTER TABLE public.unit_movements ADD CONSTRAINT unit_movements_reference_check CHECK (((reference IS NULL) OR (char_length(reference) <= 200)));
ALTER TABLE public.unit_movements ADD CONSTRAINT unit_movements_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
ALTER TABLE public.unit_movements ADD CONSTRAINT unit_movements_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES stock_items(id) ON DELETE RESTRICT;
ALTER TABLE public.unit_movements ADD CONSTRAINT unit_movements_pkey PRIMARY KEY (id);
ALTER TABLE public.unit_reports ADD CONSTRAINT unit_reports_admin_note_check CHECK (((admin_note IS NULL) OR (char_length(admin_note) <= 2000)));
ALTER TABLE public.unit_reports ADD CONSTRAINT unit_reports_message_check CHECK (((char_length(message) >= 1) AND (char_length(message) <= 2000)));
ALTER TABLE public.unit_reports ADD CONSTRAINT unit_reports_report_type_check CHECK ((report_type = ANY (ARRAY['note'::text, 'fault'::text])));
ALTER TABLE public.unit_reports ADD CONSTRAINT unit_reports_reporter_email_check CHECK (((reporter_email IS NULL) OR (char_length(reporter_email) <= 200)));
ALTER TABLE public.unit_reports ADD CONSTRAINT unit_reports_reporter_name_check CHECK (((reporter_name IS NULL) OR (char_length(reporter_name) <= 120)));
ALTER TABLE public.unit_reports ADD CONSTRAINT unit_reports_reporter_phone_check CHECK (((reporter_phone IS NULL) OR (char_length(reporter_phone) <= 40)));
ALTER TABLE public.unit_reports ADD CONSTRAINT unit_reports_reporter_role_check CHECK ((reporter_role = ANY (ARRAY['customer'::text, 'staff'::text])));
ALTER TABLE public.unit_reports ADD CONSTRAINT unit_reports_status_check CHECK ((status = ANY (ARRAY['new'::text, 'handled'::text])));
ALTER TABLE public.unit_reports ADD CONSTRAINT unit_reports_stock_item_id_fkey FOREIGN KEY (stock_item_id) REFERENCES stock_items(id) ON DELETE CASCADE;
ALTER TABLE public.unit_reports ADD CONSTRAINT unit_reports_pkey PRIMARY KEY (id);
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);

CREATE INDEX customers_email_lower_idx ON public.customers USING btree (lower(email));
CREATE UNIQUE INDEX equipment_barcode_idx ON public.equipment USING btree (barcode) WHERE (barcode IS NOT NULL);
CREATE UNIQUE INDEX equipment_item_seq_key ON public.equipment USING btree (item_root_org_id, item_seq) WHERE (item_seq IS NOT NULL);
CREATE INDEX equipment_legacy_barcode_idx ON public.equipment USING btree (upper(legacy_barcode)) WHERE (legacy_barcode IS NOT NULL);
CREATE INDEX equipment_organization_id_idx ON public.equipment USING btree (organization_id);
CREATE INDEX equipment_parent_idx ON public.equipment USING btree (parent_id);
CREATE INDEX leads_client_fingerprint_created_at_idx ON public.leads USING btree (client_fingerprint, created_at);
CREATE INDEX leads_created_idx ON public.leads USING btree (created_at);
CREATE INDEX leads_email_lower_idx ON public.leads USING btree (lower(email));
CREATE INDEX idx_offer_items_offer ON public.offer_items USING btree (offer_id);
CREATE INDEX idx_offers_lead ON public.offers USING btree (lead_id);
CREATE INDEX order_events_order_idx ON public.order_events USING btree (order_id, created_at DESC);
CREATE INDEX order_lines_equipment_dates_idx ON public.order_lines USING btree (equipment_id, starts_on, ends_on);
CREATE INDEX order_lines_order_idx ON public.order_lines USING btree (order_id);
CREATE INDEX order_lines_window_idx ON public.order_lines USING btree (equipment_id, starts_at, ends_at);
CREATE INDEX orders_fingerprint_created_idx ON public.orders USING btree (client_fingerprint, created_at) WHERE (client_fingerprint IS NOT NULL);
CREATE INDEX orders_source_created_idx ON public.orders USING btree (source, created_at);
CREATE INDEX orders_status_dates_idx ON public.orders USING btree (status, starts_on, ends_on);
CREATE UNIQUE INDEX organizations_item_prefix_key ON public.organizations USING btree (item_prefix) WHERE (item_prefix IS NOT NULL);
CREATE INDEX price_rules_lookup_idx ON public.price_rules USING btree (kind, equipment_id, is_active);
CREATE UNIQUE INDEX serial_codes_equipment_current_key ON public.serial_codes USING btree (equipment_id) WHERE ((equipment_id IS NOT NULL) AND (kind = 'current'::text));
CREATE INDEX serial_codes_equipment_idx ON public.serial_codes USING btree (equipment_id) WHERE (equipment_id IS NOT NULL);
CREATE UNIQUE INDEX serial_codes_stock_item_current_key ON public.serial_codes USING btree (stock_item_id) WHERE ((stock_item_id IS NOT NULL) AND (kind = 'current'::text));
CREATE INDEX serial_codes_stock_item_idx ON public.serial_codes USING btree (stock_item_id) WHERE (stock_item_id IS NOT NULL);
CREATE UNIQUE INDEX stock_items_barcode_key ON public.stock_items USING btree (barcode) WHERE (barcode IS NOT NULL);
CREATE INDEX stock_items_equipment_idx ON public.stock_items USING btree (equipment_id, status);
CREATE UNIQUE INDEX stock_items_equipment_serial_key ON public.stock_items USING btree (equipment_id, lower(serial_number)) WHERE (serial_number IS NOT NULL);
CREATE INDEX stock_items_import_batch_idx ON public.stock_items USING btree (import_batch) WHERE (import_batch IS NOT NULL);
CREATE UNIQUE INDEX stock_items_sn_item_key ON public.stock_items USING btree (equipment_id, sn_item_no);
CREATE UNIQUE INDEX stock_items_sn_series_org_key ON public.stock_items USING btree (sn_series_id, sn_org_no);
CREATE UNIQUE INDEX stock_items_unit_number_upper_key ON public.stock_items USING btree (upper(unit_number));
CREATE INDEX unit_movements_item_time_idx ON public.unit_movements USING btree (stock_item_id, performed_at DESC);
CREATE INDEX unit_movements_order_idx ON public.unit_movements USING btree (order_id) WHERE (order_id IS NOT NULL);
CREATE INDEX unit_reports_item_time_idx ON public.unit_reports USING btree (stock_item_id, created_at DESC);
CREATE INDEX unit_reports_status_idx ON public.unit_reports USING btree (status);

CREATE OR REPLACE FUNCTION public.admin_email_allowlist_after_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.user_roles r
  USING auth.users u
  WHERE r.user_id = u.id AND lower(u.email) = OLD.email AND r.role = OLD.role;
  RETURN OLD;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_email_allowlist_after_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.grant_allowlisted_admin(u.id)
  FROM auth.users u
  WHERE lower(u.email) = NEW.email AND u.email_confirmed_at IS NOT NULL;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_email_allowlist_after_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role OR NEW.email IS DISTINCT FROM OLD.email THEN
    DELETE FROM public.user_roles r
    USING auth.users u
    WHERE r.user_id = u.id AND lower(u.email) = OLD.email AND r.role = OLD.role;
    -- Same rule as grant_allowlisted_admin: invited or confirmed via the email flow.
    INSERT INTO public.user_roles (user_id, role)
    SELECT u.id, NEW.role FROM auth.users u
    WHERE lower(u.email) = NEW.email
      AND u.email_confirmed_at IS NOT NULL
      AND (u.confirmation_sent_at IS NOT NULL OR u.invited_at IS NOT NULL)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_email_allowlist_normalize()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.email := lower(btrim(NEW.email));
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.allocate_item_id(_equipment_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  e public.equipment;
  v_root uuid;
  v_prefix text;
  v_seq integer;
  v_copy integer;
  v_id text;
BEGIN
  SELECT * INTO e FROM public.equipment WHERE id = _equipment_id FOR UPDATE;
  IF e.id IS NULL THEN RAISE EXCEPTION 'unknown_item'; END IF;
  IF e.organization_id IS NULL THEN RAISE EXCEPTION 'product_has_no_organization'; END IF;

  IF e.item_seq IS NULL THEN
    SELECT COALESCE(o.parent_id, o.id) INTO v_root FROM public.organizations o WHERE o.id = e.organization_id;
    UPDATE public.organizations o
       SET next_item_number = o.next_item_number + 1, item_prefix_locked = true
     WHERE o.id = v_root AND o.item_prefix IS NOT NULL
     RETURNING o.next_item_number - 1 INTO v_seq;
    IF v_seq IS NULL THEN RAISE EXCEPTION 'organization_prefix_missing'; END IF;
    UPDATE public.equipment
       SET item_seq = v_seq, item_root_org_id = v_root,
           item_code = COALESCE(item_code, public.derive_item_code(name))
     WHERE id = e.id
     RETURNING * INTO e;
  END IF;

  SELECT o.item_prefix INTO v_prefix FROM public.organizations o WHERE o.id = e.item_root_org_id;
  LOOP
    UPDATE public.equipment SET next_unit_number = next_unit_number + 1
     WHERE id = e.id RETURNING next_unit_number - 1 INTO v_copy;
    v_id := v_prefix || lpad(e.item_seq::text, 3, '0') || e.item_code || lpad(v_copy::text, 3, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.stock_items s WHERE upper(s.unit_number) = v_id);
  END LOOP;
  RETURN v_id;
END $function$
;

CREATE OR REPLACE FUNCTION public.allocate_unit_serial(_equipment_id uuid, OUT series_id uuid, OUT org_no bigint, OUT item_no integer, OUT serial text)
 RETURNS record
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_org uuid; v_cc text; v_cat text; v_prefix text; v_n bigint; v_code text;
BEGIN
  SELECT e.organization_id, e.sn_category_code, e.category INTO v_org, v_cc, v_cat
  FROM public.equipment e WHERE e.id = _equipment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown_item'; END IF;
  v_cc := COALESCE(v_cc, public.serial_category_code(v_cat));
  series_id := public.serial_series_root(v_org);
  v_prefix := public.serial_series_prefix(series_id);

  LOOP
    INSERT INTO public.serial_counters AS c (scope, last_value) VALUES ('item:' || _equipment_id::text, 1)
    ON CONFLICT (scope) DO UPDATE SET last_value = c.last_value + 1, updated_at = now()
    RETURNING c.last_value INTO v_n;
    IF v_n > 999 THEN RAISE EXCEPTION 'item_unit_limit: an item can have at most 999 units'; END IF;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.stock_items s WHERE s.equipment_id = _equipment_id AND s.sn_item_no = v_n);
  END LOOP;
  item_no := v_n;

  LOOP
    INSERT INTO public.serial_counters AS c (scope, last_value) VALUES ('units:' || COALESCE(series_id::text, 'none'), 1)
    ON CONFLICT (scope) DO UPDATE SET last_value = c.last_value + 1, updated_at = now()
    RETURNING c.last_value INTO v_n;
    v_code := public.format_unit_serial_code(v_prefix, v_cc, v_n, item_no);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.stock_items s WHERE s.sn_series_id IS NOT DISTINCT FROM series_id AND s.sn_org_no = v_n)
      AND NOT EXISTS (SELECT 1 FROM public.serial_codes sc WHERE sc.code = v_code);
  END LOOP;
  org_no := v_n;
  serial := v_code;

  IF series_id IS NOT NULL THEN
    UPDATE public.organizations SET item_prefix_locked = true WHERE id = series_id AND NOT item_prefix_locked;
  END IF;
END $function$
;

CREATE OR REPLACE FUNCTION public.available_quantity(_equipment_id uuid, _start date, _end date, _exclude_order uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.available_quantity_at(_equipment_id, _start::timestamptz, (_end + 1)::timestamptz, _exclude_order);
$function$
;

CREATE OR REPLACE FUNCTION public.available_quantity_at(_equipment_id uuid, _start timestamp with time zone, _end timestamp with time zone, _exclude_order uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN (SELECT item_kind FROM public.equipment WHERE id = _equipment_id) = 'service' THEN 2147483647
    ELSE LEAST(
      GREATEST(
        public.equipment_total_units(_equipment_id)
          - public.equipment_reserved_at(_equipment_id, _start, _end, _exclude_order),
        0
      ),
      COALESCE((
        SELECT MIN(
          FLOOR(
            GREATEST(
              public.equipment_total_units(pc.child_equipment_id)
                - public.equipment_reserved_at(pc.child_equipment_id, _start, _end, _exclude_order),
              0
            )::numeric / GREATEST(pc.quantity, 1)
          )
        )::int
        FROM public.product_components pc
        WHERE pc.parent_equipment_id = _equipment_id
      ), 2147483647)
    )
  END;
$function$
;

CREATE OR REPLACE FUNCTION public.confirm_order(_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order public.orders;
  v_line RECORD;
  v_free INTEGER;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF NOT (public.has_role(auth.uid(), 'admin')
          OR (public.has_role(auth.uid(), 'tester') AND v_order.created_by = auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF v_order.status NOT IN ('pending', 'draft') THEN
    RAISE EXCEPTION 'order_not_pending:%', v_order.status;
  END IF;

  -- Lock every product (and kit component) this order needs, in a stable order.
  PERFORM 1 FROM public.equipment e
  WHERE e.id IN (
    SELECT l.equipment_id FROM public.order_lines l WHERE l.order_id = _order_id AND l.equipment_id IS NOT NULL
    UNION
    SELECT pc.child_equipment_id FROM public.order_lines l
    JOIN public.product_components pc ON pc.parent_equipment_id = l.equipment_id
    WHERE l.order_id = _order_id
  )
  ORDER BY e.id
  FOR UPDATE;

  PERFORM set_config('app.order_confirm', 'on', true);
  UPDATE public.orders SET status = 'reserved' WHERE id = _order_id RETURNING * INTO v_order;
  PERFORM set_config('app.order_confirm', 'off', true);

  -- With this order now counted, no product or component may be overbooked.
  FOR v_line IN
    SELECT DISTINCT e.id, e.name, l.starts_at, l.ends_at
    FROM public.order_lines l
    JOIN public.equipment e ON e.id = l.equipment_id
    WHERE l.order_id = _order_id AND e.item_kind <> 'service'
    UNION
    SELECT DISTINCT e.id, e.name, l.starts_at, l.ends_at
    FROM public.order_lines l
    JOIN public.product_components pc ON pc.parent_equipment_id = l.equipment_id
    JOIN public.equipment e ON e.id = pc.child_equipment_id
    WHERE l.order_id = _order_id AND e.item_kind <> 'service'
  LOOP
    v_free := public.equipment_total_units(v_line.id)
      - public.equipment_reserved_at(v_line.id, v_line.starts_at, v_line.ends_at, NULL);
    IF v_free < 0 THEN
      RAISE EXCEPTION 'unavailable:%:%', v_line.name,
        GREATEST(public.equipment_total_units(v_line.id)
          - public.equipment_reserved_at(v_line.id, v_line.starts_at, v_line.ends_at, _order_id), 0);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('id', v_order.id, 'order_number', v_order.order_number, 'status', v_order.status);
END $function$
;

CREATE OR REPLACE FUNCTION public.convert_stock_to_units(_equipment_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_out jsonb := '[]'::jsonb;
  v_id uuid;
  v_plan jsonb;
  v_codes text[];
  v_batch text := 'stock-conversion-' || to_char(now() AT TIME ZONE 'Europe/Stockholm', 'YYYY-MM-DD');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  FOR v_id IN SELECT DISTINCT x FROM unnest(COALESCE(_equipment_ids, ARRAY[]::uuid[])) x LOOP
    -- Lock the item, then re-plan, so a repeated or concurrent run never creates duplicates.
    PERFORM 1 FROM public.equipment WHERE id = v_id FOR UPDATE;
    v_plan := public.stock_conversion_plan(v_id);
    CONTINUE WHEN v_plan IS NULL;
    v_codes := ARRAY[]::text[];
    IF v_plan->>'status' = 'convert' THEN
      IF (v_plan->>'to_create')::int > 0 THEN
        SELECT COALESCE(array_agg(c.serial_code), ARRAY[]::text[]) INTO v_codes
        FROM public.create_units(v_id, (v_plan->>'to_create')::int, NULL, v_batch, NULL, false) c;
      END IF;
      UPDATE public.equipment SET tracking = 'serialized' WHERE id = v_id AND tracking <> 'serialized';
    END IF;
    v_out := v_out || jsonb_build_array(v_plan || jsonb_build_object(
      'result', CASE WHEN v_plan->>'status' = 'convert' THEN 'converted' ELSE 'skipped' END,
      'created_codes', to_jsonb(v_codes)));
  END LOOP;
  RETURN v_out;
END $function$
;

CREATE OR REPLACE FUNCTION public.create_booking(_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start DATE := (_payload->>'starts_on')::DATE;
  v_end DATE := (_payload->>'ends_on')::DATE;
  v_email TEXT := lower(trim(COALESCE(_payload->>'customer_email', '')));
  v_fingerprint TEXT := NULLIF(left(trim(COALESCE(_payload->>'client_fingerprint', '')), 128), '');
  v_started_ms BIGINT;
  v_customer UUID;
  v_order public.orders;
  v_line RECORD;
  v_equipment public.equipment;
  v_days INTEGER;
  v_available INTEGER;
  v_rules public.business_rules;
  v_method TEXT := COALESCE(NULLIF(_payload->>'shipping_method', ''), 'pickup');
  v_ship JSONB;
  v_price JSONB;
  v_deposit NUMERIC := 0;
  v_lines JSONB;
  v_line_count INTEGER;
  v_total_units BIGINT;
  v_bad_qty BOOLEAN;
BEGIN
  -- Honeypot: pretend success, store nothing.
  IF length(trim(COALESCE(_payload->>'website', ''))) > 0 THEN
    RETURN jsonb_build_object(
      'id', gen_random_uuid(),
      'order_number', 'AV-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 4)),
      'share_token', replace(gen_random_uuid()::text, '-', ''),
      'status', 'pending'
    );
  END IF;

  -- Minimum form fill time (3 s).
  BEGIN
    v_started_ms := (_payload->>'form_started_at')::BIGINT;
  EXCEPTION WHEN others THEN
    v_started_ms := NULL;
  END;
  IF v_started_ms IS NULL
     OR (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT - v_started_ms < 3000 THEN
    RAISE EXCEPTION 'too_fast';
  END IF;

  IF v_start IS NULL OR v_end IS NULL OR v_end < v_start THEN
    RAISE EXCEPTION 'invalid_dates';
  END IF;
  IF length(trim(COALESCE(_payload->>'customer_name', ''))) < 2 THEN RAISE EXCEPTION 'invalid_name'; END IF;
  IF length(v_email) > 200 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'invalid_email'; END IF;

  -- Serialise website bookings so the rate-limit counts below are exact.
  PERFORM pg_advisory_xact_lock(hashtext('public.create_booking'));

  IF (SELECT count(*) FROM public.orders o
      WHERE o.source = 'website' AND o.created_at > now() - interval '1 hour') >= 60 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;
  IF (SELECT count(*) FROM public.orders o JOIN public.customers c ON c.id = o.customer_id
      WHERE o.source = 'website' AND lower(c.email) = v_email
        AND o.created_at > now() - interval '1 hour') >= 3 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;
  IF (SELECT count(*) FROM public.orders o JOIN public.customers c ON c.id = o.customer_id
      WHERE o.source = 'website' AND lower(c.email) = v_email
        AND o.created_at > now() - interval '1 day') >= 10 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;
  IF (SELECT count(*) FROM public.orders o
      WHERE o.client_fingerprint = v_fingerprint
        AND o.created_at > now() - interval '1 hour') >= 10 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  SELECT * INTO v_rules FROM public.business_rules WHERE id LIMIT 1;
  v_days := (v_end - v_start) + 1;
  IF v_rules.min_rental_days IS NOT NULL AND v_days < v_rules.min_rental_days THEN
    RAISE EXCEPTION 'min_rental_days:%', v_rules.min_rental_days;
  END IF;
  IF v_rules.lead_time_days IS NOT NULL AND v_start < CURRENT_DATE + v_rules.lead_time_days THEN
    RAISE EXCEPTION 'lead_time_days:%', v_rules.lead_time_days;
  END IF;
  IF v_rules.max_horizon_days IS NOT NULL AND v_start > CURRENT_DATE + v_rules.max_horizon_days THEN
    RAISE EXCEPTION 'too_far_ahead';
  END IF;
  IF jsonb_typeof(_payload->'items') IS DISTINCT FROM 'array'
     OR jsonb_array_length(_payload->'items') = 0 THEN
    RAISE EXCEPTION 'empty_cart';
  END IF;

  -- Merge duplicate lines per item; validate counts and quantities.
  BEGIN
    SELECT jsonb_agg(jsonb_build_object('equipment_id', s.eid, 'quantity', s.qty) ORDER BY s.eid),
           count(*), COALESCE(SUM(s.qty), 0), COALESCE(bool_or(s.qty IS NULL OR s.qty < 1), false)
    INTO v_lines, v_line_count, v_total_units, v_bad_qty
    FROM (
      SELECT (i->>'equipment_id')::UUID AS eid, SUM((i->>'quantity')::INTEGER) AS qty
      FROM jsonb_array_elements(_payload->'items') i
      GROUP BY 1
    ) s;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'unknown_item';
  END;
  IF v_line_count > 20 THEN RAISE EXCEPTION 'too_many_items'; END IF;
  IF v_bad_qty THEN RAISE EXCEPTION 'invalid_quantity'; END IF;
  IF v_total_units > 200 THEN RAISE EXCEPTION 'too_many_units'; END IF;

  PERFORM 1 FROM public.equipment e
  WHERE e.id IN (SELECT (x->>'equipment_id')::UUID FROM jsonb_array_elements(v_lines) x)
  ORDER BY e.id
  FOR UPDATE;

  v_ship := public.shipping_cost_for(
    v_method,
    NULLIF(_payload->>'shipping_zone_id', '')::UUID,
    NULLIF(_payload->>'delivery_postal_code', ''),
    NULLIF(_payload->>'delivery_city', '')
  );

  INSERT INTO public.customers (name, email, phone, company, address, postal_code, city)
  VALUES (
    left(trim(_payload->>'customer_name'), 120),
    v_email,
    left(COALESCE(NULLIF(trim(_payload->>'customer_phone'), ''), ''), 40),
    NULLIF(left(trim(COALESCE(_payload->>'customer_company', '')), 120), ''),
    NULLIF(left(trim(COALESCE(_payload->>'delivery_address', '')), 200), ''),
    NULLIF(left(trim(COALESCE(_payload->>'delivery_postal_code', '')), 20), ''),
    NULLIF(left(trim(COALESCE(_payload->>'delivery_city', '')), 80), '')
  ) RETURNING id INTO v_customer;

  INSERT INTO public.orders (
    customer_id, status, starts_on, ends_on, shipping_method, shipping_zone_id, shipping_cost,
    delivery_address, delivery_postal_code, delivery_city, customer_note, vat_percent, source,
    client_fingerprint
  ) VALUES (
    v_customer, 'pending', v_start, v_end, v_method,
    NULLIF(v_ship->>'zone_id', '')::UUID,
    COALESCE((v_ship->>'cost')::NUMERIC, 0),
    NULLIF(left(trim(COALESCE(_payload->>'delivery_address', '')), 200), ''),
    NULLIF(left(trim(COALESCE(_payload->>'delivery_postal_code', '')), 20), ''),
    NULLIF(left(trim(COALESCE(_payload->>'delivery_city', '')), 80), ''),
    NULLIF(left(trim(COALESCE(_payload->>'customer_note', '')), 2000), ''),
    COALESCE(v_rules.vat_percent, 25),
    'website',
    v_fingerprint
  ) RETURNING * INTO v_order;

  FOR v_line IN
    SELECT (x->>'equipment_id')::UUID AS equipment_id, (x->>'quantity')::INTEGER AS quantity
    FROM jsonb_array_elements(v_lines) x
  LOOP
    SELECT * INTO v_equipment FROM public.equipment WHERE id = v_line.equipment_id AND is_active;
    IF v_equipment.id IS NULL THEN RAISE EXCEPTION 'unknown_item'; END IF;

    IF v_equipment.item_kind <> 'service' THEN
      v_available := public.available_quantity(v_equipment.id, v_start, v_end, v_order.id);
      IF v_line.quantity > v_available THEN
        RAISE EXCEPTION 'unavailable:%:%', v_equipment.name, v_available;
      END IF;
    END IF;

    v_price := public.price_for(v_equipment.id, v_start, v_end, v_line.quantity);
    v_deposit := v_deposit + COALESCE((v_price->>'deposit')::NUMERIC, 0);

    INSERT INTO public.order_lines (
      order_id, equipment_id, description, quantity, days, unit_price, starts_on, ends_on,
      sort_order, tax_percent, deposit_amount
    ) VALUES (
      v_order.id, v_equipment.id, v_equipment.name, v_line.quantity,
      GREATEST(COALESCE((v_price->>'units')::NUMERIC, v_days), 1)::INTEGER,
      COALESCE((v_price->>'unit_price')::NUMERIC, v_equipment.daily_price),
      v_start, v_end, v_equipment.sort_order,
      COALESCE((v_price->>'tax_percent')::NUMERIC, 25),
      COALESCE((v_price->>'deposit')::NUMERIC, 0)
    );
  END LOOP;

  UPDATE public.orders SET deposit_amount = v_deposit
  WHERE id = v_order.id RETURNING * INTO v_order;

  RETURN jsonb_build_object(
    'id', v_order.id,
    'order_number', v_order.order_number,
    'share_token', v_order.share_token,
    'status', v_order.status
  );
END $function$
;

CREATE OR REPLACE FUNCTION public.create_units(_equipment_id uuid, _count integer, _serials text[] DEFAULT NULL::text[], _batch text DEFAULT NULL::text, _location text DEFAULT NULL::text, _is_test boolean DEFAULT false)
 RETURNS TABLE(id uuid, unit_number text, qr_token text, serial_number text, serial_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_equipment public.equipment;
  v_serials text[];
  v_dupes text;
  v_n integer;
  v_ids uuid[];
  v_batch text := NULLIF(left(btrim(COALESCE(_batch, '')), 120), '');
  v_location text := NULLIF(left(btrim(COALESCE(_location, '')), 200), '');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT * INTO v_equipment FROM public.equipment e WHERE e.id = _equipment_id FOR UPDATE;
  IF v_equipment.id IS NULL THEN RAISE EXCEPTION 'unknown_item'; END IF;
  IF v_equipment.item_kind IN ('service', 'bundle') THEN
    RAISE EXCEPTION 'item_kind_not_trackable:%', v_equipment.item_kind;
  END IF;

  IF _serials IS NOT NULL THEN
    SELECT COALESCE(array_agg(t.s ORDER BY t.ord), ARRAY[]::text[]) INTO v_serials
    FROM (
      SELECT btrim(x) AS s, ord FROM unnest(_serials) WITH ORDINALITY AS u(x, ord)
      WHERE x IS NOT NULL AND btrim(x) <> ''
    ) t;

    IF cardinality(v_serials) = 0 THEN RAISE EXCEPTION 'no_serials'; END IF;

    SELECT string_agg(d.s, ', ') INTO v_dupes FROM (
      SELECT min(s) AS s FROM unnest(v_serials) s GROUP BY lower(s) HAVING count(*) > 1
    ) d;
    IF v_dupes IS NOT NULL THEN
      RAISE EXCEPTION 'duplicate_serials_in_input: %', v_dupes;
    END IF;

    SELECT string_agg(s.serial_number, ', ' ORDER BY s.serial_number) INTO v_dupes
    FROM public.stock_items s
    WHERE s.equipment_id = _equipment_id
      AND lower(s.serial_number) IN (SELECT lower(x) FROM unnest(v_serials) x);
    IF v_dupes IS NOT NULL THEN
      RAISE EXCEPTION 'duplicate_serials: %', v_dupes;
    END IF;

    v_n := cardinality(v_serials);
  ELSE
    v_n := COALESCE(_count, 0);
  END IF;

  IF v_n < 1 OR v_n > 1000 THEN RAISE EXCEPTION 'invalid_count: 1..1000 units per call'; END IF;

  IF v_equipment.tracking <> 'serialized' THEN
    UPDATE public.equipment e SET tracking = 'serialized' WHERE e.id = _equipment_id;
  END IF;

  WITH ins AS (
    INSERT INTO public.stock_items (equipment_id, identifier, serial_number, import_batch, location, is_test)
    SELECT _equipment_id, NULL, CASE WHEN v_serials IS NULL THEN NULL ELSE v_serials[g] END,
           v_batch, v_location, COALESCE(_is_test, false)
    FROM generate_series(1, v_n) g
    ORDER BY g
    RETURNING stock_items.id
  )
  SELECT array_agg(ins.id) INTO v_ids FROM ins;

  INSERT INTO public.unit_movements (stock_item_id, action, from_status, to_status, reference, performed_by)
  SELECT s.id, 'created', NULL, s.status, v_batch, auth.uid()
  FROM public.stock_items s WHERE s.id = ANY (v_ids);

  -- Creation order (the order the S/N numbers were issued in).
  RETURN QUERY
  SELECT s.id, s.unit_number, s.qr_token, s.serial_number, s.serial_code
  FROM public.stock_items s
  WHERE s.id = ANY (v_ids)
  ORDER BY array_position(v_ids, s.id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_item(_equipment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item public.equipment;
  v_ids uuid[];
  v_units uuid[];
  v_blocked text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO v_item FROM public.equipment e WHERE e.id = _equipment_id FOR UPDATE;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'unknown_item'; END IF;
  IF NOT public.has_role(auth.uid(), 'admin')
     AND NOT (public.has_role(auth.uid(), 'tester') AND v_item.created_by = auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- The item and its variants go together.
  SELECT array_agg(e.id) INTO v_ids
  FROM public.equipment e WHERE e.id = _equipment_id OR e.parent_id = _equipment_id;

  IF EXISTS (SELECT 1 FROM public.order_lines ol WHERE ol.equipment_id = ANY(v_ids)) THEN
    RAISE EXCEPTION 'item_on_orders';
  END IF;

  SELECT COALESCE(array_agg(s.id), ARRAY[]::uuid[]) INTO v_units
  FROM public.stock_items s WHERE s.equipment_id = ANY(v_ids);

  SELECT string_agg(s.serial_code, ', ' ORDER BY s.serial_code) INTO v_blocked
  FROM public.stock_items s
  WHERE s.id = ANY(v_units) AND public.unit_has_rental_history(s.id);
  IF v_blocked IS NOT NULL THEN
    RAISE EXCEPTION 'unit_has_rental_history:%', v_blocked;
  END IF;

  PERFORM set_config('app.unit_purge', 'on', true);
  DELETE FROM public.unit_movements m WHERE m.stock_item_id = ANY(v_units);
  DELETE FROM public.stock_items s WHERE s.id = ANY(v_units);
  PERFORM set_config('app.unit_purge', 'off', true);

  -- S/N codes stay in serial_codes (links cleared by FK) so they are never issued again.
  DELETE FROM public.equipment e WHERE e.id = ANY(v_ids);
  RETURN jsonb_build_object('items', cardinality(v_ids), 'units', cardinality(v_units));
END;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_units(_unit_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_blocked text;
  v_n integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT public.has_role(auth.uid(), 'admin') AND EXISTS (
    SELECT 1 FROM public.stock_items s
    WHERE s.id = ANY(_unit_ids)
      AND NOT (public.has_role(auth.uid(), 'tester') AND s.created_by = auth.uid())
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT string_agg(s.serial_code, ', ' ORDER BY s.serial_code) INTO v_blocked
  FROM public.stock_items s
  WHERE s.id = ANY(_unit_ids) AND public.unit_has_rental_history(s.id);
  IF v_blocked IS NOT NULL THEN
    RAISE EXCEPTION 'unit_has_rental_history:%', v_blocked;
  END IF;

  PERFORM set_config('app.unit_purge', 'on', true);
  DELETE FROM public.unit_movements m WHERE m.stock_item_id = ANY(_unit_ids);
  DELETE FROM public.stock_items s WHERE s.id = ANY(_unit_ids);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM set_config('app.unit_purge', 'off', true);
  RETURN v_n;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.derive_item_code(_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN length(l) >= 2 THEN left(l, 1) || right(l, 1) WHEN length(l) = 1 THEN l || l ELSE 'XX' END
  FROM (SELECT public.letters_only(_name) AS l) t
$function$
;

CREATE OR REPLACE FUNCTION public.derive_org_prefix(_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(NULLIF(left(string_agg(left(public.letters_only(w), 1), '' ORDER BY ord), 6), ''), 'X')
  FROM regexp_split_to_table(COALESCE(_name, ''), '[[:space:]‐‑–—-]+') WITH ORDINALITY AS t(w, ord)
  WHERE public.letters_only(w) <> ''
$function$
;

CREATE OR REPLACE FUNCTION public.equipment_assign_serial_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_prefix text; v_n bigint; v_code text;
BEGIN
  NEW.sn_category_code := public.serial_category_code(NEW.category);
  LOOP
    SELECT s.prefix, s.n INTO v_prefix, v_n FROM public.next_org_serial_number(NEW.organization_id) s;
    v_code := public.format_unit_serial_code(v_prefix, NEW.sn_category_code, v_n, 0);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.serial_codes sc WHERE sc.code = v_code);
  END LOOP;
  NEW.sn_prefix := v_prefix;
  NEW.sn_org_no := v_n;
  NEW.serial_code := v_code;
  NEW.legacy_barcode := NULL;
  IF NEW.barcode IS NULL OR btrim(NEW.barcode) = '' THEN
    NEW.barcode := NEW.serial_code;
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.equipment_autobarcode()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.barcode IS NULL OR btrim(NEW.barcode) = '' THEN
    NEW.barcode := COALESCE(NEW.serial_code, public.generate_barcode_value());
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.equipment_lock_item_id_parts()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_root uuid;
BEGIN
  IF OLD.item_seq IS NOT NULL THEN
    IF NEW.item_seq IS DISTINCT FROM OLD.item_seq OR NEW.item_root_org_id IS DISTINCT FROM OLD.item_root_org_id THEN
      RAISE EXCEPTION 'item_number_locked';
    END IF;
    IF NEW.item_code IS DISTINCT FROM OLD.item_code THEN
      RAISE EXCEPTION 'item_code_locked';
    END IF;
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      SELECT COALESCE(o.parent_id, o.id) INTO v_root FROM public.organizations o WHERE o.id = NEW.organization_id;
      IF v_root IS DISTINCT FROM OLD.item_root_org_id THEN
        RAISE EXCEPTION 'product_organization_locked';
      END IF;
    END IF;
  END IF;
  IF NEW.next_unit_number < OLD.next_unit_number THEN
    RAISE EXCEPTION 'item_number_cannot_decrease';
  END IF;
  NEW.item_code := NULLIF(upper(btrim(COALESCE(NEW.item_code, ''))), '');
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.equipment_require_organization()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.parent_id IS NOT NULL THEN
    SELECT organization_id INTO NEW.organization_id FROM public.equipment WHERE id = NEW.parent_id;
  END IF;
  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'Parent organization is required';
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.equipment_reserved(_equipment_id uuid, _start date, _end date, _exclude_order uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.equipment_reserved_at(_equipment_id, _start::timestamptz, (_end + 1)::timestamptz, _exclude_order);
$function$
;

CREATE OR REPLACE FUNCTION public.equipment_reserved_at(_equipment_id uuid, _start timestamp with time zone, _end timestamp with time zone, _exclude_order uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(SUM(demand), 0)::int FROM (
    SELECT l.quantity AS demand
    FROM public.order_lines l
    JOIN public.orders o ON o.id = l.order_id
    WHERE l.equipment_id = _equipment_id
      AND o.status IN ('reserved', 'picked_up')
      AND (_exclude_order IS NULL OR o.id <> _exclude_order)
      AND l.starts_at < _end
      AND l.ends_at > _start
    UNION ALL
    SELECT l.quantity * pc.quantity AS demand
    FROM public.order_lines l
    JOIN public.orders o ON o.id = l.order_id
    JOIN public.product_components pc ON pc.parent_equipment_id = l.equipment_id
    WHERE pc.child_equipment_id = _equipment_id
      AND o.status IN ('reserved', 'picked_up')
      AND (_exclude_order IS NULL OR o.id <> _exclude_order)
      AND l.starts_at < _end
      AND l.ends_at > _start
  ) d;
$function$
;

CREATE OR REPLACE FUNCTION public.equipment_serial_code_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.serial_code IS DISTINCT FROM OLD.serial_code THEN RAISE EXCEPTION 'serial_code_immutable'; END IF;
  IF OLD.legacy_barcode IS NOT NULL AND NEW.legacy_barcode IS DISTINCT FROM OLD.legacy_barcode THEN
    RAISE EXCEPTION 'legacy_barcode_immutable';
  END IF;
  IF OLD.sn_org_no IS NOT NULL AND (
    NEW.sn_org_no IS DISTINCT FROM OLD.sn_org_no
    OR NEW.sn_prefix IS DISTINCT FROM OLD.sn_prefix
    OR NEW.sn_category_code IS DISTINCT FROM OLD.sn_category_code
  ) THEN
    RAISE EXCEPTION 'serial_base_immutable';
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.equipment_total_units(_equipment_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN e.tracking = 'serialized' THEN (
      SELECT count(*)::int FROM public.stock_items s
      WHERE s.equipment_id = e.id AND s.status IN ('in_stock', 'with_customer')
    )
    ELSE e.quantity
  END
  FROM public.equipment e WHERE e.id = _equipment_id;
$function$
;

CREATE OR REPLACE FUNCTION public.equipment_validate_barcode()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v text := upper(btrim(COALESCE(NEW.barcode, '')));
BEGIN
  IF v = '' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.barcode IS NOT DISTINCT FROM OLD.barcode THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.serial_codes c
             WHERE upper(c.code) = v
               AND NOT (c.stock_item_id IS NULL AND c.equipment_id = NEW.id))
     OR EXISTS (SELECT 1 FROM public.equipment e
             WHERE e.id <> NEW.id
               AND v IN (upper(e.barcode), upper(e.serial_code), upper(e.legacy_barcode)))
     OR EXISTS (SELECT 1 FROM public.stock_items s
             WHERE v IN (upper(s.barcode), upper(s.serial_code), upper(s.unit_number))) THEN
    RAISE EXCEPTION 'barcode_in_use:%', NEW.barcode;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.format_unit_serial_code(_prefix text, _category_code text, _n_org bigint, _n_unit bigint)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE k bigint;
BEGIN
  IF _n_org IS NULL OR _n_org < 1 OR _n_unit IS NULL OR _n_unit < 0 THEN RAISE EXCEPTION 'invalid_serial_counter'; END IF;
  IF _n_unit > 999 THEN RAISE EXCEPTION 'item_unit_limit: an item can have at most 999 units'; END IF;
  k := (_n_org - 1) / 999;
  RETURN _prefix || lpad((((_n_org - 1) % 999) + 1)::text, 3, '0')
    || '-' || _category_code || lpad(_n_unit::text, 3, '0')
    || CASE WHEN k >= 1 THEN '-' || CASE WHEN k < 100 THEN lpad(k::text, 2, '0') ELSE k::text END ELSE '' END;
END $function$
;

CREATE OR REPLACE FUNCTION public.generate_barcode_value()
 RETURNS text
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  SELECT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
$function$
;

CREATE OR REPLACE FUNCTION public.get_public_offer(_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_offer public.offers;
BEGIN
  IF _token IS NULL OR _token !~ '^[a-f0-9]{32}$' THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_offer FROM public.offers
  WHERE share_token = _token AND status <> 'draft';
  IF v_offer.id IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'offer_number', v_offer.offer_number,
    'title', v_offer.title,
    'customer_name', v_offer.customer_name,
    'rental_start', v_offer.rental_start,
    'rental_end', v_offer.rental_end,
    'valid_until', v_offer.valid_until,
    'discount_percent', v_offer.discount_percent,
    'vat_percent', v_offer.vat_percent,
    'intro', v_offer.intro,
    'terms', v_offer.terms,
    'status', v_offer.status,
    'sent_at', v_offer.sent_at,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', i.id,
        'description', i.description,
        'quantity', i.quantity,
        'days', i.days,
        'unit_price', i.unit_price,
        'sort_order', i.sort_order
      ) ORDER BY i.sort_order, i.created_at)
      FROM public.offer_items i WHERE i.offer_id = v_offer.id
    ), '[]'::jsonb)
  );
END $function$
;

CREATE OR REPLACE FUNCTION public.get_public_unit(_token text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'unit_number', s.unit_number,
    'serial_code', s.serial_code,
    'name', e.name,
    'image_url', e.image_url,
    'description', CASE
      WHEN e.description IS NULL THEN NULL
      WHEN char_length(e.description) > 300 THEN left(e.description, 297) || '…'
      ELSE e.description
    END,
    'page_type', e.page_type,
    'page_slug', e.page_slug,
    'is_retired', s.status = 'retired'
  )
  FROM public.stock_items s
  JOIN public.equipment e ON e.id = s.equipment_id
  WHERE _token IS NOT NULL
    AND char_length(_token) BETWEEN 16 AND 64
    AND s.qr_token = btrim(_token)
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.grant_allowlisted_admin(_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only accounts that were invited or went through the confirmation email flow.
  INSERT INTO public.user_roles (user_id, role)
  SELECT u.id, a.role
  FROM auth.users u
  JOIN public.admin_email_allowlist a ON a.email = lower(u.email)
  WHERE u.id = _user_id
    AND u.email_confirmed_at IS NOT NULL
    AND (u.confirmation_sent_at IS NOT NULL OR u.invited_at IS NOT NULL)
  ON CONFLICT DO NOTHING;
  RETURN FOUND;
END $function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  -- Roles are granted only to allowlisted, email-confirmed accounts.
  PERFORM public.grant_allowlisted_admin(NEW.id);
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.handle_user_email_confirmed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.grant_allowlisted_admin(NEW.id);
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$function$
;

CREATE OR REPLACE FUNCTION public.letters_only(_s text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT regexp_replace(upper(translate(
    replace(replace(replace(replace(replace(COALESCE(_s, ''), 'ß', 'ss'), 'æ', 'ae'), 'Æ', 'AE'), 'œ', 'oe'), 'Œ', 'OE'),
    'åäáàâãāăąÅÄÁÀÂÃĀĂĄçćčÇĆČďĎđĐéèêëēėęěÉÈÊËĒĖĘĚíìîïīįÍÌÎÏĪĮłŁñńňÑŃŇöóòôõøōőÖÓÒÔÕØŌŐřŘšśşŠŚŞťŤüúùûūůűÜÚÙÛŪŮŰýÿÝžźżŽŹŻ',
    'aaaaaaaaaAAAAAAAAAcccCCCdDdDeeeeeeeeEEEEEEEEiiiiiiIIIIIIlLnnnNNNooooooooOOOOOOOOrRsssSSStTuuuuuuuUUUUUUUyyYzzzZZZ'
  )), '[^A-Z]', '', 'g')
$function$
;

CREATE OR REPLACE FUNCTION public.new_qr_token()
 RETURNS text
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  SELECT encode(extensions.gen_random_bytes(16), 'hex');
$function$
;

CREATE OR REPLACE FUNCTION public.next_org_serial_number(_org_id uuid, OUT prefix text, OUT n bigint)
 RETURNS record
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_root uuid;
BEGIN
  v_root := public.serial_series_root(_org_id);
  prefix := public.serial_series_prefix(v_root);
  INSERT INTO public.serial_counters AS c (scope, last_value) VALUES ('products:' || COALESCE(v_root::text, 'none'), 1)
  ON CONFLICT (scope) DO UPDATE SET last_value = c.last_value + 1, updated_at = now()
  RETURNING c.last_value INTO n;
  IF v_root IS NOT NULL THEN
    UPDATE public.organizations SET item_prefix_locked = true WHERE id = v_root AND NOT item_prefix_locked;
  END IF;
END $function$
;

CREATE OR REPLACE FUNCTION public.next_stock_unit_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n bigint := nextval('public.stock_unit_number_seq');
BEGIN
  RETURN 'RM-' || CASE WHEN n < 1000000 THEN lpad(n::text, 6, '0') ELSE n::text END;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.next_unit_serial_code(_equipment_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix text; v_org bigint; v_cc text; v_n bigint; v_code text;
BEGIN
  SELECT e.sn_prefix, e.sn_org_no, e.sn_category_code INTO v_prefix, v_org, v_cc
  FROM public.equipment e WHERE e.id = _equipment_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'item_has_no_serial_base'; END IF;
  LOOP
    INSERT INTO public.serial_counters AS c (scope, last_value) VALUES ('item:' || _equipment_id::text, 1)
    ON CONFLICT (scope) DO UPDATE SET last_value = c.last_value + 1, updated_at = now()
    RETURNING c.last_value INTO v_n;
    v_code := public.format_unit_serial_code(v_prefix, v_cc, v_org, v_n);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.serial_codes sc WHERE sc.code = v_code);
  END LOOP;
  RETURN v_code;
END $function$
;

CREATE OR REPLACE FUNCTION public.order_lines_set_window()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE o public.orders;
BEGIN
  IF NEW.starts_at IS NULL OR NEW.ends_at IS NULL THEN
    SELECT * INTO o FROM public.orders WHERE id = NEW.order_id;
    IF NEW.starts_at IS NULL THEN
      NEW.starts_at := COALESCE(NEW.starts_on, o.starts_on)::timestamptz;
    END IF;
    IF NEW.ends_at IS NULL THEN
      NEW.ends_at := (COALESCE(NEW.ends_on, o.ends_on) + 1)::timestamptz;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.orders_log_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.order_events (order_id, from_status, to_status, created_by)
    VALUES (NEW.id, NULL, NEW.status, auth.uid());
  ELSIF NEW.status <> OLD.status THEN
    -- Lets stock_items_log_status_change link unit movements to this order.
    PERFORM set_config('app.order_id', NEW.id::text, true);
    INSERT INTO public.order_events (order_id, from_status, to_status, created_by)
    VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
    -- move serialized units in/out of the warehouse
    IF NEW.status = 'picked_up' THEN
      UPDATE public.stock_items s SET status = 'with_customer'
      WHERE s.id IN (
        SELECT a.stock_item_id FROM public.stock_item_assignments a
        JOIN public.order_lines l ON l.id = a.order_line_id
        WHERE l.order_id = NEW.id
      ) AND s.status = 'in_stock';
      UPDATE public.stock_item_assignments a SET checked_out_at = COALESCE(a.checked_out_at, now())
      WHERE a.order_line_id IN (SELECT id FROM public.order_lines WHERE order_id = NEW.id);
    ELSIF NEW.status IN ('returned', 'completed', 'cancelled') THEN
      UPDATE public.stock_items s SET status = 'in_stock'
      WHERE s.id IN (
        SELECT a.stock_item_id FROM public.stock_item_assignments a
        JOIN public.order_lines l ON l.id = a.order_line_id
        WHERE l.order_id = NEW.id AND a.damaged = false
      ) AND s.status = 'with_customer';
      UPDATE public.stock_items s SET status = 'damaged'
      WHERE s.id IN (
        SELECT a.stock_item_id FROM public.stock_item_assignments a
        JOIN public.order_lines l ON l.id = a.order_line_id
        WHERE l.order_id = NEW.id AND a.damaged = true
      );
      UPDATE public.stock_item_assignments a SET returned_at = COALESCE(a.returned_at, now())
      WHERE a.order_line_id IN (SELECT id FROM public.order_lines WHERE order_id = NEW.id);
    END IF;
    PERFORM set_config('app.order_id', '', true);
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.orders_validate_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE allowed TEXT[];
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  allowed := CASE OLD.status
    WHEN 'pending' THEN ARRAY['reserved', 'cancelled']
    WHEN 'draft' THEN ARRAY['reserved', 'cancelled']
    WHEN 'reserved' THEN ARRAY['picked_up', 'cancelled', 'draft']
    WHEN 'picked_up' THEN ARRAY['returned']
    WHEN 'returned' THEN ARRAY['completed', 'picked_up']
    WHEN 'completed' THEN ARRAY[]::TEXT[]
    WHEN 'cancelled' THEN ARRAY['draft']
    ELSE ARRAY[]::TEXT[]
  END;
  IF NOT (NEW.status = ANY (allowed)) THEN
    RAISE EXCEPTION 'Invalid order status transition: % -> %', OLD.status, NEW.status;
  END IF;
  -- A pending website request (or a draft) is only reserved through confirm_order(), which
  -- re-checks availability under row locks.
  IF OLD.status IN ('pending', 'draft') AND NEW.status = 'reserved'
     AND COALESCE(current_setting('app.order_confirm', true), '') <> 'on' THEN
    RAISE EXCEPTION 'use_confirm_order';
  END IF;
  IF NEW.status = 'picked_up' AND NEW.picked_up_at IS NULL THEN NEW.picked_up_at := now(); END IF;
  IF NEW.status = 'returned' AND NEW.returned_at IS NULL THEN NEW.returned_at := now(); END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.organizations_validate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.item_prefix := NULLIF(upper(btrim(COALESCE(NEW.item_prefix, ''))), '');
  IF NEW.parent_id IS NULL AND NEW.item_prefix IS NULL THEN
    NEW.item_prefix := public.derive_org_prefix(NEW.name);
  END IF;
  IF NEW.parent_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.organizations p WHERE p.id = NEW.parent_id AND p.parent_id IS NOT NULL) THEN
      RAISE EXCEPTION 'parent_must_be_main_organization';
    END IF;
    IF TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM public.organizations c WHERE c.parent_id = NEW.id) THEN
      RAISE EXCEPTION 'organization_has_sub_organizations';
    END IF;
    NEW.item_prefix := NULL;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.item_prefix_locked AND NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN
      RAISE EXCEPTION 'series_parent_locked';
    END IF;
    IF OLD.item_prefix_locked AND NEW.next_item_number < OLD.next_item_number THEN
      RAISE EXCEPTION 'item_number_cannot_decrease';
    END IF;
    IF OLD.item_prefix_locked AND NOT NEW.item_prefix_locked THEN
      NEW.item_prefix_locked := true;
    END IF;
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.preview_serial_codes(_equipment_ids uuid[])
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_out text[] := ARRAY[]::text[];
  v_item jsonb := '{}'::jsonb;
  v_series jsonb := '{}'::jsonb;
  v_id uuid; v_org uuid; v_cc text; v_root uuid; v_key text; v_prefix text;
  v_i bigint; v_o bigint; v_code text;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tester')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF cardinality(COALESCE(_equipment_ids, ARRAY[]::uuid[])) > 5000 THEN RAISE EXCEPTION 'too_many_items'; END IF;
  FOREACH v_id IN ARRAY COALESCE(_equipment_ids, ARRAY[]::uuid[]) LOOP
    SELECT e.organization_id, COALESCE(e.sn_category_code, public.serial_category_code(e.category)) INTO v_org, v_cc
    FROM public.equipment e WHERE e.id = v_id;
    IF NOT FOUND THEN v_out := v_out || NULL::text; CONTINUE; END IF;
    v_root := public.serial_series_root(v_org);
    v_key := COALESCE(v_root::text, 'none');
    v_prefix := public.serial_series_prefix(v_root);

    v_i := COALESCE((v_item->>v_id::text)::bigint,
      (SELECT c.last_value FROM public.serial_counters c WHERE c.scope = 'item:' || v_id::text), 0);
    LOOP
      v_i := v_i + 1;
      EXIT WHEN v_i > 999 OR NOT EXISTS (SELECT 1 FROM public.stock_items s WHERE s.equipment_id = v_id AND s.sn_item_no = v_i);
    END LOOP;
    v_item := v_item || jsonb_build_object(v_id::text, v_i);
    IF v_i > 999 THEN v_out := v_out || NULL::text; CONTINUE; END IF;

    v_o := COALESCE((v_series->>v_key)::bigint,
      (SELECT c.last_value FROM public.serial_counters c WHERE c.scope = 'units:' || v_key), 0);
    LOOP
      v_o := v_o + 1;
      v_code := public.format_unit_serial_code(v_prefix, v_cc, v_o, v_i);
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.stock_items s WHERE s.sn_series_id IS NOT DISTINCT FROM v_root AND s.sn_org_no = v_o)
        AND NOT EXISTS (SELECT 1 FROM public.serial_codes sc WHERE sc.code = v_code);
    END LOOP;
    v_series := v_series || jsonb_build_object(v_key, v_o);
    v_out := v_out || v_code;
  END LOOP;
  RETURN v_out;
END $function$
;

CREATE OR REPLACE FUNCTION public.price_for(_equipment_id uuid, _start date, _end date, _qty integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  e public.equipment;
  v_days INTEGER := 0;
  v_qty INTEGER := GREATEST(COALESCE(_qty, 1), 1);
  v_units NUMERIC := 0;
  v_day INTEGER;
  v_date DATE;
  v_price NUMERIC;
  v_sum NUMERIC := 0;
  v_tax NUMERIC;
  v_deposit NUMERIC := 0;
  r RECORD;
BEGIN
  SELECT * INTO e FROM public.equipment WHERE id = _equipment_id;
  IF e.id IS NULL THEN
    RETURN jsonb_build_object('error', 'unknown_item');
  END IF;

  IF _start IS NOT NULL AND _end IS NOT NULL AND _end >= _start THEN
    v_days := (_end - _start) + 1;
  END IF;

  SELECT percent INTO v_tax FROM public.tax_rates WHERE id = e.tax_rate_id;
  IF v_tax IS NULL THEN
    SELECT vat_percent INTO v_tax FROM public.business_rules LIMIT 1;
  END IF;
  v_tax := COALESCE(v_tax, 25);

  IF e.item_kind = 'service' OR e.rate_unit = 'fixed' THEN
    v_units := 1;
    v_sum := COALESCE(NULLIF(e.fixed_price, 0), e.daily_price);
  ELSIF e.rate_unit = 'day' THEN
    v_units := v_days;
    FOR v_day IN 1..v_days LOOP
      v_date := _start + (v_day - 1);

      SELECT pr.day_price INTO v_price
      FROM public.price_rules pr
      WHERE pr.is_active AND pr.kind = 'tier'
        AND (pr.equipment_id = e.id OR pr.equipment_id IS NULL)
        AND pr.day_price IS NOT NULL
        AND v_day >= COALESCE(pr.from_day, 1)
        AND v_day <= COALESCE(pr.to_day, 100000)
      ORDER BY (pr.equipment_id IS NOT NULL) DESC, pr.priority DESC
      LIMIT 1;

      v_price := COALESCE(v_price, e.daily_price);

      FOR r IN
        SELECT * FROM public.price_rules pr
        WHERE pr.is_active AND pr.kind = 'calendar'
          AND (pr.equipment_id = e.id OR pr.equipment_id IS NULL)
          AND (pr.starts_on IS NULL OR v_date >= pr.starts_on)
          AND (pr.ends_on IS NULL OR v_date <= pr.ends_on)
          AND (cardinality(pr.weekdays) = 0 OR EXTRACT(DOW FROM v_date)::int = ANY (pr.weekdays))
        ORDER BY pr.priority
      LOOP
        IF r.adjust_type = 'percent' THEN
          v_price := v_price * (1 + r.adjust_value / 100);
        ELSIF r.adjust_type = 'amount' THEN
          v_price := v_price + r.adjust_value;
        END IF;
      END LOOP;

      v_sum := v_sum + GREATEST(v_price, 0);
    END LOOP;
  ELSE
    v_units := CASE e.rate_unit
      WHEN 'hour' THEN v_days * 24
      WHEN 'week' THEN CEIL(v_days::numeric / 7)
      WHEN 'month' THEN CEIL(v_days::numeric / 30)
      ELSE v_days
    END;
    v_sum := v_units * e.daily_price;
  END IF;

  v_sum := ROUND(v_sum * v_qty);

  IF e.deposit_type = 'fixed' THEN
    v_deposit := ROUND(e.deposit_value * v_qty);
  ELSIF e.deposit_type = 'percent' THEN
    v_deposit := ROUND(v_sum * e.deposit_value / 100);
  END IF;

  RETURN jsonb_build_object(
    'days', v_days,
    'units', v_units,
    'quantity', v_qty,
    'unit_price', CASE WHEN v_units > 0 THEN ROUND(v_sum / (v_units * v_qty), 2) ELSE ROUND(v_sum / v_qty, 2) END,
    'subtotal', v_sum,
    'deposit', v_deposit,
    'tax_percent', v_tax,
    'tax', ROUND(v_sum * v_tax / 100),
    'total', v_sum + ROUND(v_sum * v_tax / 100),
    'rate_unit', e.rate_unit,
    'item_kind', e.item_kind
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.record_label_print(_unit_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_count integer;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tester')) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.stock_items s
     SET label_print_count = s.label_print_count + 1,
         label_last_printed_at = now()
   WHERE s.id IN (SELECT DISTINCT x FROM unnest(COALESCE(_unit_ids, ARRAY[]::uuid[])) x);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.register_serial_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'equipment' THEN
    INSERT INTO public.serial_codes (code, equipment_id) VALUES (NEW.serial_code, NEW.id);
  ELSE
    INSERT INTO public.serial_codes (code, stock_item_id) VALUES (NEW.serial_code, NEW.id);
  END IF;
  RETURN NULL;
END $function$
;

CREATE OR REPLACE FUNCTION public.resolve_shipping(_method text, _zone_id uuid, _postal text, _city text)
 RETURNS shipping_zones
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_zone public.shipping_zones;
BEGIN
  IF COALESCE(_method, 'pickup') <> 'delivery' THEN RETURN NULL; END IF;
  IF _zone_id IS NOT NULL THEN
    SELECT * INTO v_zone FROM public.shipping_zones WHERE id = _zone_id AND is_active;
    IF v_zone.id IS NOT NULL THEN RETURN v_zone; END IF;
  END IF;
  IF _city IS NOT NULL AND _city <> '' THEN
    SELECT * INTO v_zone FROM public.shipping_zones z
    WHERE z.is_active AND EXISTS (
      SELECT 1 FROM unnest(z.cities) c WHERE lower(c) = lower(trim(_city))
    ) ORDER BY z.sort_order LIMIT 1;
    IF v_zone.id IS NOT NULL THEN RETURN v_zone; END IF;
  END IF;
  IF _postal IS NOT NULL AND _postal <> '' THEN
    SELECT * INTO v_zone FROM public.shipping_zones z
    WHERE z.is_active AND EXISTS (
      SELECT 1 FROM unnest(z.postal_prefixes) p
      WHERE replace(_postal, ' ', '') LIKE p || '%'
    ) ORDER BY length((SELECT p FROM unnest(z.postal_prefixes) p WHERE replace(_postal, ' ', '') LIKE p || '%' LIMIT 1)) DESC, z.sort_order
    LIMIT 1;
    IF v_zone.id IS NOT NULL THEN RETURN v_zone; END IF;
  END IF;
  SELECT * INTO v_zone FROM public.shipping_zones z WHERE z.is_active ORDER BY z.sort_order DESC LIMIT 1;
  RETURN v_zone;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.scan_lookup(_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  code text := regexp_replace(btrim(COALESCE(_code, '')), '^S/N:?\s*', '', 'i');
  ucode text;
  url_token text := substring(btrim(COALESCE(_code, '')) FROM '/i/([A-Za-z0-9_-]+)');
  reg public.serial_codes;
  result jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tester')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  ucode := upper(code);

  IF url_token IS NULL AND ucode <> '' THEN
    SELECT * INTO reg FROM public.serial_codes WHERE serial_codes.code = ucode AND serial_codes.kind <> 'review';
    IF reg.stock_item_id IS NOT NULL THEN
      SELECT jsonb_build_object('kind', 'unit', 'stock_item_id', s.id, 'identifier', s.identifier,
        'unit_number', s.unit_number, 'serial_code', s.serial_code, 'qr_token', s.qr_token, 'status', s.status,
        'equipment_id', e.id, 'equipment_name', e.name,
        'matched_alias', CASE WHEN reg.kind = 'alias' THEN reg.code ELSE NULL END) INTO result
      FROM public.stock_items s JOIN public.equipment e ON e.id = s.equipment_id
      WHERE s.id = reg.stock_item_id;
      IF result IS NOT NULL THEN RETURN result; END IF;
    ELSIF reg.equipment_id IS NOT NULL THEN
      SELECT jsonb_build_object('kind', 'product', 'equipment_id', e.id, 'equipment_name', e.name, 'sku', e.sku,
        'serial_code', e.serial_code, 'legacy_barcode', e.legacy_barcode) INTO result
      FROM public.equipment e WHERE e.id = reg.equipment_id;
      IF result IS NOT NULL THEN RETURN result; END IF;
    END IF;
  END IF;

  IF url_token IS NULL THEN
    SELECT jsonb_build_object('kind', 'order', 'order_id', o.id, 'order_number', o.order_number,
      'status', o.status, 'starts_on', o.starts_on, 'ends_on', o.ends_on, 'customer', c.name) INTO result
    FROM public.orders o LEFT JOIN public.customers c ON c.id = o.customer_id
    WHERE upper(o.order_number) = ucode OR o.share_token = code
    LIMIT 1;
    IF result IS NOT NULL THEN RETURN result; END IF;
  END IF;

  SELECT jsonb_build_object('kind', 'unit', 'stock_item_id', s.id, 'identifier', s.identifier,
    'unit_number', s.unit_number, 'serial_code', s.serial_code, 'qr_token', s.qr_token, 'status', s.status,
    'equipment_id', e.id, 'equipment_name', e.name) INTO result
  FROM public.stock_items s JOIN public.equipment e ON e.id = s.equipment_id
  WHERE CASE
    WHEN url_token IS NOT NULL THEN s.qr_token = url_token
    ELSE s.qr_token = code OR upper(s.unit_number) = ucode OR s.barcode = code OR upper(s.identifier) = ucode
  END
  ORDER BY (s.qr_token = COALESCE(url_token, code)) DESC, (upper(s.unit_number) = ucode) DESC
  LIMIT 1;
  IF result IS NOT NULL THEN RETURN result; END IF;

  IF url_token IS NULL THEN
    SELECT jsonb_build_object('kind', 'product', 'equipment_id', e.id, 'equipment_name', e.name, 'sku', e.sku,
      'serial_code', e.serial_code, 'legacy_barcode', e.legacy_barcode) INTO result
    FROM public.equipment e
    WHERE upper(e.legacy_barcode) = ucode OR e.barcode = code OR upper(COALESCE(e.sku, '')) = ucode
    ORDER BY (upper(e.legacy_barcode) = ucode) DESC NULLS LAST
    LIMIT 1;
    IF result IS NOT NULL THEN RETURN result; END IF;
  END IF;

  RETURN jsonb_build_object('kind', 'unknown', 'code', code,
    'review', EXISTS (SELECT 1 FROM public.serial_codes sc WHERE sc.code = ucode AND sc.kind = 'review'));
END $function$
;

CREATE OR REPLACE FUNCTION public.serial_category_code(_category text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE WHEN length(l) >= 2 THEN left(l, 1) || right(l, 1) WHEN length(l) = 1 THEN l || l ELSE 'XX' END
  FROM (SELECT public.letters_only(_category) AS l) t
$function$
;

CREATE OR REPLACE FUNCTION public.serial_series_prefix(_root uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT COALESCE(NULLIF(public.letters_only(o.item_prefix), ''), public.derive_org_prefix(o.name))
     FROM public.organizations o WHERE o.id = _root),
    'X')
$function$
;

CREATE OR REPLACE FUNCTION public.serial_series_root(_org_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_root uuid := _org_id; v_parent uuid; v_depth integer := 0;
BEGIN
  WHILE v_root IS NOT NULL LOOP
    SELECT o.parent_id INTO v_parent FROM public.organizations o WHERE o.id = v_root;
    IF NOT FOUND THEN v_root := NULL; EXIT; END IF;
    EXIT WHEN v_parent IS NULL;
    v_root := v_parent;
    v_depth := v_depth + 1;
    IF v_depth > 20 THEN RAISE EXCEPTION 'organization_cycle'; END IF;
  END LOOP;
  IF v_root IS NULL THEN
    SELECT o.id INTO v_root FROM public.organizations o
    WHERE o.parent_id IS NULL ORDER BY o.is_active DESC, o.created_at, o.id LIMIT 1;
  END IF;
  RETURN v_root;
END $function$
;

CREATE OR REPLACE FUNCTION public.shipping_cost_for(_method text, _zone_id uuid DEFAULT NULL::uuid, _postal text DEFAULT NULL::text, _city text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_zone public.shipping_zones;
BEGIN
  v_zone := public.resolve_shipping(_method, _zone_id, _postal, _city);
  IF v_zone.id IS NULL THEN
    RETURN jsonb_build_object('zone_id', NULL, 'zone_name', NULL, 'cost', 0);
  END IF;
  RETURN jsonb_build_object(
    'zone_id', v_zone.id,
    'zone_name', v_zone.name,
    'cost', ROUND(v_zone.base_fee + v_zone.per_km * v_zone.distance_km)
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.stock_conversion_plan(_equipment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  e public.equipment;
  v_total integer; v_counted integer; v_create integer := 0;
  v_status text; v_note text;
BEGIN
  SELECT * INTO e FROM public.equipment WHERE id = _equipment_id;
  IF e.id IS NULL THEN RETURN NULL; END IF;
  SELECT count(*)::int, count(*) FILTER (WHERE s.status IN ('in_stock', 'with_customer'))::int
    INTO v_total, v_counted FROM public.stock_items s WHERE s.equipment_id = e.id;

  IF e.item_kind IN ('service', 'bundle') THEN
    v_status := 'skip'; v_note := CASE e.item_kind WHEN 'bundle' THEN 'Package – no physical unit of its own' ELSE 'Service – no physical unit' END;
  ELSIF e.tracking = 'serialized' THEN
    v_status := 'done'; v_note := 'Already tracked as individual units';
  ELSIF v_counted > e.quantity THEN
    v_status := 'conflict';
    v_note := format('%s units are registered but the stock is %s – converting would change the stock. Fix the quantity or retire units first.', v_counted, e.quantity);
  ELSIF e.quantity = 0 AND v_counted = 0 THEN
    v_status := 'skip'; v_note := 'Stock is 0 – nothing to convert';
  ELSE
    v_create := e.quantity - v_counted;
    v_status := 'convert';
    v_note := CASE WHEN v_counted > 0
      THEN format('%s existing unit%s already count towards the stock of %s', v_counted, CASE WHEN v_counted = 1 THEN '' ELSE 's' END, e.quantity)
      ELSE NULL END;
  END IF;
  IF v_total > v_counted THEN
    v_note := concat_ws(' · ', v_note, format('%s unit%s in service/damaged/retired not counted', v_total - v_counted, CASE WHEN v_total - v_counted = 1 THEN '' ELSE 's' END));
  END IF;

  RETURN jsonb_build_object(
    'equipment_id', e.id, 'name', e.name, 'category', e.category, 'item_kind', e.item_kind,
    'tracking', e.tracking, 'quantity', e.quantity, 'product_code', e.serial_code,
    'units_total', v_total, 'units_counted', v_counted, 'to_create', v_create,
    'status', v_status, 'note', v_note
  );
END $function$
;

CREATE OR REPLACE FUNCTION public.stock_conversion_preview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_out jsonb := '[]'::jsonb;
  v_plan jsonb;
  r record;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tester')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  FOR r IN SELECT id FROM public.equipment ORDER BY sort_order, name LOOP
    v_plan := public.stock_conversion_plan(r.id);
    IF (v_plan->>'to_create')::int > 0 THEN
      v_plan := v_plan || jsonb_build_object('next_codes',
        to_jsonb(public.preview_serial_codes(array_fill(r.id, ARRAY[(v_plan->>'to_create')::int]))));
    ELSE
      v_plan := v_plan || jsonb_build_object('next_codes', '[]'::jsonb);
    END IF;
    v_out := v_out || jsonb_build_array(v_plan);
  END LOOP;
  RETURN v_out;
END $function$
;

CREATE OR REPLACE FUNCTION public.stock_items_autobarcode()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.barcode IS NULL OR btrim(NEW.barcode) = '' THEN
    NEW.barcode := public.generate_barcode_value();
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.stock_items_before_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM public.unit_movements m WHERE m.stock_item_id = OLD.id) THEN
    RAISE EXCEPTION 'unit_has_history: retire unit % instead of deleting it', OLD.serial_code;
  END IF;
  RETURN OLD;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.stock_items_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE a record;
BEGIN
  NEW.qr_token := public.new_qr_token();
  SELECT * INTO a FROM public.allocate_unit_serial(NEW.equipment_id);
  NEW.serial_code := a.serial;
  NEW.sn_series_id := a.series_id;
  NEW.sn_org_no := a.org_no;
  NEW.sn_item_no := a.item_no;
  -- New units: the legacy unit number is the S/N itself (existing rows are not rewritten).
  NEW.unit_number := NEW.serial_code;
  NEW.label_print_count := 0;
  NEW.label_last_printed_at := NULL;
  IF NEW.identifier IS NULL OR btrim(NEW.identifier) = '' THEN
    NEW.identifier := NEW.unit_number;
  END IF;
  IF NEW.barcode IS NULL OR btrim(NEW.barcode) = '' THEN
    NEW.barcode := NEW.serial_code;
  END IF;
  NEW.serial_number := NULLIF(btrim(COALESCE(NEW.serial_number, '')), '');
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.stock_items_before_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.unit_number IS DISTINCT FROM OLD.unit_number THEN
    RAISE EXCEPTION 'unit_number_immutable';
  END IF;
  IF NEW.qr_token IS DISTINCT FROM OLD.qr_token THEN
    RAISE EXCEPTION 'qr_token_immutable';
  END IF;
  IF NEW.barcode IS NULL OR btrim(NEW.barcode) = '' THEN
    NEW.barcode := COALESCE(NEW.serial_code, NEW.unit_number);
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.stock_items_log_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND COALESCE(current_setting('app.unit_move', true), '') <> 'on' THEN
    INSERT INTO public.unit_movements (stock_item_id, action, from_status, to_status, order_id, performed_by)
    VALUES (NEW.id, 'status_change', OLD.status, NEW.status,
            NULLIF(current_setting('app.order_id', true), '')::uuid, auth.uid());
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.stock_items_serial_code_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only the S/N repair (unit_serial_repair) may re-issue a unit's S/N.
  IF current_setting('renthub.serial_repair', true) = 'on' THEN RETURN NEW; END IF;
  IF NEW.serial_code IS DISTINCT FROM OLD.serial_code THEN RAISE EXCEPTION 'serial_code_immutable'; END IF;
  IF OLD.sn_org_no IS NOT NULL AND (
    NEW.sn_org_no IS DISTINCT FROM OLD.sn_org_no
    OR NEW.sn_item_no IS DISTINCT FROM OLD.sn_item_no
    OR NEW.sn_series_id IS DISTINCT FROM OLD.sn_series_id
  ) THEN
    RAISE EXCEPTION 'serial_parts_immutable';
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.stock_items_validate_barcode()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v text := upper(btrim(COALESCE(NEW.barcode, '')));
BEGIN
  IF v = '' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.barcode IS NOT DISTINCT FROM OLD.barcode THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.serial_codes c
             WHERE upper(c.code) = v AND c.stock_item_id IS DISTINCT FROM NEW.id)
     OR EXISTS (SELECT 1 FROM public.equipment e
             WHERE v IN (upper(e.barcode), upper(e.serial_code), upper(e.legacy_barcode)))
     OR EXISTS (SELECT 1 FROM public.stock_items s
             WHERE s.id <> NEW.id
               AND v IN (upper(s.barcode), upper(s.serial_code), upper(s.unit_number))) THEN
    RAISE EXCEPTION 'barcode_in_use:%', NEW.barcode;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_lead(_name text, _email text, _phone text DEFAULT NULL::text, _company text DEFAULT NULL::text, _message text DEFAULT NULL::text, _rental_start date DEFAULT NULL::date, _rental_end date DEFAULT NULL::date, _source text DEFAULT 'website'::text, _honeypot text DEFAULT NULL::text, _form_started_at bigint DEFAULT NULL::bigint, _client_fingerprint text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email text := lower(trim(COALESCE(_email, '')));
  v_name text := trim(COALESCE(_name, ''));
  v_source text := COALESCE(NULLIF(trim(_source), ''), 'website');
BEGIN
  IF _client_fingerprint IS NULL OR _client_fingerprint !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_fingerprint';
  END IF;
  IF length(trim(COALESCE(_honeypot, ''))) > 0 THEN
    RETURN jsonb_build_object('ok', true);
  END IF;
  IF _form_started_at IS NULL
     OR (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT - _form_started_at < 3000 THEN
    RAISE EXCEPTION 'too_fast';
  END IF;
  IF length(v_name) < 2 OR length(v_name) > 120 THEN RAISE EXCEPTION 'invalid_name'; END IF;
  IF length(v_email) > 200 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'invalid_email'; END IF;
  IF length(COALESCE(_phone, '')) > 40 OR length(COALESCE(_company, '')) > 120
     OR length(COALESCE(_message, '')) > 4000 THEN
    RAISE EXCEPTION 'too_long';
  END IF;
  IF v_source !~ '^[a-z0-9_:/.-]{1,80}$' THEN v_source := 'website'; END IF;
  IF _rental_start IS NOT NULL AND _rental_end IS NOT NULL AND _rental_end < _rental_start THEN
    RAISE EXCEPTION 'invalid_dates';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('public.submit_lead'));
  IF (SELECT count(*) FROM public.leads
      WHERE created_by IS NULL AND created_at > now() - interval '1 hour') >= 60 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;
  IF (SELECT count(*) FROM public.leads
      WHERE lower(email) = v_email AND created_at > now() - interval '1 hour') >= 3 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  IF (SELECT count(*) FROM public.leads
      WHERE client_fingerprint = _client_fingerprint AND created_at > now() - interval '1 hour') >= 5 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  INSERT INTO public.leads (name, email, phone, company, message, rental_start, rental_end, source, created_by, client_fingerprint)
  VALUES (
    v_name, v_email,
    NULLIF(trim(COALESCE(_phone, '')), ''),
    NULLIF(trim(COALESCE(_company, '')), ''),
    NULLIF(trim(COALESCE(_message, '')), ''),
    _rental_start, _rental_end, v_source, NULL, _client_fingerprint
  );
  RETURN jsonb_build_object('ok', true);
END $function$
;

CREATE OR REPLACE FUNCTION public.submit_unit_report(_token text, _type text, _role text, _message text, _name text DEFAULT NULL::text, _phone text DEFAULT NULL::text, _email text DEFAULT NULL::text, _honeypot text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_unit public.stock_items;
  v_message text := btrim(COALESCE(_message, ''));
  v_name text := NULLIF(btrim(COALESCE(_name, '')), '');
  v_phone text := NULLIF(btrim(COALESCE(_phone, '')), '');
  v_email text := NULLIF(btrim(COALESCE(_email, '')), '');
  v_type text := lower(btrim(COALESCE(_type, '')));
  v_role text := lower(btrim(COALESCE(_role, '')));
BEGIN
  -- Bots that fill the hidden field get a fake success.
  IF btrim(COALESCE(_honeypot, '')) <> '' THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  IF _token IS NULL OR char_length(_token) NOT BETWEEN 16 AND 64 THEN
    RAISE EXCEPTION 'invalid_token';
  END IF;

  SELECT * INTO v_unit FROM public.stock_items WHERE qr_token = btrim(_token) FOR UPDATE;
  IF v_unit.id IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  IF v_unit.status = 'retired' THEN RAISE EXCEPTION 'unit_retired'; END IF;

  IF v_type NOT IN ('note', 'fault') THEN RAISE EXCEPTION 'invalid_type'; END IF;
  IF v_role NOT IN ('customer', 'staff') THEN RAISE EXCEPTION 'invalid_role'; END IF;
  IF char_length(v_message) < 3 OR char_length(v_message) > 2000 THEN RAISE EXCEPTION 'invalid_message'; END IF;
  IF v_name IS NOT NULL AND char_length(v_name) > 120 THEN RAISE EXCEPTION 'invalid_name'; END IF;
  IF v_phone IS NOT NULL AND char_length(v_phone) > 40 THEN RAISE EXCEPTION 'invalid_phone'; END IF;
  IF v_email IS NOT NULL AND (char_length(v_email) > 200 OR POSITION('@' IN v_email) < 2) THEN
    RAISE EXCEPTION 'invalid_email';
  END IF;

  IF (SELECT count(*) FROM public.unit_reports r
      WHERE r.stock_item_id = v_unit.id AND r.created_at > now() - interval '10 minutes') >= 5
     OR (SELECT count(*) FROM public.unit_reports r
      WHERE r.stock_item_id = v_unit.id AND r.created_at > now() - interval '1 day') >= 30 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  INSERT INTO public.unit_reports (
    stock_item_id, report_type, reporter_role, message, reporter_name, reporter_phone, reporter_email
  ) VALUES (
    v_unit.id, v_type,
    -- Anonymous reporters are always customers; only signed-in users may report as staff.
    CASE WHEN auth.uid() IS NULL THEN 'customer' ELSE v_role END,
    v_message, v_name, v_phone, v_email);

  RETURN jsonb_build_object('ok', true);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.unit_has_rental_history(_unit_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tester')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN EXISTS (SELECT 1 FROM public.stock_items s WHERE s.id = _unit_id AND s.status = 'with_customer')
      OR EXISTS (SELECT 1 FROM public.stock_item_assignments a WHERE a.stock_item_id = _unit_id)
      OR EXISTS (
        SELECT 1 FROM public.unit_movements m
        WHERE m.stock_item_id = _unit_id AND m.action NOT IN ('created', 'sn_changed')
      );
END $function$
;

CREATE OR REPLACE FUNCTION public.unit_move(_unit_ids uuid[], _action text, _order_id uuid DEFAULT NULL::uuid, _reference text DEFAULT NULL::text, _force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ids uuid[];
  v_forced uuid[] := ARRAY[]::uuid[];
  v_target text;
  v_reference text := NULLIF(btrim(COALESCE(_reference, '')), '');
  v_problems jsonb := '[]'::jsonb;
  v_blocking boolean := false;
  v_moved jsonb;
  v_reason text;
  v_line uuid;
  v_unit record;
  v_missing uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _action IS NULL OR _action NOT IN ('check_out', 'check_in') THEN RAISE EXCEPTION 'invalid_action'; END IF;
  IF v_reference IS NOT NULL AND char_length(v_reference) > 200 THEN RAISE EXCEPTION 'invalid_reference'; END IF;

  SELECT array_agg(DISTINCT x) INTO v_ids FROM unnest(COALESCE(_unit_ids, ARRAY[]::uuid[])) x WHERE x IS NOT NULL;
  IF v_ids IS NULL OR cardinality(v_ids) = 0 THEN RAISE EXCEPTION 'no_units'; END IF;
  IF cardinality(v_ids) > 1000 THEN RAISE EXCEPTION 'too_many_units'; END IF;

  IF _order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = _order_id) THEN
    RAISE EXCEPTION 'unknown_order';
  END IF;
  IF _action = 'check_out' AND _order_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.orders o WHERE o.id = _order_id AND o.status IN ('reserved', 'picked_up')
  ) THEN
    RAISE EXCEPTION 'order_not_active';
  END IF;

  v_target := CASE _action WHEN 'check_out' THEN 'with_customer' ELSE 'in_stock' END;

  PERFORM 1 FROM public.stock_items s WHERE s.id = ANY (v_ids) ORDER BY s.id FOR UPDATE;

  FOR v_missing IN
    SELECT x FROM unnest(v_ids) x WHERE NOT EXISTS (SELECT 1 FROM public.stock_items s WHERE s.id = x)
  LOOP
    v_blocking := true;
    v_problems := v_problems || jsonb_build_object(
      'unit_id', v_missing, 'unit_number', NULL, 'serial_code', NULL, 'status', NULL, 'reason', 'not_found');
  END LOOP;

  FOR v_unit IN
    SELECT s.id, s.unit_number, s.serial_code, s.status FROM public.stock_items s WHERE s.id = ANY (v_ids) ORDER BY s.serial_code
  LOOP
    v_reason := CASE
      WHEN v_unit.status = 'retired' THEN 'unit_retired'
      WHEN v_unit.status = 'service' THEN 'unit_in_service'
      WHEN v_unit.status = 'damaged' THEN 'unit_damaged'
      WHEN _action = 'check_out' AND v_unit.status = 'with_customer' THEN 'already_checked_out'
      WHEN _action = 'check_in' AND v_unit.status = 'in_stock' THEN 'already_checked_in'
      ELSE NULL
    END;
    -- Retired units can never be moved, not even with _force.
    IF v_reason = 'unit_retired' THEN v_blocking := true; END IF;
    IF v_reason IS NOT NULL THEN
      v_forced := v_forced || v_unit.id;
      v_problems := v_problems || jsonb_build_object(
        'unit_id', v_unit.id, 'unit_number', v_unit.unit_number, 'serial_code', v_unit.serial_code,
        'status', v_unit.status, 'reason', v_reason);
    END IF;
  END LOOP;

  IF v_blocking OR (cardinality(v_forced) > 0 AND NOT COALESCE(_force, false)) THEN
    RETURN jsonb_build_object('ok', false, 'problems', v_problems);
  END IF;

  INSERT INTO public.unit_movements (stock_item_id, action, from_status, to_status, order_id, reference, forced, performed_by)
  SELECT s.id, _action, s.status, v_target, _order_id, v_reference, s.id = ANY (v_forced), auth.uid()
  FROM public.stock_items s WHERE s.id = ANY (v_ids);

  PERFORM set_config('app.unit_move', 'on', true);
  UPDATE public.stock_items s SET status = v_target WHERE s.id = ANY (v_ids) AND s.status <> v_target;
  PERFORM set_config('app.unit_move', '', true);

  IF _order_id IS NOT NULL THEN
    FOR v_unit IN
      SELECT s.id, s.equipment_id FROM public.stock_items s WHERE s.id = ANY (v_ids) ORDER BY s.serial_code
    LOOP
      IF _action = 'check_out' THEN
        UPDATE public.stock_item_assignments a SET checked_out_at = now(), returned_at = NULL
        FROM public.order_lines l
        WHERE a.order_line_id = l.id AND l.order_id = _order_id AND a.stock_item_id = v_unit.id;
        IF NOT FOUND THEN
          v_line := NULL;
          SELECT l.id INTO v_line
          FROM public.order_lines l
          WHERE l.order_id = _order_id AND l.equipment_id = v_unit.equipment_id
            AND (SELECT count(*) FROM public.stock_item_assignments a WHERE a.order_line_id = l.id) < l.quantity
          ORDER BY l.sort_order, l.created_at
          LIMIT 1;
          IF v_line IS NOT NULL THEN
            INSERT INTO public.stock_item_assignments (order_line_id, stock_item_id, checked_out_at)
            VALUES (v_line, v_unit.id, now());
          END IF;
        END IF;
      ELSE
        UPDATE public.stock_item_assignments a SET returned_at = now()
        FROM public.order_lines l
        WHERE a.order_line_id = l.id AND l.order_id = _order_id AND a.stock_item_id = v_unit.id;
      END IF;
    END LOOP;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'unit_id', s.id, 'unit_number', s.unit_number, 'serial_code', s.serial_code, 'forced', s.id = ANY (v_forced))
           ORDER BY s.serial_code), '[]'::jsonb)
    INTO v_moved FROM public.stock_items s WHERE s.id = ANY (v_ids);

  RETURN jsonb_build_object('ok', true, 'moved', v_moved);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.unit_movements_append_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.unit_purge', true) = 'on'
     AND OLD.action IN ('created', 'sn_changed') THEN
    RETURN OLD;
  END IF;
  -- The only permitted change: the order FK being cleared when an order is deleted.
  IF TG_OP = 'UPDATE'
     AND OLD.order_id IS NOT NULL AND NEW.order_id IS NULL
     AND (to_jsonb(NEW) - 'order_id') = (to_jsonb(OLD) - 'order_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'unit_movements is append-only';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.unit_movements_no_truncate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  RAISE EXCEPTION 'unit_movements is append-only';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.unit_reports_set_handled()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'handled' AND OLD.status <> 'handled' THEN
    NEW.handled_at := COALESCE(NEW.handled_at, now());
    NEW.handled_by := COALESCE(NEW.handled_by, auth.uid());
  ELSIF NEW.status = 'new' AND OLD.status <> 'new' THEN
    NEW.handled_at := NULL;
    NEW.handled_by := NULL;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.unit_serial_repair(_apply boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_org_seen jsonb := '{}'::jsonb;
  v_item_seen jsonb := '{}'::jsonb;
  v_next_org jsonb := '{}'::jsonb;
  v_next_item jsonb := '{}'::jsonb;
  v_fix uuid[] := ARRAY[]::uuid[];
  v_keep_item jsonb := '{}'::jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_root uuid; v_key text; v_prefix text; v_cc text;
  v_o bigint; v_i bigint; v_code text;
  v_org_ok boolean; v_item_ok boolean; v_ambiguous boolean;
  v_total integer := 0; v_ambiguous_count integer := 0;
  v_batch text := 'sn-repair-' || to_char(now() AT TIME ZONE 'Europe/Stockholm', 'YYYY-MM-DD-HH24MI');
  v_reprint jsonb;
BEGIN
  IF _apply THEN
    IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
    PERFORM pg_advisory_xact_lock(hashtext('unit_serial_repair'));
    PERFORM 1 FROM public.stock_items FOR UPDATE;
  ELSIF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tester')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Pass 1: which units keep their numbers.
  FOR r IN
    SELECT s.id, s.equipment_id, s.sn_series_id, s.sn_org_no, s.sn_item_no, e.organization_id
    FROM public.stock_items s JOIN public.equipment e ON e.id = s.equipment_id
    ORDER BY s.created_at, s.sn_item_no NULLS LAST, s.id
  LOOP
    v_total := v_total + 1;
    v_key := COALESCE(COALESCE(r.sn_series_id, public.serial_series_root(r.organization_id))::text, 'none');
    v_org_ok := r.sn_org_no IS NOT NULL AND NOT (v_org_seen ? (v_key || ':' || r.sn_org_no));
    v_item_ok := r.sn_item_no IS NOT NULL AND r.sn_item_no BETWEEN 1 AND 999
      AND NOT (v_item_seen ? (r.equipment_id::text || ':' || r.sn_item_no));
    IF v_item_ok THEN
      v_item_seen := v_item_seen || jsonb_build_object(r.equipment_id::text || ':' || r.sn_item_no, true);
    END IF;
    IF v_org_ok AND v_item_ok THEN
      v_org_seen := v_org_seen || jsonb_build_object(v_key || ':' || r.sn_org_no, true);
    ELSE
      v_fix := v_fix || r.id;
      v_keep_item := v_keep_item || jsonb_build_object(r.id::text, v_item_ok);
    END IF;
  END LOOP;

  -- Pass 2: new numbers for the rest, in creation order.
  FOR r IN
    SELECT s.id, s.equipment_id, s.serial_code, s.sn_series_id, s.sn_item_no, s.barcode, s.status,
      s.label_print_count, s.label_last_printed_at, e.name, e.organization_id,
      COALESCE(e.sn_category_code, public.serial_category_code(e.category)) AS cc
    FROM public.stock_items s JOIN public.equipment e ON e.id = s.equipment_id
    WHERE s.id = ANY (v_fix)
    ORDER BY s.created_at, s.sn_item_no NULLS LAST, s.id
  LOOP
    v_root := COALESCE(r.sn_series_id, public.serial_series_root(r.organization_id));
    v_key := COALESCE(v_root::text, 'none');
    v_prefix := public.serial_series_prefix(v_root);

    IF (v_keep_item->>r.id::text)::boolean THEN
      v_i := r.sn_item_no;
    ELSE
      v_i := COALESCE((v_next_item->>r.equipment_id::text)::bigint,
        (SELECT c.last_value FROM public.serial_counters c WHERE c.scope = 'item:' || r.equipment_id::text), 0);
      LOOP
        v_i := v_i + 1;
        IF v_i > 999 THEN RAISE EXCEPTION 'item_unit_limit: an item can have at most 999 units'; END IF;
        EXIT WHEN NOT (v_item_seen ? (r.equipment_id::text || ':' || v_i));
      END LOOP;
      v_item_seen := v_item_seen || jsonb_build_object(r.equipment_id::text || ':' || v_i, true);
      v_next_item := v_next_item || jsonb_build_object(r.equipment_id::text, v_i);
    END IF;

    v_o := COALESCE((v_next_org->>v_key)::bigint,
      (SELECT c.last_value FROM public.serial_counters c WHERE c.scope = 'units:' || v_key), 0);
    LOOP
      v_o := v_o + 1;
      v_code := public.format_unit_serial_code(v_prefix, r.cc, v_o, v_i);
      EXIT WHEN NOT (v_org_seen ? (v_key || ':' || v_o))
        AND NOT EXISTS (SELECT 1 FROM public.serial_codes sc WHERE sc.code = v_code);
    END LOOP;
    v_org_seen := v_org_seen || jsonb_build_object(v_key || ':' || v_o, true);
    v_next_org := v_next_org || jsonb_build_object(v_key, v_o);

    -- The old S/N is ambiguous if anything else answers to it in a scan.
    v_ambiguous := EXISTS (
        SELECT 1 FROM public.stock_items o WHERE o.id <> r.id
          AND (o.serial_code = r.serial_code OR o.barcode = r.serial_code
               OR upper(o.unit_number) = r.serial_code OR upper(o.identifier) = r.serial_code))
      OR EXISTS (
        SELECT 1 FROM public.equipment q
        WHERE q.serial_code = r.serial_code OR q.barcode = r.serial_code OR upper(COALESCE(q.legacy_barcode, '')) = r.serial_code);
    IF v_ambiguous THEN v_ambiguous_count := v_ambiguous_count + 1; END IF;

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'stock_item_id', r.id, 'equipment_id', r.equipment_id, 'equipment_name', r.name, 'status', r.status,
      'old_code', r.serial_code, 'new_code', v_code, 'org_no', v_o, 'item_no', v_i,
      'item_no_kept', (v_keep_item->>r.id::text)::boolean,
      'label_print_count', r.label_print_count, 'old_code_ambiguous', v_ambiguous));

    IF _apply THEN
      PERFORM set_config('renthub.serial_repair', 'on', true);
      UPDATE public.serial_codes SET kind = CASE WHEN v_ambiguous THEN 'review' ELSE 'alias' END, replaced_at = now()
      WHERE code = r.serial_code AND stock_item_id = r.id;
      UPDATE public.stock_items
      SET serial_code = v_code, sn_series_id = v_root, sn_org_no = v_o, sn_item_no = v_i,
          barcode = CASE WHEN barcode = r.serial_code THEN v_code ELSE barcode END
      WHERE id = r.id;
      PERFORM set_config('renthub.serial_repair', 'off', true);
      INSERT INTO public.serial_codes (code, stock_item_id) VALUES (v_code, r.id);
      INSERT INTO public.unit_movements (stock_item_id, action, from_status, to_status, reference, note, performed_by)
      VALUES (r.id, 'sn_changed', r.status, r.status, v_batch, format('S/N %s → %s', r.serial_code, v_code), auth.uid());
    END IF;
  END LOOP;

  IF _apply THEN
    INSERT INTO public.serial_counters AS c (scope, last_value)
    SELECT 'units:' || k, v::bigint FROM jsonb_each_text(v_next_org) AS t(k, v)
    ON CONFLICT (scope) DO UPDATE SET last_value = GREATEST(c.last_value, EXCLUDED.last_value), updated_at = now();
    INSERT INTO public.serial_counters AS c (scope, last_value)
    SELECT 'item:' || k, v::bigint FROM jsonb_each_text(v_next_item) AS t(k, v)
    ON CONFLICT (scope) DO UPDATE SET last_value = GREATEST(c.last_value, EXCLUDED.last_value), updated_at = now();
  END IF;

  -- Labels printed with a former S/N and not reprinted since.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'stock_item_id', s.id, 'equipment_name', e.name, 'serial_code', s.serial_code,
      'old_code', a.code, 'label_print_count', s.label_print_count, 'printed_at', s.label_last_printed_at)
      ORDER BY e.name, s.serial_code), '[]'::jsonb)
  INTO v_reprint
  FROM public.serial_codes a
  JOIN public.stock_items s ON s.id = a.stock_item_id
  JOIN public.equipment e ON e.id = s.equipment_id
  WHERE a.kind IN ('alias', 'review') AND s.label_print_count > 0
    AND (s.label_last_printed_at IS NULL OR s.label_last_printed_at <= a.replaced_at);

  RETURN jsonb_build_object(
    'applied', _apply, 'units_total', v_total, 'to_change', cardinality(v_fix),
    'ambiguous', v_ambiguous_count, 'changes', v_rows, 'reprint', v_reprint);
END $function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$
;

CREATE TRIGGER admin_email_allowlist_after_delete AFTER DELETE ON public.admin_email_allowlist FOR EACH ROW EXECUTE FUNCTION admin_email_allowlist_after_delete();
CREATE TRIGGER admin_email_allowlist_after_insert AFTER INSERT ON public.admin_email_allowlist FOR EACH ROW EXECUTE FUNCTION admin_email_allowlist_after_insert();
CREATE TRIGGER admin_email_allowlist_after_update AFTER UPDATE OF role ON public.admin_email_allowlist FOR EACH ROW EXECUTE FUNCTION admin_email_allowlist_after_update();
CREATE TRIGGER admin_email_allowlist_normalize BEFORE INSERT ON public.admin_email_allowlist FOR EACH ROW EXECUTE FUNCTION admin_email_allowlist_normalize();
CREATE TRIGGER customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER equipment_autobarcode BEFORE UPDATE ON public.equipment FOR EACH ROW EXECUTE FUNCTION equipment_autobarcode();
CREATE TRIGGER equipment_lock_item_id_parts BEFORE UPDATE ON public.equipment FOR EACH ROW EXECUTE FUNCTION equipment_lock_item_id_parts();
CREATE TRIGGER equipment_require_organization BEFORE INSERT OR UPDATE ON public.equipment FOR EACH ROW EXECUTE FUNCTION equipment_require_organization();
CREATE TRIGGER equipment_serial_code_assign BEFORE INSERT ON public.equipment FOR EACH ROW EXECUTE FUNCTION equipment_assign_serial_code();
CREATE TRIGGER equipment_serial_code_immutable BEFORE UPDATE ON public.equipment FOR EACH ROW EXECUTE FUNCTION equipment_serial_code_immutable();
CREATE TRIGGER equipment_serial_code_register AFTER INSERT ON public.equipment FOR EACH ROW EXECUTE FUNCTION register_serial_code();
CREATE TRIGGER equipment_updated_at BEFORE UPDATE ON public.equipment FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER equipment_validate_barcode BEFORE INSERT OR UPDATE OF barcode ON public.equipment FOR EACH ROW EXECUTE FUNCTION equipment_validate_barcode();
CREATE TRIGGER leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER offers_updated_at BEFORE UPDATE ON public.offers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER order_lines_set_window_trg BEFORE INSERT OR UPDATE ON public.order_lines FOR EACH ROW EXECUTE FUNCTION order_lines_set_window();
CREATE TRIGGER orders_log_status_trg AFTER INSERT OR UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION orders_log_status();
CREATE TRIGGER orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER orders_validate_status_trg BEFORE UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION orders_validate_status();
CREATE TRIGGER organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER organizations_validate BEFORE INSERT OR UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION organizations_validate();
CREATE TRIGGER price_rules_updated_at BEFORE UPDATE ON public.price_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER shipping_zones_updated_at BEFORE UPDATE ON public.shipping_zones FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER site_page_overrides_updated_at BEFORE UPDATE ON public.site_page_overrides FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER stock_items_before_delete BEFORE DELETE ON public.stock_items FOR EACH ROW EXECUTE FUNCTION stock_items_before_delete();
CREATE TRIGGER stock_items_before_insert BEFORE INSERT ON public.stock_items FOR EACH ROW EXECUTE FUNCTION stock_items_before_insert();
CREATE TRIGGER stock_items_before_update BEFORE UPDATE ON public.stock_items FOR EACH ROW EXECUTE FUNCTION stock_items_before_update();
CREATE TRIGGER stock_items_log_status_change AFTER UPDATE OF status ON public.stock_items FOR EACH ROW EXECUTE FUNCTION stock_items_log_status_change();
CREATE TRIGGER stock_items_serial_code_immutable BEFORE UPDATE ON public.stock_items FOR EACH ROW EXECUTE FUNCTION stock_items_serial_code_immutable();
CREATE TRIGGER stock_items_serial_code_register AFTER INSERT ON public.stock_items FOR EACH ROW EXECUTE FUNCTION register_serial_code();
CREATE TRIGGER stock_items_updated_at BEFORE UPDATE ON public.stock_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER stock_items_validate_barcode BEFORE INSERT OR UPDATE OF barcode ON public.stock_items FOR EACH ROW EXECUTE FUNCTION stock_items_validate_barcode();
CREATE TRIGGER unit_movements_append_only BEFORE DELETE OR UPDATE ON public.unit_movements FOR EACH ROW EXECUTE FUNCTION unit_movements_append_only();
CREATE TRIGGER unit_movements_no_truncate BEFORE TRUNCATE ON public.unit_movements FOR EACH STATEMENT EXECUTE FUNCTION unit_movements_no_truncate();
CREATE TRIGGER unit_reports_set_handled BEFORE UPDATE ON public.unit_reports FOR EACH ROW EXECUTE FUNCTION unit_reports_set_handled();

CREATE POLICY "Admins add to allowlist" ON public.admin_email_allowlist AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins change allowlist role" ON public.admin_email_allowlist AS PERMISSIVE FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins read allowlist" ON public.admin_email_allowlist AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins remove from allowlist" ON public.admin_email_allowlist AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage rules" ON public.business_rules AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Rules are public" ON public.business_rules AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage customers" ON public.customers AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Testers create own" ON public.customers AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'tester'::app_role) AND (created_by = auth.uid())));
CREATE POLICY "Testers delete own" ON public.customers AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'tester'::app_role) AND (created_by = auth.uid())));
CREATE POLICY "Testers edit own" ON public.customers AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'tester'::app_role) AND (created_by = auth.uid()))) WITH CHECK ((created_by = auth.uid()));
CREATE POLICY "Testers read all" ON public.customers AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'tester'::app_role));
CREATE POLICY "Active equipment is public" ON public.equipment AS PERMISSIVE FOR SELECT TO anon USING (is_active);
CREATE POLICY "Active equipment or staff" ON public.equipment AS PERMISSIVE FOR SELECT TO authenticated USING ((is_active OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Admins manage equipment" ON public.equipment AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Testers create own" ON public.equipment AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'tester'::app_role) AND (created_by = auth.uid())));
CREATE POLICY "Testers delete own" ON public.equipment AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'tester'::app_role) AND (created_by = auth.uid())));
CREATE POLICY "Testers edit own" ON public.equipment AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'tester'::app_role) AND (created_by = auth.uid()))) WITH CHECK ((created_by = auth.uid()));
CREATE POLICY "Testers read all" ON public.equipment AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'tester'::app_role));
CREATE POLICY "Admins manage leads" ON public.leads AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Testers create own" ON public.leads AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'tester'::app_role) AND (created_by = auth.uid())));
CREATE POLICY "Testers delete own" ON public.leads AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'tester'::app_role) AND (created_by = auth.uid())));
CREATE POLICY "Testers edit own" ON public.leads AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'tester'::app_role) AND (created_by = auth.uid()))) WITH CHECK ((created_by = auth.uid()));
CREATE POLICY "Testers read all" ON public.leads AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'tester'::app_role));
CREATE POLICY "Admins manage offer items" ON public.offer_items AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Testers create own" ON public.offer_items AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'tester'::app_role) AND (created_by = auth.uid())));
CREATE POLICY "Testers delete own" ON public.offer_items AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'tester'::app_role) AND (created_by = auth.uid())));
CREATE POLICY "Testers edit own" ON public.offer_items AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'tester'::app_role) AND (created_by = auth.uid()))) WITH CHECK ((created_by = auth.uid()));
CREATE POLICY "Testers read all" ON public.offer_items AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'tester'::app_role));
CREATE POLICY "Admins manage offers" ON public.offers AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Testers create own" ON public.offers AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'tester'::app_role) AND (created_by = auth.uid())));
CREATE POLICY "Testers delete own" ON public.offers AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'tester'::app_role) AND (created_by = auth.uid())));
CREATE POLICY "Testers edit own" ON public.offers AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'tester'::app_role) AND (created_by = auth.uid()))) WITH CHECK ((created_by = auth.uid()));
CREATE POLICY "Testers read all" ON public.offers AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'tester'::app_role));
CREATE POLICY "Admins read order events" ON public.order_events AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins write order events" ON public.order_events AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Testers log events on own orders" ON public.order_events AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'tester'::app_role) AND (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_events.order_id) AND (o.created_by = auth.uid()))))));
CREATE POLICY "Testers read order events" ON public.order_events AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'tester'::app_role));
CREATE POLICY "Admins manage order lines" ON public.order_lines AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Testers create own" ON public.order_lines AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'tester'::app_role) AND (created_by = auth.uid())));
CREATE POLICY "Testers delete own" ON public.order_lines AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'tester'::app_role) AND (created_by = auth.uid())));
CREATE POLICY "Testers edit own" ON public.order_lines AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'tester'::app_role) AND (created_by = auth.uid()))) WITH CHECK ((created_by = auth.uid()));
CREATE POLICY "Testers read all" ON public.order_lines AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'tester'::app_role));
CREATE POLICY "Admins manage orders" ON public.orders AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Testers create own" ON public.orders AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'tester'::app_role) AND (created_by = auth.uid())));
CREATE POLICY "Testers delete own" ON public.orders AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'tester'::app_role) AND (created_by = auth.uid())));
CREATE POLICY "Testers edit own" ON public.orders AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'tester'::app_role) AND (created_by = auth.uid()))) WITH CHECK ((created_by = auth.uid()));
CREATE POLICY "Testers read all" ON public.orders AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'tester'::app_role));
CREATE POLICY "Admins delete organizations" ON public.organizations AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins insert organizations" ON public.organizations AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update organizations" ON public.organizations AS PERMISSIVE FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Staff read organizations" ON public.organizations AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'tester'::app_role)));
CREATE POLICY "Admins manage price rules" ON public.price_rules AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Price rules are public" ON public.price_rules AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Testers create own" ON public.price_rules AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'tester'::app_role) AND (created_by = auth.uid())));
CREATE POLICY "Testers delete own" ON public.price_rules AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'tester'::app_role) AND (created_by = auth.uid())));
CREATE POLICY "Testers edit own" ON public.price_rules AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'tester'::app_role) AND (created_by = auth.uid()))) WITH CHECK ((created_by = auth.uid()));
CREATE POLICY "Testers read all" ON public.price_rules AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'tester'::app_role));
CREATE POLICY "Admins manage components" ON public.product_components AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Components are public" ON public.product_components AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Testers create own" ON public.product_components AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'tester'::app_role) AND (created_by = auth.uid())));
CREATE POLICY "Testers delete own" ON public.product_components AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'tester'::app_role) AND (created_by = auth.uid())));
CREATE POLICY "Testers edit own" ON public.product_components AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'tester'::app_role) AND (created_by = auth.uid()))) WITH CHECK ((created_by = auth.uid()));
CREATE POLICY "Testers read all" ON public.product_components AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'tester'::app_role));
CREATE POLICY "Testers read profiles" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'tester'::app_role));
CREATE POLICY "Users read own profile" ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING (((auth.uid() = id) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Users update own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));
CREATE POLICY "Admins and testers read serial codes" ON public.serial_codes AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'tester'::app_role)));
CREATE POLICY "Admins and testers read serial counters" ON public.serial_counters AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'tester'::app_role)));
CREATE POLICY "Active zones are public" ON public.shipping_zones AS PERMISSIVE FOR SELECT TO anon USING (is_active);
CREATE POLICY "Active zones or staff" ON public.shipping_zones AS PERMISSIVE FOR SELECT TO authenticated USING ((is_active OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "Admins manage zones" ON public.shipping_zones AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Testers create own" ON public.shipping_zones AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'tester'::app_role) AND (created_by = auth.uid())));
CREATE POLICY "Testers delete own" ON public.shipping_zones AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'tester'::app_role) AND (created_by = auth.uid())));
CREATE POLICY "Testers edit own" ON public.shipping_zones AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'tester'::app_role) AND (created_by = auth.uid()))) WITH CHECK ((created_by = auth.uid()));
CREATE POLICY "Testers read all" ON public.shipping_zones AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'tester'::app_role));
CREATE POLICY "Admins manage page overrides" ON public.site_page_overrides AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Page overrides are public" ON public.site_page_overrides AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Admins manage assignments" ON public.stock_item_assignments AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Testers create own" ON public.stock_item_assignments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'tester'::app_role) AND (created_by = auth.uid())));
CREATE POLICY "Testers delete own" ON public.stock_item_assignments AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'tester'::app_role) AND (created_by = auth.uid())));
CREATE POLICY "Testers edit own" ON public.stock_item_assignments AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'tester'::app_role) AND (created_by = auth.uid()))) WITH CHECK ((created_by = auth.uid()));
CREATE POLICY "Testers read all" ON public.stock_item_assignments AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'tester'::app_role));
CREATE POLICY "Admins manage stock items" ON public.stock_items AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Testers create own" ON public.stock_items AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'tester'::app_role) AND (created_by = auth.uid())));
CREATE POLICY "Testers delete own" ON public.stock_items AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'tester'::app_role) AND (created_by = auth.uid())));
CREATE POLICY "Testers edit own" ON public.stock_items AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'tester'::app_role) AND (created_by = auth.uid()))) WITH CHECK ((created_by = auth.uid()));
CREATE POLICY "Testers read all" ON public.stock_items AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'tester'::app_role));
CREATE POLICY "Admins manage tax rates" ON public.tax_rates AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Tax rates are public" ON public.tax_rates AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Testers create own" ON public.tax_rates AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'tester'::app_role) AND (created_by = auth.uid())));
CREATE POLICY "Testers delete own" ON public.tax_rates AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'tester'::app_role) AND (created_by = auth.uid())));
CREATE POLICY "Testers edit own" ON public.tax_rates AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'tester'::app_role) AND (created_by = auth.uid()))) WITH CHECK ((created_by = auth.uid()));
CREATE POLICY "Testers read all" ON public.tax_rates AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'tester'::app_role));
CREATE POLICY "Admins log unit movements" ON public.unit_movements AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) AND (performed_by = auth.uid())));
CREATE POLICY "Admins read unit movements" ON public.unit_movements AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage unit reports" ON public.unit_reports AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users read own roles" ON public.user_roles AS PERMISSIVE FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)));
