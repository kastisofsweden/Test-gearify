-- Commission (org default + item override), snapshotted on order/calculation lines,
-- plus organization membership for the "My invoice" back-office tab.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS commission_type text,
  ADD COLUMN IF NOT EXISTS commission_value numeric;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_commission_type_chk CHECK (commission_type IS NULL OR commission_type IN ('percent','fixed')),
  ADD CONSTRAINT organizations_commission_value_chk CHECK (commission_value IS NULL OR commission_value >= 0);

ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS commission_type text,
  ADD COLUMN IF NOT EXISTS commission_value numeric;
ALTER TABLE public.equipment
  ADD CONSTRAINT equipment_commission_type_chk CHECK (commission_type IS NULL OR commission_type IN ('percent','fixed')),
  ADD CONSTRAINT equipment_commission_value_chk CHECK (commission_value IS NULL OR commission_value >= 0);

ALTER TABLE public.order_lines
  ADD COLUMN IF NOT EXISTS base_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_type text,
  ADD COLUMN IF NOT EXISTS commission_value numeric,
  ADD COLUMN IF NOT EXISTS commission_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS order_lines_organization_idx ON public.order_lines (organization_id);

ALTER TABLE public.calculation_lines
  ADD COLUMN IF NOT EXISTS base_amount numeric,
  ADD COLUMN IF NOT EXISTS commission_type text,
  ADD COLUMN IF NOT EXISTS commission_value numeric,
  ADD COLUMN IF NOT EXISTS commission_amount numeric,
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

-- Backfill historical rows: owner org, base = current line total, no commission.
UPDATE public.order_lines ol
SET organization_id = e.organization_id
FROM public.equipment e
WHERE e.id = ol.equipment_id AND ol.organization_id IS NULL;
UPDATE public.order_lines SET base_amount = quantity * days * unit_price WHERE base_amount = 0;

-- Membership ---------------------------------------------------------------
ALTER TABLE public.admin_email_allowlist
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.user_organizations (
  user_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, organization_id)
);
GRANT SELECT ON public.user_organizations TO authenticated;
GRANT ALL ON public.user_organizations TO service_role;
ALTER TABLE public.user_organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own organization links" ON public.user_organizations
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_member_of_organization(_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_organizations uo
    WHERE uo.user_id = auth.uid()
      AND (uo.organization_id = _org_id
           OR uo.organization_id = (SELECT o.parent_id FROM public.organizations o WHERE o.id = _org_id)))
