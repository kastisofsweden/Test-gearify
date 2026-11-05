-- Unit S/N = <ORG prefix><unit number in the organization>-<CC><unit number within the item>[-KK].
-- Both numbers are issued per physical unit, server-side, in the inserting transaction.
-- Counters are keyed by the main organization's id (not its prefix), so a prefix change never resets them.

-- 1) Per-unit S/N parts.
ALTER TABLE public.stock_items ADD COLUMN sn_series_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.stock_items ADD COLUMN sn_org_no bigint;
ALTER TABLE public.stock_items ADD COLUMN sn_item_no integer;
COMMENT ON COLUMN public.stock_items.sn_series_id IS 'Main organization whose number series issued this unit''s S/N.';
COMMENT ON COLUMN public.stock_items.sn_org_no IS 'Unit number within the organization (first part of the S/N); unique per series.';
COMMENT ON COLUMN public.stock_items.sn_item_no IS 'Unit number within the item (last part of the S/N); unique per item.';

ALTER TABLE public.equipment ADD COLUMN comment text;
ALTER TABLE public.equipment ADD CONSTRAINT equipment_comment_length CHECK (comment IS NULL OR char_length(comment) <= 2000);
COMMENT ON COLUMN public.equipment.comment IS 'Internal comment on the item (back office only, never printed on labels).';
COMMENT ON COLUMN public.equipment.sn_org_no IS 'Item number from the organization''s product counter; used only in the product-level code (unit S/Ns use stock_items.sn_org_no).';

-- 2) Registry keeps old unit S/Ns as scan aliases.
ALTER TABLE public.serial_codes ADD COLUMN kind text NOT NULL DEFAULT 'current';
ALTER TABLE public.serial_codes ADD COLUMN replaced_at timestamptz;
ALTER TABLE public.serial_codes ADD CONSTRAINT serial_codes_kind_check CHECK (kind IN ('current', 'alias', 'review'));
COMMENT ON COLUMN public.serial_codes.kind IS 'current = the unit''s S/N; alias = former S/N that still scans to the same unit; review = former S/N that is ambiguous and does not resolve.';
DROP INDEX IF EXISTS public.serial_codes_stock_item_id_key;
CREATE UNIQUE INDEX serial_codes_stock_item_current_key ON public.serial_codes (stock_item_id)
  WHERE stock_item_id IS NOT NULL AND kind = 'current';
CREATE INDEX serial_codes_stock_item_idx ON public.serial_codes (stock_item_id) WHERE stock_item_id IS NOT NULL;

ALTER TABLE public.unit_movements DROP CONSTRAINT unit_movements_action_check;
ALTER TABLE public.unit_movements ADD CONSTRAINT unit_movements_action_check
  CHECK (action IN ('check_out', 'check_in', 'status_change', 'created', 'sn_changed'));

