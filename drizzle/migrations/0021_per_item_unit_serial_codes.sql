-- Unit S/N = <ORG><item no>-<CC><unit no within the item>, e.g. DCB008-DS003.
-- The item number comes from the main organization's shared counter (one per Item, fixed at creation);
-- the unit number comes from a separate counter per Item. Both are issued server-side and never reused.

-- 1) Fixed S/N base per Item.
ALTER TABLE public.equipment ADD COLUMN sn_prefix text;
ALTER TABLE public.equipment ADD COLUMN sn_org_no bigint;
ALTER TABLE public.equipment ADD COLUMN sn_category_code text;
COMMENT ON COLUMN public.equipment.sn_prefix IS 'Main-organization prefix of this item''s unit S/Ns (fixed at creation).';
COMMENT ON COLUMN public.equipment.sn_org_no IS 'Item number from the main organization''s shared counter; first part of every unit S/N (fixed).';
COMMENT ON COLUMN public.equipment.sn_category_code IS 'Two-letter category code used in this item''s unit S/Ns (fixed; a later category change does not renumber).';
COMMENT ON COLUMN public.equipment.serial_code IS 'Product-level code (legacy for items created before per-unit S/N; <ORG><NNN>-<CC>000 for new items). Searchable and scannable at product level, never a unit S/N.';

-- Backfill from the existing product code: DCB008-DS002 -> DCB / 8 / DS (with -KK overflow: n = KK*999 + NNN).
UPDATE public.equipment e
SET sn_prefix = m[1],
    sn_org_no = COALESCE(NULLIF(m[5], '')::bigint, 0) * 999 + m[2]::bigint,
    sn_category_code = m[3]
FROM (
  SELECT id, regexp_match(serial_code, '^([A-Z]{1,6})([0-9]{3})-([A-Z]{2})([0-9]{3})(?:-([0-9]{2,}))?$') AS m
  FROM public.equipment
) p
WHERE p.id = e.id AND p.m IS NOT NULL AND e.sn_org_no IS NULL;

-- 2) Formatting: unit number 0..999 (0 = product-level code), -KK suffix from the item number overflow.
CREATE OR REPLACE FUNCTION public.format_unit_serial_code(_prefix text, _category_code text, _n_org bigint, _n_unit bigint)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE k bigint;
BEGIN
  IF _n_org IS NULL OR _n_org < 1 OR _n_unit IS NULL OR _n_unit < 0 THEN RAISE EXCEPTION 'invalid_serial_counter'; END IF;
  IF _n_unit > 999 THEN RAISE EXCEPTION 'item_unit_limit: an item can have at most 999 units'; END IF;
  k := (_n_org - 1) / 999;
  RETURN _prefix || lpad((((_n_org - 1) % 999) + 1)::text, 3, '0')
    || '-' || _category_code || lpad(_n_unit::text, 3, '0')
    || CASE WHEN k >= 1 THEN '-' || CASE WHEN k < 100 THEN lpad(k::text, 2, '0') ELSE k::text END ELSE '' END;
END $$;