$$;
REVOKE EXECUTE ON FUNCTION public.is_member_of_organization(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_member_of_organization(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.grant_allowlisted_admin(_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_found boolean;
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  SELECT u.id, a.role
  FROM auth.users u
  JOIN public.admin_email_allowlist a ON a.email = lower(u.email)
  WHERE u.id = _user_id
    AND u.email_confirmed_at IS NOT NULL
    AND (u.confirmation_sent_at IS NOT NULL OR u.invited_at IS NOT NULL)
  ON CONFLICT DO NOTHING;
  v_found := FOUND;
  INSERT INTO public.user_companies (user_id, company_id)
  SELECT u.id, a.company_id
  FROM auth.users u
  JOIN public.admin_email_allowlist a ON a.email = lower(u.email)
  WHERE u.id = _user_id AND a.role = 'partner' AND a.company_id IS NOT NULL
    AND u.email_confirmed_at IS NOT NULL
    AND (u.confirmation_sent_at IS NOT NULL OR u.invited_at IS NOT NULL)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.user_organizations (user_id, organization_id)
  SELECT u.id, a.organization_id
  FROM auth.users u
  JOIN public.admin_email_allowlist a ON a.email = lower(u.email)
  WHERE u.id = _user_id AND a.organization_id IS NOT NULL
    AND u.email_confirmed_at IS NOT NULL
    AND (u.confirmation_sent_at IS NOT NULL OR u.invited_at IS NOT NULL)
  ON CONFLICT DO NOTHING;
  RETURN v_found;
END $$;
REVOKE EXECUTE ON FUNCTION public.grant_allowlisted_admin(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_email_allowlist_after_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.company_id IS DISTINCT FROM OLD.company_id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    DELETE FROM public.user_roles r
    USING auth.users u
    WHERE r.user_id = u.id AND lower(u.email) = OLD.email AND r.role = OLD.role;
    IF OLD.role = 'partner' AND OLD.company_id IS NOT NULL THEN
      DELETE FROM public.user_companies uc
      USING auth.users u
      WHERE uc.user_id = u.id AND lower(u.email) = OLD.email AND uc.company_id = OLD.company_id;
    END IF;
    IF OLD.organization_id IS NOT NULL THEN
      DELETE FROM public.user_organizations uo
      USING auth.users u
      WHERE uo.user_id = u.id AND lower(u.email) = OLD.email AND uo.organization_id = OLD.organization_id;
    END IF;
    INSERT INTO public.user_roles (user_id, role)
    SELECT u.id, NEW.role FROM auth.users u
    WHERE lower(u.email) = NEW.email
      AND u.email_confirmed_at IS NOT NULL
      AND (u.confirmation_sent_at IS NOT NULL OR u.invited_at IS NOT NULL)
    ON CONFLICT DO NOTHING;
    IF NEW.role = 'partner' AND NEW.company_id IS NOT NULL THEN
      INSERT INTO public.user_companies (user_id, company_id)
      SELECT u.id, NEW.company_id FROM auth.users u
      WHERE lower(u.email) = NEW.email
        AND u.email_confirmed_at IS NOT NULL
        AND (u.confirmation_sent_at IS NOT NULL OR u.invited_at IS NOT NULL)
      ON CONFLICT DO NOTHING;
    END IF;
    IF NEW.organization_id IS NOT NULL THEN
      INSERT INTO public.user_organizations (user_id, organization_id)
      SELECT u.id, NEW.organization_id FROM auth.users u
      WHERE lower(u.email) = NEW.email
        AND u.email_confirmed_at IS NOT NULL
        AND (u.confirmation_sent_at IS NOT NULL OR u.invited_at IS NOT NULL)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_email_allowlist_after_update() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_email_allowlist_after_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.user_roles r
  USING auth.users u
  WHERE r.user_id = u.id AND lower(u.email) = OLD.email AND r.role = OLD.role;
  IF OLD.role = 'partner' AND OLD.company_id IS NOT NULL THEN
    DELETE FROM public.user_companies uc
    USING auth.users u
    WHERE uc.user_id = u.id AND lower(u.email) = OLD.email AND uc.company_id = OLD.company_id;
  END IF;
  IF OLD.organization_id IS NOT NULL THEN
    DELETE FROM public.user_organizations uo
    USING auth.users u
    WHERE uo.user_id = u.id AND lower(u.email) = OLD.email AND uo.organization_id = OLD.organization_id;
  END IF;
  RETURN OLD;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_email_allowlist_after_delete() FROM PUBLIC, anon, authenticated;

-- Commission resolution (mirrors src/lib/commission.ts) ---------------------
CREATE OR REPLACE FUNCTION public.commission_for(_equipment_id uuid, _base numeric, _qty integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e public.equipment;
  o public.organizations;
  p public.organizations;
  v_type text;
  v_value numeric;
  v_amount numeric := 0;
BEGIN
  SELECT * INTO e FROM public.equipment WHERE id = _equipment_id;
  IF e.id IS NULL THEN
    RETURN jsonb_build_object('type', NULL, 'value', NULL, 'amount', 0, 'organization_id', NULL);
  END IF;
  IF e.commission_type IS NOT NULL AND e.commission_value IS NOT NULL THEN
    v_type := e.commission_type; v_value := e.commission_value;
  ELSE
    SELECT * INTO o FROM public.organizations WHERE id = e.organization_id;
    IF o.commission_type IS NOT NULL AND o.commission_value IS NOT NULL THEN
      v_type := o.commission_type; v_value := o.commission_value;
    ELSIF o.parent_id IS NOT NULL THEN
      SELECT * INTO p FROM public.organizations WHERE id = o.parent_id;
      IF p.commission_type IS NOT NULL AND p.commission_value IS NOT NULL THEN
        v_type := p.commission_type; v_value := p.commission_value;
      END IF;
    END IF;
  END IF;
  IF v_type = 'percent' THEN
    v_amount := ROUND(GREATEST(COALESCE(_base, 0), 0) * GREATEST(v_value, 0) / 100, 2);
  ELSIF v_type = 'fixed' THEN
    v_amount := ROUND(GREATEST(v_value, 0) * GREATEST(COALESCE(_qty, 0), 0), 2);
  END IF;
  RETURN jsonb_build_object('type', v_type, 'value', v_value, 'amount', GREATEST(v_amount, 0),
                            'organization_id', e.organization_id);
END $$;
REVOKE EXECUTE ON FUNCTION public.commission_for(uuid, numeric, integer) FROM PUBLIC, anon, authenticated;

-- Order lines: always snapshot server-side; client-supplied commission fields are ignored.
CREATE OR REPLACE FUNCTION public.order_lines_apply_commission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_c jsonb; v_units numeric;
BEGIN
  v_units := COALESCE(NEW.quantity, 0) * COALESCE(NEW.days, 0);
  NEW.base_amount := v_units * COALESCE(NEW.unit_price, 0);
  NEW.commission_type := NULL; NEW.commission_value := NULL; NEW.commission_amount := 0;
  NEW.organization_id := NULL;
  IF NEW.equipment_id IS NOT NULL THEN
    v_c := public.commission_for(NEW.equipment_id, NEW.base_amount, NEW.quantity);
    NEW.organization_id := NULLIF(v_c->>'organization_id', '')::uuid;
    NEW.commission_type := v_c->>'type';
    NEW.commission_value := NULLIF(v_c->>'value', '')::numeric;
    NEW.commission_amount := COALESCE((v_c->>'amount')::numeric, 0);
    IF NEW.commission_amount > 0 AND v_units > 0 THEN
      -- Customer price per unit-day includes commission, so every existing total stays qty×days×unit_price.
      NEW.unit_price := ROUND((NEW.base_amount + NEW.commission_amount) / v_units, 6);
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.order_lines_apply_commission() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS order_lines_apply_commission ON public.order_lines;
CREATE TRIGGER order_lines_apply_commission BEFORE INSERT ON public.order_lines
  FOR EACH ROW EXECUTE FUNCTION public.order_lines_apply_commission();

-- Calculation lines: unit_price stays the base; commission shown alongside.
CREATE OR REPLACE FUNCTION public.calculation_lines_apply_commission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_c jsonb;
BEGIN
  NEW.base_amount := COALESCE(NEW.quantity, 0) * COALESCE(NEW.days, 0) * COALESCE(NEW.unit_price, 0);
  NEW.commission_type := NULL; NEW.commission_value := NULL; NEW.commission_amount := 0;
  NEW.organization_id := NULL;
  IF NEW.equipment_id IS NOT NULL THEN
    v_c := public.commission_for(NEW.equipment_id, NEW.base_amount, NEW.quantity);
    NEW.organization_id := NULLIF(v_c->>'organization_id', '')::uuid;
    NEW.commission_type := v_c->>'type';
    NEW.commission_value := NULLIF(v_c->>'value', '')::numeric;
    NEW.commission_amount := COALESCE((v_c->>'amount')::numeric, 0);
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.calculation_lines_apply_commission() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS calculation_lines_apply_commission ON public.calculation_lines;
CREATE TRIGGER calculation_lines_apply_commission BEFORE INSERT OR UPDATE ON public.calculation_lines
  FOR EACH ROW EXECUTE FUNCTION public.calculation_lines_apply_commission();
UPDATE public.calculation_lines SET quantity = quantity;

-- Pricing: price_for_base = previous engine; price_for = base + commission (customer price).
CREATE OR REPLACE FUNCTION public.price_for_base(_equipment_id uuid, _start date, _end date, _qty integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public
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
$function$;
REVOKE EXECUTE ON FUNCTION public.price_for_base(uuid, date, date, integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.price_for(_equipment_id uuid, _start date, _end date, _qty integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  b jsonb;
  c jsonb;
  v_base numeric;
  v_comm numeric;
  v_sum numeric;
  v_units numeric;
  v_qty numeric;
  v_tax numeric;
BEGIN
  b := public.price_for_base(_equipment_id, _start, _end, _qty);
  IF b ? 'error' THEN RETURN b; END IF;
  v_base := (b->>'subtotal')::numeric;
  v_units := (b->>'units')::numeric;
  v_qty := (b->>'quantity')::numeric;
  v_tax := (b->>'tax_percent')::numeric;
  c := public.commission_for(_equipment_id, v_base, v_qty::integer);
  v_comm := COALESCE((c->>'amount')::numeric, 0);
  v_sum := v_base + v_comm;
  RETURN b || jsonb_build_object(
    'base_subtotal', v_base,
    'commission_amount', v_comm,
    'unit_price', CASE WHEN v_units > 0 THEN ROUND(v_sum / (v_units * v_qty), 2) ELSE ROUND(v_sum / v_qty, 2) END,
    'subtotal', v_sum,
    'tax', ROUND(v_sum * v_tax / 100),
    'total', v_sum + ROUND(v_sum * v_tax / 100)
  );
END;
$function$;

-- Website bookings: insert base prices; the order_lines trigger adds the commission snapshot.
CREATE OR REPLACE FUNCTION public.create_booking(_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
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
  IF length(trim(COALESCE(_payload->>'website', ''))) > 0 THEN
    RETURN jsonb_build_object(
      'id', gen_random_uuid(),
      'order_number', 'AV-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 4)),
      'share_token', replace(gen_random_uuid()::text, '-', ''),
      'status', 'pending'
    );
  END IF;

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

    v_price := public.price_for_base(v_equipment.id, v_start, v_end, v_line.quantity);
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
END $function$;
REVOKE EXECUTE ON FUNCTION public.create_booking(jsonb) FROM PUBLIC, anon, authenticated;

-- My invoice ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.org_invoice_lines(_org_id uuid DEFAULT NULL, _from date DEFAULT NULL, _to date DEFAULT NULL)
RETURNS TABLE (
  order_line_id uuid, order_id uuid, order_number text, order_status text,
  starts_on date, ends_on date, item text, quantity integer, days integer,
  organization_id uuid, organization_name text,
  base_amount numeric, commission_type text, commission_value numeric,
  commission_amount numeric, net_to_org numeric
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_staff boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  v_staff := public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tester');
  IF NOT v_staff AND _org_id IS NOT NULL AND NOT public.is_member_of_organization(_org_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT ol.id, o.id, o.order_number, o.status, o.starts_on, o.ends_on, ol.description,
         ol.quantity, ol.days, ol.organization_id, org.name,
         ol.base_amount, ol.commission_type, ol.commission_value, ol.commission_amount,
         ol.base_amount
  FROM public.order_lines ol
  JOIN public.orders o ON o.id = ol.order_id
  JOIN public.organizations org ON org.id = ol.organization_id
  WHERE o.status NOT IN ('cancelled', 'pending', 'draft')
    AND (_org_id IS NULL OR ol.organization_id = _org_id OR org.parent_id = _org_id)
    AND (v_staff OR public.is_member_of_organization(ol.organization_id))
    AND (_from IS NULL OR o.ends_on >= _from)
    AND (_to IS NULL OR o.starts_on <= _to)
  ORDER BY o.starts_on DESC, o.order_number, ol.sort_order
  LIMIT 2000;
END $$;
REVOKE EXECUTE ON FUNCTION public.org_invoice_lines(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_invoice_lines(uuid, date, date) TO authenticated;