-- 3) Series helpers.
CREATE OR REPLACE FUNCTION public.serial_series_root(_org_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_root uuid := _org_id; v_parent uuid; v_depth integer := 0;
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
  RETURN v_root;
END $$;
REVOKE ALL ON FUNCTION public.serial_series_root(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.serial_series_root(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.serial_series_prefix(_root uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT COALESCE(NULLIF(public.letters_only(o.item_prefix), ''), public.derive_org_prefix(o.name))
     FROM public.organizations o WHERE o.id = _root),
    'X')
$$;
REVOKE ALL ON FUNCTION public.serial_series_prefix(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.serial_series_prefix(uuid) TO service_role;

-- 4) Backfill the parts of existing unit S/Ns (DCB007-AS002 -> org no 7, item no 2).
UPDATE public.stock_items s
SET sn_series_id = public.serial_series_root(e.organization_id),
    sn_org_no = COALESCE(NULLIF(p.m[5], '')::bigint, 0) * 999 + p.m[2]::bigint,
    sn_item_no = p.m[4]::integer
FROM public.equipment e,
  (SELECT x.id, regexp_match(x.serial_code, '^([A-Z]{1,6})([0-9]{3})-([A-Z]{2})([0-9]{3})(?:-([0-9]{2,}))?$') AS m
   FROM public.stock_items x) p
WHERE p.id = s.id AND e.id = s.equipment_id AND p.m IS NOT NULL AND s.sn_org_no IS NULL;

-- 5) Counters keyed by main organization id.
--    products:<org id> = product-code numbers (continues the old org:<PREFIX> counter).
--    units:<org id>    = unit numbers within the organization (continues after the highest existing one).
INSERT INTO public.serial_counters AS c (scope, last_value)
SELECT 'products:' || r.root, r.n FROM (
  SELECT o.id AS root, GREATEST(
    COALESCE((SELECT sc.last_value FROM public.serial_counters sc WHERE sc.scope = 'org:' || o.item_prefix), 0),
    COALESCE((SELECT max(e.sn_org_no) FROM public.equipment e WHERE public.serial_series_root(e.organization_id) = o.id), 0)
  ) AS n
  FROM public.organizations o WHERE o.parent_id IS NULL
) r WHERE r.n > 0
ON CONFLICT (scope) DO UPDATE SET last_value = GREATEST(c.last_value, EXCLUDED.last_value), updated_at = now();

INSERT INTO public.serial_counters AS c (scope, last_value)
SELECT 'units:' || s.sn_series_id, max(s.sn_org_no) FROM public.stock_items s
WHERE s.sn_series_id IS NOT NULL AND s.sn_org_no IS NOT NULL GROUP BY s.sn_series_id
ON CONFLICT (scope) DO UPDATE SET last_value = GREATEST(c.last_value, EXCLUDED.last_value), updated_at = now();

COMMENT ON TABLE public.serial_counters IS 'S/N counters: products:<main org id>, units:<main org id>, item:<equipment id>. org:<PREFIX> and cat:* rows are DEPRECATED (frozen history).';

-- 6) Allocate one unit S/N: item number from the item's counter, organization number from the series
--    counter; both via row-locked upserts so concurrent and bulk inserts never collide; numbers already
--    used by a unit and codes already registered (incl. old aliases) are skipped, never reused.
CREATE OR REPLACE FUNCTION public.allocate_unit_serial(_equipment_id uuid,
  OUT series_id uuid, OUT org_no bigint, OUT item_no integer, OUT serial text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid; v_cc text; v_cat text; v_prefix text; v_n bigint; v_code text;
BEGIN
  SELECT e.organization_id, e.sn_category_code, e.category INTO v_org, v_cc, v_cat
  FROM public.equipment e WHERE e.id = _equipment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown_item'; END IF;
  v_cc := COALESCE(v_cc, public.serial_category_code(v_cat));
  series_id := public.serial_series_root(v_org);
  v_prefix := public.serial_series_prefix(series_id);

  LOOP
    INSERT INTO public.serial_counters AS c (scope, last_value) VALUES ('item:' || _equipment_id::text, 1)
    ON CONFLICT (scope) DO UPDATE SET last_value = c.last_value + 1, updated_at = now()
    RETURNING c.last_value INTO v_n;
    IF v_n > 999 THEN RAISE EXCEPTION 'item_unit_limit: an item can have at most 999 units'; END IF;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.stock_items s WHERE s.equipment_id = _equipment_id AND s.sn_item_no = v_n);
  END LOOP;
  item_no := v_n;

  LOOP
    INSERT INTO public.serial_counters AS c (scope, last_value) VALUES ('units:' || COALESCE(series_id::text, 'none'), 1)
    ON CONFLICT (scope) DO UPDATE SET last_value = c.last_value + 1, updated_at = now()
    RETURNING c.last_value INTO v_n;
    v_code := public.format_unit_serial_code(v_prefix, v_cc, v_n, item_no);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.stock_items s WHERE s.sn_series_id IS NOT DISTINCT FROM series_id AND s.sn_org_no = v_n)
      AND NOT EXISTS (SELECT 1 FROM public.serial_codes sc WHERE sc.code = v_code);
  END LOOP;
  org_no := v_n;
  serial := v_code;

  IF series_id IS NOT NULL THEN
    UPDATE public.organizations SET item_prefix_locked = true WHERE id = series_id AND NOT item_prefix_locked;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.allocate_unit_serial(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_unit_serial(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.stock_items_before_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a record;
BEGIN
  NEW.unit_number := public.allocate_item_id(NEW.equipment_id);
  NEW.qr_token := public.new_qr_token();
  SELECT * INTO a FROM public.allocate_unit_serial(NEW.equipment_id);
  NEW.serial_code := a.serial;
  NEW.sn_series_id := a.series_id;
  NEW.sn_org_no := a.org_no;
  NEW.sn_item_no := a.item_no;
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

CREATE OR REPLACE FUNCTION public.stock_items_serial_code_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  -- Only the S/N repair (unit_serial_repair) may re-issue a unit's S/N.
  IF current_setting('renthub.serial_repair', true) = 'on' THEN RETURN NEW; END IF;
  IF NEW.serial_code IS DISTINCT FROM OLD.serial_code THEN RAISE EXCEPTION 'serial_code_immutable'; END IF;
  IF OLD.sn_org_no IS NOT NULL AND (
    NEW.sn_org_no IS DISTINCT FROM OLD.sn_org_no
    OR NEW.sn_item_no IS DISTINCT FROM OLD.sn_item_no
    OR NEW.sn_series_id IS DISTINCT FROM OLD.sn_series_id
  ) THEN
    RAISE EXCEPTION 'serial_parts_immutable';
  END IF;
  RETURN NEW;
END $$;

-- 7) Product-level codes: counter per main organization id; prefix read at issue time.
CREATE OR REPLACE FUNCTION public.next_org_serial_number(_org_id uuid, OUT prefix text, OUT n bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_root uuid;
BEGIN
  v_root := public.serial_series_root(_org_id);
  prefix := public.serial_series_prefix(v_root);
  INSERT INTO public.serial_counters AS c (scope, last_value) VALUES ('products:' || COALESCE(v_root::text, 'none'), 1)
  ON CONFLICT (scope) DO UPDATE SET last_value = c.last_value + 1, updated_at = now()
  RETURNING c.last_value INTO n;
  IF v_root IS NOT NULL THEN
    UPDATE public.organizations SET item_prefix_locked = true WHERE id = v_root AND NOT item_prefix_locked;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.next_org_serial_number(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_org_serial_number(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.equipment_assign_serial_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prefix text; v_n bigint; v_code text;
BEGIN
  NEW.sn_category_code := public.serial_category_code(NEW.category);
  LOOP
    SELECT s.prefix, s.n INTO v_prefix, v_n FROM public.next_org_serial_number(NEW.organization_id) s;
    v_code := public.format_unit_serial_code(v_prefix, NEW.sn_category_code, v_n, 0);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.serial_codes sc WHERE sc.code = v_code);
  END LOOP;
  NEW.sn_prefix := v_prefix;
  NEW.sn_org_no := v_n;
  NEW.serial_code := v_code;
  NEW.legacy_barcode := NULL;
  IF NEW.barcode IS NULL OR btrim(NEW.barcode) = '' THEN
    NEW.barcode := NEW.serial_code;
  END IF;
  RETURN NEW;
END $$;

-- 8) Prefix is editable on main organizations (applies to future S/Ns; issued codes keep working).
--    Moving an organization under another main organization stays blocked once codes are issued,
--    because its units would otherwise switch number series.
CREATE OR REPLACE FUNCTION public.organizations_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.item_prefix := NULLIF(upper(btrim(COALESCE(NEW.item_prefix, ''))), '');
  IF NEW.parent_id IS NULL AND NEW.item_prefix IS NULL THEN
    NEW.item_prefix := public.derive_org_prefix(NEW.name);
  END IF;
  IF NEW.parent_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.organizations p WHERE p.id = NEW.parent_id AND p.parent_id IS NOT NULL) THEN
      RAISE EXCEPTION 'parent_must_be_main_organization';
    END IF;
    IF TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM public.organizations c WHERE c.parent_id = NEW.id) THEN
      RAISE EXCEPTION 'organization_has_sub_organizations';
    END IF;
    NEW.item_prefix := NULL;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.item_prefix_locked AND NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN
      RAISE EXCEPTION 'series_parent_locked';
    END IF;
    IF OLD.item_prefix_locked AND NEW.next_item_number < OLD.next_item_number THEN
      RAISE EXCEPTION 'item_number_cannot_decrease';
    END IF;
    IF OLD.item_prefix_locked AND NOT NEW.item_prefix_locked THEN
      NEW.item_prefix_locked := true;
    END IF;
  END IF;
  RETURN NEW;
