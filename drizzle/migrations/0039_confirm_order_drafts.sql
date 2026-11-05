-- Draft orders are also reserved only through confirm_order (row-locked availability re-check).
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
END $function$;

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
END $function$;

REVOKE ALL ON FUNCTION public.confirm_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_order(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.orders_validate_status() FROM PUBLIC, anon, authenticated;