-- 3) Next item number from the main organization's shared counter (sub-orgs share it).
CREATE OR REPLACE FUNCTION public.next_org_serial_number(_org_id uuid, OUT prefix text, OUT n bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_root uuid := _org_id;
  v_parent uuid;
  v_depth integer := 0;
  v_name text;
  v_locked boolean;
BEGIN
  WHILE v_root IS NOT NULL LOOP
    SELECT o.parent_id INTO v_parent FROM public.organizations o WHERE o.id = v_root;
    IF NOT FOUND THEN v_root := NULL; EXIT; END IF;
    EXIT WHEN v_parent IS NULL;
    v_root := v_parent;
    v_depth := v_depth + 1;
    IF v_depth > 20 THEN RAISE EXCEPTION 'organization_cycle'; END IF;
  END LOOP;
  IF v_root IS NULL THEN
    SELECT o.id INTO v_root FROM public.organizations o
    WHERE o.parent_id IS NULL ORDER BY o.is_active DESC, o.created_at, o.id LIMIT 1;
  END IF;
  IF v_root IS NULL THEN
    prefix := 'X';
  ELSE
    SELECT o.item_prefix, o.name, o.item_prefix_locked INTO prefix, v_name, v_locked
    FROM public.organizations o WHERE o.id = v_root FOR UPDATE;
    prefix := COALESCE(NULLIF(public.letters_only(prefix), ''), public.derive_org_prefix(v_name));
    IF NOT v_locked THEN
      UPDATE public.organizations SET item_prefix = prefix, item_prefix_locked = true WHERE id = v_root;
    END IF;
  END IF;
  INSERT INTO public.serial_counters AS c (scope, last_value) VALUES ('org:' || prefix, 1)
  ON CONFLICT (scope) DO UPDATE SET last_value = c.last_value + 1, updated_at = now()
  RETURNING c.last_value INTO n;
END $$;
REVOKE ALL ON FUNCTION public.next_org_serial_number(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_org_serial_number(uuid) TO service_role;

-- 4) Next unit S/N for an item: per-item counter (row-locked upsert), skipping any code already registered
--    (e.g. the item's own legacy product code), so a code is never shared or reused.
CREATE OR REPLACE FUNCTION public.next_unit_serial_code(_equipment_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prefix text; v_org bigint; v_cc text; v_n bigint; v_code text;
BEGIN
  SELECT e.sn_prefix, e.sn_org_no, e.sn_category_code INTO v_prefix, v_org, v_cc
  FROM public.equipment e WHERE e.id = _equipment_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'item_has_no_serial_base'; END IF;
  LOOP
    INSERT INTO public.serial_counters AS c (scope, last_value) VALUES ('item:' || _equipment_id::text, 1)
    ON CONFLICT (scope) DO UPDATE SET last_value = c.last_value + 1, updated_at = now()
    RETURNING c.last_value INTO v_n;
    v_code := public.format_unit_serial_code(v_prefix, v_cc, v_org, v_n);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.serial_codes sc WHERE sc.code = v_code);
  END LOOP;
  RETURN v_code;
END $$;
REVOKE ALL ON FUNCTION public.next_unit_serial_code(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_unit_serial_code(uuid) TO service_role;

-- 5) New items: fixed base + product-level code <ORG><NNN>-<CC>000 (never collides with a unit S/N).
CREATE OR REPLACE FUNCTION public.equipment_assign_serial_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prefix text; v_n bigint;
BEGIN
  SELECT s.prefix, s.n INTO v_prefix, v_n FROM public.next_org_serial_number(NEW.organization_id) s;
  NEW.sn_prefix := v_prefix;
  NEW.sn_org_no := v_n;
  NEW.sn_category_code := public.serial_category_code(NEW.category);
  NEW.serial_code := public.format_unit_serial_code(v_prefix, NEW.sn_category_code, v_n, 0);
  NEW.legacy_barcode := NULL;
  IF NEW.barcode IS NULL OR btrim(NEW.barcode) = '' THEN
    NEW.barcode := NEW.serial_code;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.equipment_serial_code_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.serial_code IS DISTINCT FROM OLD.serial_code THEN RAISE EXCEPTION 'serial_code_immutable'; END IF;
  IF OLD.legacy_barcode IS NOT NULL AND NEW.legacy_barcode IS DISTINCT FROM OLD.legacy_barcode THEN
    RAISE EXCEPTION 'legacy_barcode_immutable';
  END IF;
  IF OLD.sn_org_no IS NOT NULL AND (
    NEW.sn_org_no IS DISTINCT FROM OLD.sn_org_no
    OR NEW.sn_prefix IS DISTINCT FROM OLD.sn_prefix
    OR NEW.sn_category_code IS DISTINCT FROM OLD.sn_category_code
  ) THEN
    RAISE EXCEPTION 'serial_base_immutable';
  END IF;
  RETURN NEW;
END $$;

-- 6) Units take their S/N from their item.
CREATE OR REPLACE FUNCTION public.stock_items_before_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.unit_number := public.allocate_item_id(NEW.equipment_id);
  NEW.qr_token := public.new_qr_token();
  NEW.serial_code := public.next_unit_serial_code(NEW.equipment_id);
  NEW.label_print_count := 0;
  NEW.label_last_printed_at := NULL;
  IF NEW.identifier IS NULL OR btrim(NEW.identifier) = '' THEN
    NEW.identifier := NEW.unit_number;
  END IF;
  IF NEW.barcode IS NULL OR btrim(NEW.barcode) = '' THEN
    NEW.barcode := NEW.serial_code;
  END IF;
  NEW.serial_number := NULLIF(btrim(COALESCE(NEW.serial_number, '')), '');
  RETURN NEW;
END $$;

-- 7) Predicted unit S/Ns (one entry per unit to create, in order) without consuming numbers.
CREATE OR REPLACE FUNCTION public.preview_serial_codes(_equipment_ids uuid[])
RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_out text[] := ARRAY[]::text[];
  v_next jsonb := '{}'::jsonb;
  v_id uuid;
  v_prefix text; v_org bigint; v_cc text;
  v_n bigint; v_code text;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tester')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF cardinality(COALESCE(_equipment_ids, ARRAY[]::uuid[])) > 5000 THEN RAISE EXCEPTION 'too_many_items'; END IF;
  FOREACH v_id IN ARRAY COALESCE(_equipment_ids, ARRAY[]::uuid[]) LOOP
    SELECT e.sn_prefix, e.sn_org_no, e.sn_category_code INTO v_prefix, v_org, v_cc
    FROM public.equipment e WHERE e.id = v_id;
    IF v_org IS NULL THEN v_out := v_out || NULL::text; CONTINUE; END IF;
    v_n := COALESCE((v_next->>v_id::text)::bigint,
      (SELECT c.last_value FROM public.serial_counters c WHERE c.scope = 'item:' || v_id::text), 0);
    v_code := NULL;
    LOOP
      v_n := v_n + 1;
      EXIT WHEN v_n > 999;
      v_code := public.format_unit_serial_code(v_prefix, v_cc, v_org, v_n);
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.serial_codes sc WHERE sc.code = v_code);
      v_code := NULL;
    END LOOP;
    v_next := v_next || jsonb_build_object(v_id::text, v_n);
    v_out := v_out || v_code;
  END LOOP;
  RETURN v_out;
