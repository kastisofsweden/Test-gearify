-- 1. Equipment extensions (additive)
ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS tracking TEXT NOT NULL DEFAULT 'bulk',
  ADD COLUMN IF NOT EXISTS sku TEXT,
  ADD COLUMN IF NOT EXISTS page_type TEXT,
  ADD COLUMN IF NOT EXISTS page_slug TEXT;

-- 2. Customers
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,
  address TEXT,
  postal_code TEXT,
  city TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage customers" ON public.customers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Shipping zones
CREATE TABLE IF NOT EXISTS public.shipping_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  cities TEXT[] NOT NULL DEFAULT '{}',
  postal_prefixes TEXT[] NOT NULL DEFAULT '{}',
  base_fee NUMERIC NOT NULL DEFAULT 0,
  per_km NUMERIC NOT NULL DEFAULT 0,
  distance_km NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.shipping_zones TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shipping_zones TO authenticated;
GRANT ALL ON public.shipping_zones TO service_role;
ALTER TABLE public.shipping_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Active zones are public" ON public.shipping_zones FOR SELECT TO anon, authenticated
  USING (is_active OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage zones" ON public.shipping_zones FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. Business rules (singleton)
CREATE TABLE IF NOT EXISTS public.business_rules (
  id BOOLEAN PRIMARY KEY DEFAULT true,
  min_rental_days INTEGER NOT NULL DEFAULT 1,
  lead_time_days INTEGER NOT NULL DEFAULT 1,
  max_horizon_days INTEGER NOT NULL DEFAULT 365,
  closed_weekdays INTEGER[] NOT NULL DEFAULT '{}',
  vat_percent NUMERIC NOT NULL DEFAULT 25,
  pickup_location TEXT NOT NULL DEFAULT 'Nikolaigatan 10, 702 10 Örebro',
  terms TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT business_rules_singleton CHECK (id)
);
GRANT SELECT ON public.business_rules TO anon;
GRANT SELECT, INSERT, UPDATE ON public.business_rules TO authenticated;
GRANT ALL ON public.business_rules TO service_role;
ALTER TABLE public.business_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Rules are public" ON public.business_rules FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage rules" ON public.business_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5. Orders
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL UNIQUE DEFAULT ('AV-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4))),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  offer_id UUID REFERENCES public.offers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  starts_on DATE NOT NULL DEFAULT CURRENT_DATE,
  ends_on DATE NOT NULL DEFAULT CURRENT_DATE,
  discount_percent NUMERIC NOT NULL DEFAULT 0,
  vat_percent NUMERIC NOT NULL DEFAULT 25,
  shipping_method TEXT NOT NULL DEFAULT 'pickup',
  shipping_zone_id UUID REFERENCES public.shipping_zones(id) ON DELETE SET NULL,
  shipping_cost NUMERIC NOT NULL DEFAULT 0,
  delivery_address TEXT,
  delivery_postal_code TEXT,
  delivery_city TEXT,
  customer_note TEXT,
  internal_notes TEXT,
  source TEXT NOT NULL DEFAULT 'website',
  share_token TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  deposit_amount NUMERIC NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  picked_up_at TIMESTAMPTZ,
  returned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage orders" ON public.orders FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS orders_status_dates_idx ON public.orders (status, starts_on, ends_on);

-- 6. Order lines
CREATE TABLE IF NOT EXISTS public.order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  equipment_id UUID REFERENCES public.equipment(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  days INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  starts_on DATE,
  ends_on DATE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_lines TO authenticated;
GRANT ALL ON public.order_lines TO service_role;
ALTER TABLE public.order_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage order lines" ON public.order_lines FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS order_lines_equipment_dates_idx ON public.order_lines (equipment_id, starts_on, ends_on);
CREATE INDEX IF NOT EXISTS order_lines_order_idx ON public.order_lines (order_id);

-- 7. Product components (kit contents)
CREATE TABLE IF NOT EXISTS public.product_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_equipment_id UUID NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  child_equipment_id UUID NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (parent_equipment_id, child_equipment_id)
);
GRANT SELECT ON public.product_components TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_components TO authenticated;
GRANT ALL ON public.product_components TO service_role;
ALTER TABLE public.product_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Components are public" ON public.product_components FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins manage components" ON public.product_components FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 8. Stock items (serialized units)
CREATE TABLE IF NOT EXISTS public.stock_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id UUID NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  identifier TEXT NOT NULL,
  barcode TEXT,
  status TEXT NOT NULL DEFAULT 'in_stock',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (equipment_id, identifier)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_items TO authenticated;
GRANT ALL ON public.stock_items TO service_role;
ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage stock items" ON public.stock_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS stock_items_equipment_idx ON public.stock_items (equipment_id, status);

-- 9. Stock item assignments
CREATE TABLE IF NOT EXISTS public.stock_item_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_line_id UUID NOT NULL REFERENCES public.order_lines(id) ON DELETE CASCADE,
  stock_item_id UUID NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  checked_out_at TIMESTAMPTZ,
  returned_at TIMESTAMPTZ,
  damaged BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_line_id, stock_item_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_item_assignments TO authenticated;
GRANT ALL ON public.stock_item_assignments TO service_role;
ALTER TABLE public.stock_item_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage assignments" ON public.stock_item_assignments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 10. Order events (status history)
CREATE TABLE IF NOT EXISTS public.order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  note TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.order_events TO authenticated;
GRANT ALL ON public.order_events TO service_role;
ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read order events" ON public.order_events FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins write order events" ON public.order_events FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE INDEX IF NOT EXISTS order_events_order_idx ON public.order_events (order_id, created_at DESC);

-- 11. updated_at triggers
DROP TRIGGER IF EXISTS customers_updated_at ON public.customers;
CREATE TRIGGER customers_updated_at BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS orders_updated_at ON public.orders;
CREATE TRIGGER orders_updated_at BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS stock_items_updated_at ON public.stock_items;
CREATE TRIGGER stock_items_updated_at BEFORE UPDATE ON public.stock_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS shipping_zones_updated_at ON public.shipping_zones;
CREATE TRIGGER shipping_zones_updated_at BEFORE UPDATE ON public.shipping_zones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 12. Availability engine
CREATE OR REPLACE FUNCTION public.equipment_total_units(_equipment_id UUID)
RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN e.tracking = 'serialized' THEN (
      SELECT count(*)::int FROM public.stock_items s
      WHERE s.equipment_id = e.id AND s.status IN ('in_stock', 'with_customer')
    )
    ELSE e.quantity
  END
  FROM public.equipment e WHERE e.id = _equipment_id;
$$;

CREATE OR REPLACE FUNCTION public.equipment_reserved(
  _equipment_id UUID, _start DATE, _end DATE, _exclude_order UUID DEFAULT NULL
) RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(demand), 0)::int FROM (
    -- direct lines
    SELECT l.quantity AS demand
    FROM public.order_lines l
    JOIN public.orders o ON o.id = l.order_id
    WHERE l.equipment_id = _equipment_id
      AND o.status IN ('reserved', 'picked_up')
      AND (_exclude_order IS NULL OR o.id <> _exclude_order)
      AND COALESCE(l.starts_on, o.starts_on) <= _end
      AND COALESCE(l.ends_on, o.ends_on) >= _start
    UNION ALL
    -- lines for kits that contain this equipment
    SELECT l.quantity * pc.quantity AS demand
    FROM public.order_lines l
    JOIN public.orders o ON o.id = l.order_id
    JOIN public.product_components pc ON pc.parent_equipment_id = l.equipment_id
    WHERE pc.child_equipment_id = _equipment_id
      AND o.status IN ('reserved', 'picked_up')
      AND (_exclude_order IS NULL OR o.id <> _exclude_order)
      AND COALESCE(l.starts_on, o.starts_on) <= _end
      AND COALESCE(l.ends_on, o.ends_on) >= _start
  ) d;
$$;

CREATE OR REPLACE FUNCTION public.available_quantity(
  _equipment_id UUID, _start DATE, _end DATE, _exclude_order UUID DEFAULT NULL
) RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT GREATEST(
    public.equipment_total_units(_equipment_id)
      - public.equipment_reserved(_equipment_id, _start, _end, _exclude_order),
    0
  );
$$;

GRANT EXECUTE ON FUNCTION public.equipment_total_units(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.equipment_reserved(UUID, DATE, DATE, UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.available_quantity(UUID, DATE, DATE, UUID) TO anon, authenticated, service_role;

-- 13. Status machine + event log
CREATE OR REPLACE FUNCTION public.orders_validate_status()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE allowed TEXT[];
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  allowed := CASE OLD.status
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
  IF NEW.status = 'picked_up' AND NEW.picked_up_at IS NULL THEN NEW.picked_up_at := now(); END IF;
  IF NEW.status = 'returned' AND NEW.returned_at IS NULL THEN NEW.returned_at := now(); END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS orders_validate_status_trg ON public.orders;
CREATE TRIGGER orders_validate_status_trg BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_validate_status();

CREATE OR REPLACE FUNCTION public.orders_log_status()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.order_events (order_id, from_status, to_status, created_by)
    VALUES (NEW.id, NULL, NEW.status, auth.uid());
  ELSIF NEW.status <> OLD.status THEN
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
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS orders_log_status_trg ON public.orders;
CREATE TRIGGER orders_log_status_trg AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_log_status();

-- 14. Booking creation with pessimistic locking
CREATE OR REPLACE FUNCTION public.create_booking(_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_start DATE := (_payload->>'starts_on')::DATE;
  v_end DATE := (_payload->>'ends_on')::DATE;
  v_customer UUID;
  v_order public.orders;
  v_item JSONB;
  v_equipment public.equipment;
  v_days INTEGER;
  v_available INTEGER;
  v_rules public.business_rules;
BEGIN
  IF v_start IS NULL OR v_end IS NULL OR v_end < v_start THEN
    RAISE EXCEPTION 'invalid_dates';
  END IF;
  SELECT * INTO v_rules FROM public.business_rules WHERE id LIMIT 1;
  v_days := (v_end - v_start) + 1;
  IF v_rules.min_rental_days IS NOT NULL AND v_days < v_rules.min_rental_days THEN
    RAISE EXCEPTION 'min_rental_days:%', v_rules.min_rental_days;
  END IF;
  IF v_rules.lead_time_days IS NOT NULL AND v_start < CURRENT_DATE + v_rules.lead_time_days THEN
    RAISE EXCEPTION 'lead_time_days:%', v_rules.lead_time_days;
  END IF;
  IF jsonb_array_length(COALESCE(_payload->'items', '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'empty_cart';
  END IF;

  -- lock every referenced equipment row so concurrent checkouts serialize
  PERFORM 1 FROM public.equipment e
  WHERE e.id IN (
    SELECT (i->>'equipment_id')::UUID FROM jsonb_array_elements(_payload->'items') i
  )
  ORDER BY e.id
  FOR UPDATE;

  INSERT INTO public.customers (name, email, phone, company, address, postal_code, city)
  VALUES (
    COALESCE(NULLIF(_payload->>'customer_name', ''), 'Okänd kund'),
    NULLIF(_payload->>'customer_email', ''),
    NULLIF(_payload->>'customer_phone', ''),
    NULLIF(_payload->>'customer_company', ''),
    NULLIF(_payload->>'delivery_address', ''),
    NULLIF(_payload->>'delivery_postal_code', ''),
    NULLIF(_payload->>'delivery_city', '')
  ) RETURNING id INTO v_customer;

  INSERT INTO public.orders (
    customer_id, status, starts_on, ends_on, shipping_method, shipping_zone_id, shipping_cost,
    delivery_address, delivery_postal_code, delivery_city, customer_note, vat_percent, source
  ) VALUES (
    v_customer, 'draft', v_start, v_end,
    COALESCE(NULLIF(_payload->>'shipping_method', ''), 'pickup'),
    NULLIF(_payload->>'shipping_zone_id', '')::UUID,
    COALESCE((_payload->>'shipping_cost')::NUMERIC, 0),
    NULLIF(_payload->>'delivery_address', ''),
    NULLIF(_payload->>'delivery_postal_code', ''),
    NULLIF(_payload->>'delivery_city', ''),
    NULLIF(_payload->>'customer_note', ''),
    COALESCE(v_rules.vat_percent, 25),
    COALESCE(NULLIF(_payload->>'source', ''), 'website')
  ) RETURNING * INTO v_order;

  FOR v_item IN SELECT * FROM jsonb_array_elements(_payload->'items') LOOP
    SELECT * INTO v_equipment FROM public.equipment WHERE id = (v_item->>'equipment_id')::UUID AND is_active;
    IF v_equipment.id IS NULL THEN RAISE EXCEPTION 'unknown_item'; END IF;
    v_available := public.available_quantity(v_equipment.id, v_start, v_end, v_order.id);
    IF COALESCE((v_item->>'quantity')::INTEGER, 1) > v_available THEN
      RAISE EXCEPTION 'unavailable:%:%', v_equipment.name, v_available;
    END IF;
    INSERT INTO public.order_lines (
      order_id, equipment_id, description, quantity, days, unit_price, starts_on, ends_on, sort_order
    ) VALUES (
      v_order.id, v_equipment.id, v_equipment.name,
      GREATEST(COALESCE((v_item->>'quantity')::INTEGER, 1), 1),
      v_days, v_equipment.daily_price, v_start, v_end, v_equipment.sort_order
    );
  END LOOP;

  UPDATE public.orders SET status = 'reserved' WHERE id = v_order.id RETURNING * INTO v_order;

  RETURN jsonb_build_object(
    'id', v_order.id,
    'order_number', v_order.order_number,
    'share_token', v_order.share_token
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_booking(JSONB) TO anon, authenticated, service_role;
