-- One-off: renumber the two physical units of "75″ LED" from item numbers 008/009 to 001/002.
-- Same mechanics as unit_serial_repair: the old S/N stays in serial_codes as an alias (so it keeps scanning),
-- the new S/N is registered, and the item counter is set so the next unit of this item becomes 003.
DO $$
DECLARE
  v_eq   uuid := '78ba8c8d-336e-40c0-abe2-ff8ccad1c3b2';
  v_u1   uuid := '3d061616-103d-43b4-9544-3282b5f9c39a'; -- currently DCB109-DS008
  v_u2   uuid := '0907e481-c4ba-490e-847b-cdb7233d4ea7'; -- currently DCB110-DS009
  v_old1 text := 'DCB109-DS008'; v_new1 text := 'DCB109-DS001';
  v_old2 text := 'DCB110-DS009'; v_new2 text := 'DCB110-DS002';
  r record;
BEGIN
  -- Skip if already renumbered (idempotent).
  IF NOT EXISTS (SELECT 1 FROM public.stock_items WHERE id = v_u1 AND serial_code = v_old1) THEN
    RETURN;
  END IF;

  -- Fail closed: the new codes must answer to nothing else.
  FOR r IN SELECT unnest(ARRAY[v_new1, v_new2]) AS code LOOP
    IF EXISTS (SELECT 1 FROM public.serial_codes WHERE code = r.code)
       OR EXISTS (SELECT 1 FROM public.stock_items WHERE serial_code = r.code OR barcode = r.code)
       OR EXISTS (SELECT 1 FROM public.equipment WHERE serial_code = r.code OR barcode = r.code OR upper(COALESCE(legacy_barcode,'')) = r.code) THEN
      RAISE EXCEPTION 'new_code_in_use:%', r.code;
    END IF;
  END LOOP;

  PERFORM pg_advisory_xact_lock(hashtext('unit_serial_repair'));
  PERFORM set_config('renthub.serial_repair', 'on', true);

  -- Old S/N become aliases (still scannable, never reissued).
  UPDATE public.serial_codes SET kind = 'alias', replaced_at = now()
  WHERE code IN (v_old1, v_old2) AND stock_item_id IN (v_u1, v_u2);

  UPDATE public.stock_items SET
    serial_code = v_new1, sn_item_no = 1,
    barcode = CASE WHEN barcode = v_old1 THEN v_new1 ELSE barcode END
  WHERE id = v_u1;

  UPDATE public.stock_items SET
    serial_code = v_new2, sn_item_no = 2,
    barcode = CASE WHEN barcode = v_old2 THEN v_new2 ELSE barcode END
  WHERE id = v_u2;

  PERFORM set_config('renthub.serial_repair', 'off', true);

  INSERT INTO public.serial_codes (code, stock_item_id) VALUES (v_new1, v_u1), (v_new2, v_u2);

  INSERT INTO public.unit_movements (stock_item_id, action, from_status, to_status, reference, note)
  VALUES
    (v_u1, 'sn_changed', 'in_stock', 'in_stock', 'sn-renumber-2026-11-05', format('S/N %s → %s', v_old1, v_new1)),
    (v_u2, 'sn_changed', 'in_stock', 'in_stock', 'sn-renumber-2026-11-05', format('S/N %s → %s', v_old2, v_new2));

  -- Next unit of this item gets item number 003.
  UPDATE public.serial_counters SET last_value = 2, updated_at = now()
  WHERE scope = 'item:' || v_eq::text;
END $$;
