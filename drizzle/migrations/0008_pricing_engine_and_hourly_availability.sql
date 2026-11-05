-- ============ Tax rates ============
CREATE TABLE public.tax_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  percent NUMERIC NOT NULL DEFAULT 25,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tax_rates TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_rates TO authenticated;
GRANT ALL ON public.tax_rates TO service_role;

ALTER TABLE public.tax_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tax rates are public" ON public.tax_rates
  FOR SELECT USING (true);
CREATE POLICY "Admins manage tax rates" ON public.tax_rates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.tax_rates (name, percent, is_default) VALUES
  ('Standard 25%', 25, true),
  ('Reduced 12%', 12, false),
  ('Reduced 6%', 6, false),
  ('Zero 0%', 0, false);

-- ============ Equipment: item kinds, variants, rates, deposits ============
ALTER TABLE public.equipment
  ADD COLUMN item_kind TEXT NOT NULL DEFAULT 'rental',
  ADD COLUMN parent_id UUID REFERENCES public.equipment(id) ON DELETE CASCADE,
  ADD COLUMN variant_label TEXT,
  ADD COLUMN rate_unit TEXT NOT NULL DEFAULT 'day',
  ADD COLUMN fixed_price NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN deposit_type TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN deposit_value NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN tax_rate_id UUID REFERENCES public.tax_rates(id) ON DELETE SET NULL,
  ADD COLUMN barcode TEXT;

ALTER TABLE public.equipment
  ADD CONSTRAINT equipment_item_kind_check CHECK (item_kind IN ('rental', 'service', 'bundle')),
  ADD CONSTRAINT equipment_rate_unit_check CHECK (rate_unit IN ('hour', 'day', 'week', 'month', 'fixed')),
  ADD CONSTRAINT equipment_deposit_type_check CHECK (deposit_type IN ('none', 'fixed', 'percent'));

CREATE INDEX equipment_parent_idx ON public.equipment (parent_id);
CREATE UNIQUE INDEX equipment_barcode_idx ON public.equipment (barcode) WHERE barcode IS NOT NULL;

UPDATE public.equipment e SET item_kind = 'bundle'
WHERE EXISTS (SELECT 1 FROM public.product_components pc WHERE pc.parent_equipment_id = e.id);

UPDATE public.equipment SET tax_rate_id = (SELECT id FROM public.tax_rates WHERE is_default LIMIT 1)
WHERE tax_rate_id IS NULL;