END $$;
COMMENT ON COLUMN public.organizations.item_prefix_locked IS 'True once the organization''s series has issued a code; the prefix stays editable, the parent does not.';

-- 9) Predicted unit S/Ns (one per unit to create, in order) without consuming numbers.
CREATE OR REPLACE FUNCTION public.preview_serial_codes(_equipment_ids uuid[])
RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_out text[] := ARRAY[]::text[];
  v_item jsonb := '{}'::jsonb;
  v_series jsonb := '{}'::jsonb;
  v_id uuid; v_org uuid; v_cc text; v_root uuid; v_key text; v_prefix text;
  v_i bigint; v_o bigint; v_code text;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tester')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF cardinality(COALESCE(_equipment_ids, ARRAY[]::uuid[])) > 5000 THEN RAISE EXCEPTION 'too_many_items'; END IF;
  FOREACH v_id IN ARRAY COALESCE(_equipment_ids, ARRAY[]::uuid[]) LOOP
    SELECT e.organization_id, COALESCE(e.sn_category_code, public.serial_category_code(e.category)) INTO v_org, v_cc
    FROM public.equipment e WHERE e.id = v_id;
    IF NOT FOUND THEN v_out := v_out || NULL::text; CONTINUE; END IF;
    v_root := public.serial_series_root(v_org);
    v_key := COALESCE(v_root::text, 'none');
    v_prefix := public.serial_series_prefix(v_root);

    v_i := COALESCE((v_item->>v_id::text)::bigint,
      (SELECT c.last_value FROM public.serial_counters c WHERE c.scope = 'item:' || v_id::text), 0);
    LOOP
      v_i := v_i + 1;
      EXIT WHEN v_i > 999 OR NOT EXISTS (SELECT 1 FROM public.stock_items s WHERE s.equipment_id = v_id AND s.sn_item_no = v_i);
    END LOOP;
    v_item := v_item || jsonb_build_object(v_id::text, v_i);
    IF v_i > 999 THEN v_out := v_out || NULL::text; CONTINUE; END IF;

    v_o := COALESCE((v_series->>v_key)::bigint,
      (SELECT c.last_value FROM public.serial_counters c WHERE c.scope = 'units:' || v_key), 0);
    LOOP
      v_o := v_o + 1;
      v_code := public.format_unit_serial_code(v_prefix, v_cc, v_o, v_i);
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.stock_items s WHERE s.sn_series_id IS NOT DISTINCT FROM v_root AND s.sn_org_no = v_o)
        AND NOT EXISTS (SELECT 1 FROM public.serial_codes sc WHERE sc.code = v_code);
    END LOOP;
    v_series := v_series || jsonb_build_object(v_key, v_o);
    v_out := v_out || v_code;
  END LOOP;
  RETURN v_out;
