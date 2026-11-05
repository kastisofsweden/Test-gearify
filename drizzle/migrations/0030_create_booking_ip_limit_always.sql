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
END $$;

REVOKE ALL ON FUNCTION public.create_booking(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_booking(jsonb) TO service_role;
