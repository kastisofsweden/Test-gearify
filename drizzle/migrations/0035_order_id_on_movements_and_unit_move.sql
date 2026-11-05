-- Unit movements keep their order link when an order status change moves units,
-- and unit_move refuses inactive orders and retired units.
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
$function$;

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
$function$;

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
$function$;

REVOKE ALL ON FUNCTION public.orders_log_status() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stock_items_log_status_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unit_move(uuid[], text, uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unit_move(uuid[], text, uuid, text, boolean) TO authenticated;
