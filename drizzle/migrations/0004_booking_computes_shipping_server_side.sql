CREATE OR REPLACE FUNCTION public.resolve_shipping(_method TEXT, _zone_id UUID, _postal TEXT, _city TEXT)
RETURNS public.shipping_zones LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
$$;
GRANT EXECUTE ON FUNCTION public.resolve_shipping(TEXT, UUID, TEXT, TEXT) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.shipping_cost_for(_method TEXT, _zone_id UUID, _postal TEXT, _city TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
$$;
GRANT EXECUTE ON FUNCTION public.shipping_cost_for(TEXT, UUID, TEXT, TEXT) TO anon, authenticated, service_role;

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
  v_qty INTEGER;
  v_rules public.business_rules;
  v_method TEXT := COALESCE(NULLIF(_payload->>'shipping_method', ''), 'pickup');
  v_ship JSONB;
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
    v_available := public.available_quantity(v_equipment.id, v_start, v_end, v_order.id);
    IF v_qty > v_available THEN
      RAISE EXCEPTION 'unavailable:%:%', v_equipment.name, v_available;
    END IF;
    INSERT INTO public.order_lines (
      order_id, equipment_id, description, quantity, days, unit_price, starts_on, ends_on, sort_order
    ) VALUES (
      v_order.id, v_equipment.id, v_equipment.name, v_qty, v_days,
      v_equipment.daily_price, v_start, v_end, v_equipment.sort_order
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