END $$;
REVOKE ALL ON FUNCTION public.preview_serial_codes(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_serial_codes(uuid[]) TO authenticated, service_role;

-- 10) Repair units that share an organization number: preview (_apply = false) or apply in place.
--     The first unit (by created_at, id) of each shared number keeps it; the others get new free numbers
--     and keep their item number when valid. Internal id, QR, status, bookings and history are untouched;
--     the old S/N stays registered as an alias (or 'review' if ambiguous). Re-running is a no-op.
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
    ORDER BY s.created_at, s.id
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
    ORDER BY s.created_at, s.id
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

-- 11) Scanning: former S/Ns (aliases) still resolve to the same unit; ambiguous ones do not.
CREATE OR REPLACE FUNCTION public.scan_lookup(_code text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  code text := regexp_replace(btrim(COALESCE(_code, '')), '^S/N:?\s*', '', 'i');
  ucode text;
  url_token text := substring(btrim(COALESCE(_code, '')) FROM '/i/([A-Za-z0-9_-]+)');
  reg public.serial_codes;
  result jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tester')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  ucode := upper(code);

  IF url_token IS NULL AND ucode <> '' THEN
    SELECT * INTO reg FROM public.serial_codes WHERE serial_codes.code = ucode AND serial_codes.kind <> 'review';
    IF reg.stock_item_id IS NOT NULL THEN
      SELECT jsonb_build_object('kind', 'unit', 'stock_item_id', s.id, 'identifier', s.identifier,
        'unit_number', s.unit_number, 'serial_code', s.serial_code, 'qr_token', s.qr_token, 'status', s.status,
        'equipment_id', e.id, 'equipment_name', e.name,
        'matched_alias', CASE WHEN reg.kind = 'alias' THEN reg.code ELSE NULL END) INTO result
      FROM public.stock_items s JOIN public.equipment e ON e.id = s.equipment_id
      WHERE s.id = reg.stock_item_id;
      IF result IS NOT NULL THEN RETURN result; END IF;
    ELSIF reg.equipment_id IS NOT NULL THEN
      SELECT jsonb_build_object('kind', 'product', 'equipment_id', e.id, 'equipment_name', e.name, 'sku', e.sku,
        'serial_code', e.serial_code, 'legacy_barcode', e.legacy_barcode) INTO result
      FROM public.equipment e WHERE e.id = reg.equipment_id;
      IF result IS NOT NULL THEN RETURN result; END IF;
    END IF;
  END IF;

  IF url_token IS NULL THEN
    SELECT jsonb_build_object('kind', 'order', 'order_id', o.id, 'order_number', o.order_number,
      'status', o.status, 'starts_on', o.starts_on, 'ends_on', o.ends_on, 'customer', c.name) INTO result
    FROM public.orders o LEFT JOIN public.customers c ON c.id = o.customer_id
    WHERE upper(o.order_number) = ucode OR o.share_token = code
    LIMIT 1;
    IF result IS NOT NULL THEN RETURN result; END IF;
  END IF;

  SELECT jsonb_build_object('kind', 'unit', 'stock_item_id', s.id, 'identifier', s.identifier,
    'unit_number', s.unit_number, 'serial_code', s.serial_code, 'qr_token', s.qr_token, 'status', s.status,
    'equipment_id', e.id, 'equipment_name', e.name) INTO result
  FROM public.stock_items s JOIN public.equipment e ON e.id = s.equipment_id
  WHERE CASE
    WHEN url_token IS NOT NULL THEN s.qr_token = url_token
    ELSE s.qr_token = code OR upper(s.unit_number) = ucode OR s.barcode = code OR upper(s.identifier) = ucode
  END
  ORDER BY (s.qr_token = COALESCE(url_token, code)) DESC, (upper(s.unit_number) = ucode) DESC
  LIMIT 1;
  IF result IS NOT NULL THEN RETURN result; END IF;

  IF url_token IS NULL THEN
    SELECT jsonb_build_object('kind', 'product', 'equipment_id', e.id, 'equipment_name', e.name, 'sku', e.sku,
      'serial_code', e.serial_code, 'legacy_barcode', e.legacy_barcode) INTO result
    FROM public.equipment e
    WHERE upper(e.legacy_barcode) = ucode OR e.barcode = code OR upper(COALESCE(e.sku, '')) = ucode
    ORDER BY (upper(e.legacy_barcode) = ucode) DESC NULLS LAST
    LIMIT 1;
    IF result IS NOT NULL THEN RETURN result; END IF;
  END IF;

  RETURN jsonb_build_object('kind', 'unknown', 'code', code,
    'review', EXISTS (SELECT 1 FROM public.serial_codes sc WHERE sc.code = ucode AND sc.kind = 'review'));
END $$;

COMMENT ON FUNCTION public.next_unit_serial_code(uuid) IS 'DEPRECATED: replaced by allocate_unit_serial (organization number per unit).';

-- 12) Item images (public bucket item-images): back office uploads.
CREATE POLICY "Back office uploads item images" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'item-images' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tester')));
CREATE POLICY "Back office reads item images" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'item-images' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tester')));
CREATE POLICY "Admins update item images" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'item-images' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete item images" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'item-images' AND public.has_role(auth.uid(), 'admin'));
