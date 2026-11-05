-- Security and hygiene hardening.

-- =====================================================================
-- 1. Offers: no anon table access; public view goes through get_public_offer
-- =====================================================================
DROP POLICY IF EXISTS "Sent offers viewable via share link" ON public.offers;
DROP POLICY IF EXISTS "Items of visible offers" ON public.offer_items;

REVOKE ALL ON public.offers FROM anon;
REVOKE ALL ON public.offer_items FROM anon;

CREATE OR REPLACE FUNCTION public.get_public_offer(_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
END $$;

REVOKE ALL ON FUNCTION public.get_public_offer(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_offer(text) TO anon, authenticated, service_role;

-- =====================================================================
-- 2. Bookings: pending status, abuse protection, admin confirm
-- =====================================================================
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS client_fingerprint text;
COMMENT ON COLUMN public.orders.client_fingerprint IS
  'sha256(salt + client IP) supplied by the booking server function; used only for rate limiting.';

CREATE INDEX IF NOT EXISTS orders_source_created_idx ON public.orders (source, created_at);
CREATE INDEX IF NOT EXISTS orders_fingerprint_created_idx ON public.orders (client_fingerprint, created_at)
  WHERE client_fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS customers_email_lower_idx ON public.customers (lower(email));

CREATE OR REPLACE FUNCTION public.orders_validate_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
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
  -- A pending website request is only reserved through confirm_order(), which
  -- re-checks availability under row locks.
  IF OLD.status = 'pending' AND NEW.status = 'reserved'
     AND COALESCE(current_setting('app.order_confirm', true), '') <> 'on' THEN
    RAISE EXCEPTION 'use_confirm_order';
  END IF;
  IF NEW.status = 'picked_up' AND NEW.picked_up_at IS NULL THEN NEW.picked_up_at := now(); END IF;
  IF NEW.status = 'returned' AND NEW.returned_at IS NULL THEN NEW.returned_at := now(); END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.create_booking(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  IF v_fingerprint IS NOT NULL AND (SELECT count(*) FROM public.orders o
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
END $$;

-- Only the booking server function (service role) may call it, so the
-- client fingerprint cannot be forged and the IP limit cannot be skipped.
REVOKE ALL ON FUNCTION public.create_booking(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.confirm_order(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  IF v_order.status <> 'pending' THEN
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
END $$;

REVOKE ALL ON FUNCTION public.confirm_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_order(uuid) TO authenticated, service_role;

-- =====================================================================
-- 3. Roles come only from the allowlist (no hard-coded emails)
-- =====================================================================
ALTER TABLE public.admin_email_allowlist
  ADD COLUMN IF NOT EXISTS role public.app_role NOT NULL DEFAULT 'admin';

CREATE OR REPLACE FUNCTION public.grant_allowlisted_admin(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  SELECT u.id, a.role
  FROM auth.users u
  JOIN public.admin_email_allowlist a ON a.email = lower(u.email)
  WHERE u.id = _user_id
    AND u.email_confirmed_at IS NOT NULL
  ON CONFLICT DO NOTHING;
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  -- Roles are granted only to allowlisted, email-confirmed accounts.
  PERFORM public.grant_allowlisted_admin(NEW.id);
  RETURN NEW;
END $$;

-- =====================================================================
-- 4. has_role: not callable by anon. Anon read policies must not call it.
-- =====================================================================
DROP POLICY IF EXISTS "Active equipment is public" ON public.equipment;
CREATE POLICY "Active equipment is public" ON public.equipment
  FOR SELECT TO anon USING (is_active);
CREATE POLICY "Active equipment or staff" ON public.equipment
  FOR SELECT TO authenticated USING (is_active OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Active zones are public" ON public.shipping_zones;
CREATE POLICY "Active zones are public" ON public.shipping_zones
  FOR SELECT TO anon USING (is_active);
CREATE POLICY "Active zones or staff" ON public.shipping_zones
  FOR SELECT TO authenticated USING (is_active OR public.has_role(auth.uid(), 'admin'));

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- =====================================================================
-- 6. Leads: no anon INSERT; submissions go through submit_lead()
-- =====================================================================
DROP POLICY IF EXISTS "Anyone can submit a lead" ON public.leads;
REVOKE ALL ON public.leads FROM anon;
CREATE INDEX IF NOT EXISTS leads_created_idx ON public.leads (created_at);
CREATE INDEX IF NOT EXISTS leads_email_lower_idx ON public.leads (lower(email));

CREATE OR REPLACE FUNCTION public.submit_lead(
  _name text,
  _email text,
  _phone text DEFAULT NULL,
  _company text DEFAULT NULL,
  _message text DEFAULT NULL,
  _rental_start date DEFAULT NULL,
  _rental_end date DEFAULT NULL,
  _source text DEFAULT 'website',
  _honeypot text DEFAULT NULL,
  _form_started_at bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(COALESCE(_email, '')));
  v_name text := trim(COALESCE(_name, ''));
  v_source text := COALESCE(NULLIF(trim(_source), ''), 'website');
BEGIN
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

  INSERT INTO public.leads (name, email, phone, company, message, rental_start, rental_end, source, created_by)
  VALUES (
    v_name, v_email,
    NULLIF(trim(COALESCE(_phone, '')), ''),
    NULLIF(trim(COALESCE(_company, '')), ''),
    NULLIF(trim(COALESCE(_message, '')), ''),
    _rental_start, _rental_end, v_source, NULL
  );
  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.submit_lead(text, text, text, text, text, date, date, text, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_lead(text, text, text, text, text, date, date, text, text, bigint)
  TO anon, authenticated, service_role;

-- =====================================================================
-- Anon table grants: read-only where public policies exist, nothing elsewhere
-- =====================================================================
REVOKE ALL ON public.customers, public.orders, public.order_lines, public.order_events,
  public.profiles, public.user_roles, public.serial_codes, public.serial_counters,
  public.stock_item_assignments, public.organizations
  FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON public.business_rules, public.equipment, public.price_rules, public.product_components,
     public.shipping_zones, public.site_page_overrides, public.tax_rates
  FROM anon;
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c
           WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' LOOP
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;

-- =====================================================================
-- 8. Serial cleanup: drop unreferenced legacy generators; mark legacy columns
-- =====================================================================
DROP FUNCTION IF EXISTS public.next_serial_code(uuid, text);
DROP FUNCTION IF EXISTS public.format_serial_code(text, text, bigint, bigint);

COMMENT ON COLUMN public.equipment.item_code IS
  'LEGACY: superseded by serial_code (product level) and stock_items.serial_code (units). Kept so old labels still scan via scan_lookup; never reissued.';
COMMENT ON COLUMN public.stock_items.unit_number IS
  'LEGACY: superseded by stock_items.serial_code. Kept so old labels still scan via scan_lookup; never reissued.';
COMMENT ON COLUMN public.equipment.legacy_barcode IS
  'LEGACY: barcode value from before the S/N format; still resolves via scan_lookup.';

-- =====================================================================
-- 9. Function hardening
-- =====================================================================
ALTER FUNCTION public.unit_movements_append_only() SET search_path = public;

DO $$
DECLARE f regprocedure;
BEGIN
  FOR f IN SELECT p.oid::regprocedure FROM pg_proc p
           WHERE p.pronamespace = 'public'::regnamespace
             AND p.prorettype = 'trigger'::regtype LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
  FOR f IN SELECT p.oid::regprocedure FROM pg_proc p
           WHERE p.pronamespace = 'public'::regnamespace
             AND p.proconfig IS NULL AND p.prokind = 'f' LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', f);
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.letters_only(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.serial_category_code(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.derive_org_prefix(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.format_unit_serial_code(text, text, bigint, bigint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.derive_item_code(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.generate_barcode_value() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.letters_only(text), public.serial_category_code(text),
  public.derive_org_prefix(text), public.format_unit_serial_code(text, text, bigint, bigint),
  public.derive_item_code(text), public.generate_barcode_value()
  TO authenticated, service_role;

-- Storefront RPCs stay callable by anon (explicit, in case PUBLIC was their only grant).
GRANT EXECUTE ON FUNCTION
  public.available_quantity(uuid, date, date, uuid),
  public.available_quantity_at(uuid, timestamptz, timestamptz, uuid),
  public.equipment_reserved(uuid, date, date, uuid),
  public.equipment_reserved_at(uuid, timestamptz, timestamptz, uuid),
  public.equipment_total_units(uuid),
  public.price_for(uuid, date, date, integer),
  public.shipping_cost_for(text, uuid, text, text),
  public.resolve_shipping(text, uuid, text, text),
  public.get_public_unit(text),
  public.submit_unit_report(text, text, text, text, text, text, text, text)
  TO anon, authenticated;

-- =====================================================================
-- 10. unit_has_rental_history requires admin or tester
-- =====================================================================
CREATE OR REPLACE FUNCTION public.unit_has_rental_history(_unit_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
END $$;
REVOKE ALL ON FUNCTION public.unit_has_rental_history(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unit_has_rental_history(uuid) TO authenticated, service_role;
