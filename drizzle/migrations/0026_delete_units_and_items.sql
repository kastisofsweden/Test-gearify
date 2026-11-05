-- Units that never left the warehouse (only "created"/"sn_changed" log rows, no order assignments,
-- not with a customer) may be deleted for real. Units with rental history must be retired instead.
CREATE OR REPLACE FUNCTION public.unit_has_rental_history(_unit_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.stock_items s WHERE s.id = _unit_id AND s.status = 'with_customer')
      OR EXISTS (SELECT 1 FROM public.stock_item_assignments a WHERE a.stock_item_id = _unit_id)
      OR EXISTS (
        SELECT 1 FROM public.unit_movements m
        WHERE m.stock_item_id = _unit_id AND m.action NOT IN ('created', 'sn_changed')
      );
$$;

-- Allow the purge path (only set inside the delete RPCs below) to remove a unit's creation log.
CREATE OR REPLACE FUNCTION public.unit_movements_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.stock_items_before_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.unit_movements m WHERE m.stock_item_id = OLD.id) THEN
    RAISE EXCEPTION 'unit_has_history: retire unit % instead of deleting it', OLD.serial_code;
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_units(_unit_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.delete_item(_equipment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.delete_units(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_item(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unit_has_rental_history(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_units(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_item(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unit_has_rental_history(uuid) TO authenticated;
