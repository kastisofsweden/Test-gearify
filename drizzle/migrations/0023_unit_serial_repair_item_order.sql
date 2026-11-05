-- Repair order follows each item's unit number (units created in one batch share created_at),
-- so the lowest unit number of a shared organization number keeps it and the rest are renumbered in order.
CREATE OR REPLACE FUNCTION public.unit_serial_repair(_apply boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
END $$;
REVOKE ALL ON FUNCTION public.unit_serial_repair(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unit_serial_repair(boolean) TO authenticated, service_role;