-- ============ Price rules: day tiers + calendar modifiers ============
CREATE TABLE public.price_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID REFERENCES public.equipment(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL CHECK (kind IN ('tier', 'calendar')),
  from_day INTEGER,
  to_day INTEGER,
  day_price NUMERIC,
  weekdays INTEGER[] NOT NULL DEFAULT '{}'::integer[],
  starts_on DATE,
  ends_on DATE,
  adjust_type TEXT CHECK (adjust_type IN ('percent', 'amount')),
  adjust_value NUMERIC NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.price_rules TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_rules TO authenticated;
GRANT ALL ON public.price_rules TO service_role;

ALTER TABLE public.price_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Price rules are public" ON public.price_rules
  FOR SELECT USING (true);
CREATE POLICY "Admins manage price rules" ON public.price_rules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER price_rules_updated_at BEFORE UPDATE ON public.price_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX price_rules_lookup_idx ON public.price_rules (kind, equipment_id, is_active);

-- Example weekend surcharge, switched off so current prices stay unchanged.
INSERT INTO public.price_rules (name, kind, weekdays, adjust_type, adjust_value, priority, is_active)
VALUES ('Weekend surcharge (example)', 'calendar', '{5,6}'::integer[], 'percent', 10, 10, false);

-- ============ Hourly rental windows on order lines ============
ALTER TABLE public.order_lines
  ADD COLUMN starts_at TIMESTAMPTZ,
  ADD COLUMN ends_at TIMESTAMPTZ,
  ADD COLUMN tax_percent NUMERIC NOT NULL DEFAULT 25,
  ADD COLUMN deposit_amount NUMERIC NOT NULL DEFAULT 0;

UPDATE public.order_lines l
SET starts_at = COALESCE(l.starts_on, o.starts_on)::timestamptz,
    ends_at = (COALESCE(l.ends_on, o.ends_on) + 1)::timestamptz
FROM public.orders o
WHERE o.id = l.order_id AND l.starts_at IS NULL;

CREATE OR REPLACE FUNCTION public.order_lines_set_window()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
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
$$;

CREATE TRIGGER order_lines_set_window_trg BEFORE INSERT OR UPDATE ON public.order_lines
  FOR EACH ROW EXECUTE FUNCTION public.order_lines_set_window();

CREATE INDEX order_lines_window_idx ON public.order_lines (equipment_id, starts_at, ends_at);

-- ============ Availability: hourly overlap ============
CREATE OR REPLACE FUNCTION public.equipment_reserved_at(
  _equipment_id UUID,
  _start TIMESTAMPTZ,
  _end TIMESTAMPTZ,
  _exclude_order UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.available_quantity_at(
  _equipment_id UUID,
  _start TIMESTAMPTZ,
  _end TIMESTAMPTZ,
  _exclude_order UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;

-- Existing date-based helpers now delegate to the hourly engine.
CREATE OR REPLACE FUNCTION public.equipment_reserved(
  _equipment_id UUID, _start DATE, _end DATE, _exclude_order UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.equipment_reserved_at(_equipment_id, _start::timestamptz, (_end + 1)::timestamptz, _exclude_order);
$$;

CREATE OR REPLACE FUNCTION public.available_quantity(
  _equipment_id UUID, _start DATE, _end DATE, _exclude_order UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.available_quantity_at(_equipment_id, _start::timestamptz, (_end + 1)::timestamptz, _exclude_order);
$$;

GRANT EXECUTE ON FUNCTION public.equipment_reserved_at(UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.available_quantity_at(UUID, TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO anon, authenticated, service_role;

-- ============ Pricing engine ============
CREATE OR REPLACE FUNCTION public.price_for(
  _equipment_id UUID,
  _start DATE,
  _end DATE,
  _qty INTEGER DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.price_for(UUID, DATE, DATE, INTEGER) TO anon, authenticated, service_role;

-- ============ Booking creation now uses the pricing engine ============
CREATE OR REPLACE FUNCTION public.create_booking(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_start DATE := (_payload->>'starts_on')::DATE;
  v_end DATE := (_payload->>'ends_on')::DATE;
  v_customer UUID;
  v_order public.orders;
  v_item JSONB;
  v_equipment public.equipment;
  v_days INTEGER;
  v_available INTEGER;
  v_qty INTEGER;
  v_rules public.business_rules;
  v_method TEXT := COALESCE(NULLIF(_payload->>'shipping_method', ''), 'pickup');
  v_ship JSONB;
  v_price JSONB;
  v_deposit NUMERIC := 0;
BEGIN
  IF v_start IS NULL OR v_end IS NULL OR v_end < v_start THEN
    RAISE EXCEPTION 'invalid_dates';
  END IF;
  IF length(COALESCE(_payload->>'customer_name', '')) < 2 THEN RAISE EXCEPTION 'invalid_name'; END IF;
  IF POSITION('@' IN COALESCE(_payload->>'customer_email', '')) < 2 THEN RAISE EXCEPTION 'invalid_email'; END IF;
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
  IF jsonb_array_length(COALESCE(_payload->'items', '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'empty_cart';
  END IF;
  IF jsonb_array_length(_payload->'items') > 50 THEN RAISE EXCEPTION 'too_many_items'; END IF;

  PERFORM 1 FROM public.equipment e
  WHERE e.id IN (
    SELECT (i->>'equipment_id')::UUID FROM jsonb_array_elements(_payload->'items') i
  )
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
    left(trim(_payload->>'customer_email'), 200),
    left(COALESCE(NULLIF(trim(_payload->>'customer_phone'), ''), ''), 40),
    NULLIF(left(trim(COALESCE(_payload->>'customer_company', '')), 120), ''),
    NULLIF(left(trim(COALESCE(_payload->>'delivery_address', '')), 200), ''),
    NULLIF(left(trim(COALESCE(_payload->>'delivery_postal_code', '')), 20), ''),
    NULLIF(left(trim(COALESCE(_payload->>'delivery_city', '')), 80), '')
  ) RETURNING id INTO v_customer;

  INSERT INTO public.orders (
    customer_id, status, starts_on, ends_on, shipping_method, shipping_zone_id, shipping_cost,
    delivery_address, delivery_postal_code, delivery_city, customer_note, vat_percent, source
  ) VALUES (
    v_customer, 'draft', v_start, v_end, v_method,
    NULLIF(v_ship->>'zone_id', '')::UUID,
    COALESCE((v_ship->>'cost')::NUMERIC, 0),
    NULLIF(left(trim(COALESCE(_payload->>'delivery_address', '')), 200), ''),
    NULLIF(left(trim(COALESCE(_payload->>'delivery_postal_code', '')), 20), ''),
    NULLIF(left(trim(COALESCE(_payload->>'delivery_city', '')), 80), ''),
    NULLIF(left(trim(COALESCE(_payload->>'customer_note', '')), 2000), ''),
    COALESCE(v_rules.vat_percent, 25),
    'website'
  ) RETURNING * INTO v_order;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_payload->'items') LOOP
    SELECT * INTO v_equipment FROM public.equipment WHERE id = (v_item->>'equipment_id')::UUID AND is_active;
    IF v_equipment.id IS NULL THEN RAISE EXCEPTION 'unknown_item'; END IF;
    v_qty := GREATEST(LEAST(COALESCE((v_item->>'quantity')::INTEGER, 1), 100), 1);

    IF v_equipment.item_kind <> 'service' THEN
      v_available := public.available_quantity(v_equipment.id, v_start, v_end, v_order.id);
      IF v_qty > v_available THEN
        RAISE EXCEPTION 'unavailable:%:%', v_equipment.name, v_available;
      END IF;
    END IF;

    v_price := public.price_for(v_equipment.id, v_start, v_end, v_qty);
    v_deposit := v_deposit + COALESCE((v_price->>'deposit')::NUMERIC, 0);

    INSERT INTO public.order_lines (
      order_id, equipment_id, description, quantity, days, unit_price, starts_on, ends_on,
      sort_order, tax_percent, deposit_amount
    ) VALUES (
      v_order.id, v_equipment.id, v_equipment.name, v_qty,
      GREATEST(COALESCE((v_price->>'units')::NUMERIC, v_days), 1)::INTEGER,
      COALESCE((v_price->>'unit_price')::NUMERIC, v_equipment.daily_price),
      v_start, v_end, v_equipment.sort_order,
      COALESCE((v_price->>'tax_percent')::NUMERIC, 25),
      COALESCE((v_price->>'deposit')::NUMERIC, 0)
    );
  END LOOP;

  UPDATE public.orders SET status = 'reserved', deposit_amount = v_deposit
  WHERE id = v_order.id RETURNING * INTO v_order;

  RETURN jsonb_build_object(
    'id', v_order.id,
    'order_number', v_order.order_number,
    'share_token', v_order.share_token
  );
END;
$$;