END $$;
REVOKE ALL ON FUNCTION public.preview_serial_codes(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_serial_codes(uuid[]) TO authenticated, service_role;

-- 8) Bulk stock -> individual units: preview (no changes) and conversion (idempotent).
CREATE OR REPLACE FUNCTION public.stock_conversion_plan(_equipment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e public.equipment;
  v_total integer; v_counted integer; v_create integer := 0;
  v_status text; v_note text;
BEGIN
  SELECT * INTO e FROM public.equipment WHERE id = _equipment_id;
  IF e.id IS NULL THEN RETURN NULL; END IF;
  SELECT count(*)::int, count(*) FILTER (WHERE s.status IN ('in_stock', 'with_customer'))::int
    INTO v_total, v_counted FROM public.stock_items s WHERE s.equipment_id = e.id;

  IF e.item_kind IN ('service', 'bundle') THEN
    v_status := 'skip'; v_note := CASE e.item_kind WHEN 'bundle' THEN 'Package – no physical unit of its own' ELSE 'Service – no physical unit' END;
  ELSIF e.tracking = 'serialized' THEN
    v_status := 'done'; v_note := 'Already tracked as individual units';
  ELSIF v_counted > e.quantity THEN
    v_status := 'conflict';
    v_note := format('%s units are registered but the stock is %s – converting would change the stock. Fix the quantity or retire units first.', v_counted, e.quantity);
  ELSIF e.quantity = 0 AND v_counted = 0 THEN
    v_status := 'skip'; v_note := 'Stock is 0 – nothing to convert';
  ELSE
    v_create := e.quantity - v_counted;
    v_status := 'convert';
    v_note := CASE WHEN v_counted > 0
      THEN format('%s existing unit%s already count towards the stock of %s', v_counted, CASE WHEN v_counted = 1 THEN '' ELSE 's' END, e.quantity)
      ELSE NULL END;
  END IF;
  IF v_total > v_counted THEN
    v_note := concat_ws(' · ', v_note, format('%s unit%s in service/damaged/retired not counted', v_total - v_counted, CASE WHEN v_total - v_counted = 1 THEN '' ELSE 's' END));
  END IF;

  RETURN jsonb_build_object(
    'equipment_id', e.id, 'name', e.name, 'category', e.category, 'item_kind', e.item_kind,
    'tracking', e.tracking, 'quantity', e.quantity, 'product_code', e.serial_code,
    'units_total', v_total, 'units_counted', v_counted, 'to_create', v_create,
    'status', v_status, 'note', v_note
  );
END $$;
REVOKE ALL ON FUNCTION public.stock_conversion_plan(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stock_conversion_plan(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.stock_conversion_preview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_out jsonb := '[]'::jsonb;
  v_plan jsonb;
  r record;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tester')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  FOR r IN SELECT id FROM public.equipment ORDER BY sort_order, name LOOP
    v_plan := public.stock_conversion_plan(r.id);
    IF (v_plan->>'to_create')::int > 0 THEN
      v_plan := v_plan || jsonb_build_object('next_codes',
        to_jsonb(public.preview_serial_codes(array_fill(r.id, ARRAY[(v_plan->>'to_create')::int]))));
    ELSE
      v_plan := v_plan || jsonb_build_object('next_codes', '[]'::jsonb);
    END IF;
    v_out := v_out || jsonb_build_array(v_plan);
  END LOOP;
  RETURN v_out;
END $$;
REVOKE ALL ON FUNCTION public.stock_conversion_preview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stock_conversion_preview() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.convert_stock_to_units(_equipment_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_out jsonb := '[]'::jsonb;
  v_id uuid;
  v_plan jsonb;
  v_codes text[];
  v_batch text := 'stock-conversion-' || to_char(now() AT TIME ZONE 'Europe/Stockholm', 'YYYY-MM-DD');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  FOR v_id IN SELECT DISTINCT x FROM unnest(COALESCE(_equipment_ids, ARRAY[]::uuid[])) x LOOP
    -- Lock the item, then re-plan, so a repeated or concurrent run never creates duplicates.
    PERFORM 1 FROM public.equipment WHERE id = v_id FOR UPDATE;
    v_plan := public.stock_conversion_plan(v_id);
    CONTINUE WHEN v_plan IS NULL;
    v_codes := ARRAY[]::text[];
    IF v_plan->>'status' = 'convert' THEN
      IF (v_plan->>'to_create')::int > 0 THEN
        SELECT COALESCE(array_agg(c.serial_code), ARRAY[]::text[]) INTO v_codes
        FROM public.create_units(v_id, (v_plan->>'to_create')::int, NULL, v_batch, NULL, false) c;
      END IF;
      UPDATE public.equipment SET tracking = 'serialized' WHERE id = v_id AND tracking <> 'serialized';
    END IF;
    v_out := v_out || jsonb_build_array(v_plan || jsonb_build_object(
      'result', CASE WHEN v_plan->>'status' = 'convert' THEN 'converted' ELSE 'skipped' END,
      'created_codes', to_jsonb(v_codes)));
  END LOOP;
  RETURN v_out;
END $$;
REVOKE ALL ON FUNCTION public.convert_stock_to_units(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_stock_to_units(uuid[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.next_serial_code(uuid, text) IS 'DEPRECATED: replaced by next_org_serial_number (items) and next_unit_serial_code (units).';
COMMENT ON FUNCTION public.format_serial_code(text, text, bigint, bigint) IS 'DEPRECATED: replaced by format_unit_serial_code.';
