-- =====================================================================
-- Unit register: extend stock_items with item numbers + QR tokens,
-- append-only movement log, customer/staff reports, and RPCs.
-- =====================================================================

-- 1. stock_items: new columns ------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.stock_unit_number_seq AS bigint START 1 NO CYCLE;
REVOKE ALL ON SEQUENCE public.stock_unit_number_seq FROM PUBLIC, anon, authenticated;
GRANT ALL ON SEQUENCE public.stock_unit_number_seq TO service_role;

ALTER TABLE public.stock_items
  ADD COLUMN IF NOT EXISTS unit_number text,
  ADD COLUMN IF NOT EXISTS qr_token text,
  ADD COLUMN IF NOT EXISTS serial_number text,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS import_batch text,
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS label_print_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS label_last_printed_at timestamptz;

CREATE OR REPLACE FUNCTION public.next_stock_unit_number()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n bigint := nextval('public.stock_unit_number_seq');
BEGIN
  RETURN 'RM-' || CASE WHEN n < 1000000 THEN lpad(n::text, 6, '0') ELSE n::text END;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.next_stock_unit_number() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_stock_unit_number() TO service_role;

CREATE OR REPLACE FUNCTION public.new_qr_token()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT encode(extensions.gen_random_bytes(16), 'hex');
$$;
REVOKE EXECUTE ON FUNCTION public.new_qr_token() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.new_qr_token() TO service_role;

-- Backfill existing rows (in creation order) before constraints apply
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.stock_items WHERE unit_number IS NULL OR qr_token IS NULL ORDER BY created_at, id LOOP
    UPDATE public.stock_items
       SET unit_number = COALESCE(unit_number, public.next_stock_unit_number()),
           qr_token = COALESCE(qr_token, public.new_qr_token())
     WHERE id = r.id;
  END LOOP;
END;
$$;

ALTER TABLE public.stock_items ALTER COLUMN unit_number SET NOT NULL;
ALTER TABLE public.stock_items ALTER COLUMN qr_token SET NOT NULL;
ALTER TABLE public.stock_items ADD CONSTRAINT stock_items_unit_number_key UNIQUE (unit_number);
ALTER TABLE public.stock_items ADD CONSTRAINT stock_items_qr_token_key UNIQUE (qr_token);
ALTER TABLE public.stock_items ADD CONSTRAINT stock_items_status_check
  CHECK (status IN ('in_stock', 'with_customer', 'service', 'damaged', 'retired'));
ALTER TABLE public.stock_items ADD CONSTRAINT stock_items_label_print_count_check
  CHECK (label_print_count >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS stock_items_equipment_serial_key
  ON public.stock_items (equipment_id, lower(serial_number)) WHERE serial_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS stock_items_import_batch_idx
  ON public.stock_items (import_batch) WHERE import_batch IS NOT NULL;

COMMENT ON COLUMN public.stock_items.status IS
  'in_stock=Available, with_customer=Checked out, service=In service, damaged=Damaged, retired=Retired';
COMMENT ON COLUMN public.stock_items.unit_number IS 'Immutable item number RM-000001, from stock_unit_number_seq';
COMMENT ON COLUMN public.stock_items.qr_token IS 'Immutable unguessable token used in public QR URLs (/i/<token>)';

-- Triggers: one BEFORE INSERT and one BEFORE UPDATE function replace the
-- old random autobarcode trigger so nothing overwrites the item number.
DROP TRIGGER IF EXISTS stock_items_autobarcode ON public.stock_items;

CREATE OR REPLACE FUNCTION public.stock_items_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Always server-generated; client-supplied values are ignored.
  NEW.unit_number := public.next_stock_unit_number();
  NEW.qr_token := public.new_qr_token();
  NEW.label_print_count := 0;
  NEW.label_last_printed_at := NULL;
  IF NEW.identifier IS NULL OR btrim(NEW.identifier) = '' THEN
    NEW.identifier := NEW.unit_number;
  END IF;
  IF NEW.barcode IS NULL OR btrim(NEW.barcode) = '' THEN
    NEW.barcode := NEW.unit_number;
  END IF;
  NEW.serial_number := NULLIF(btrim(COALESCE(NEW.serial_number, '')), '');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.stock_items_before_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.unit_number IS DISTINCT FROM OLD.unit_number THEN
    RAISE EXCEPTION 'unit_number_immutable';
  END IF;
  IF NEW.qr_token IS DISTINCT FROM OLD.qr_token THEN
    RAISE EXCEPTION 'qr_token_immutable';
  END IF;
  IF NEW.barcode IS NULL OR btrim(NEW.barcode) = '' THEN
    NEW.barcode := NEW.unit_number;
  END IF;
  RETURN NEW;
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
    RAISE EXCEPTION 'unit_has_movements: retire unit % instead of deleting it', OLD.unit_number;
  END IF;
  RETURN OLD;
END;
$$;

-- 2. unit_movements (append-only) --------------------------------------
CREATE TABLE public.unit_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('check_out', 'check_in', 'status_change', 'created')),
  from_status text,
  to_status text,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  reference text CHECK (reference IS NULL OR char_length(reference) <= 200),
  note text CHECK (note IS NULL OR char_length(note) <= 2000),
  forced boolean NOT NULL DEFAULT false,
  performed_by uuid DEFAULT auth.uid(),
  performed_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.unit_movements TO authenticated;
GRANT ALL ON public.unit_movements TO service_role;
REVOKE ALL ON public.unit_movements FROM anon;

ALTER TABLE public.unit_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read unit movements" ON public.unit_movements
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins log unit movements" ON public.unit_movements
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND performed_by = auth.uid());

CREATE INDEX unit_movements_item_time_idx ON public.unit_movements (stock_item_id, performed_at DESC);
CREATE INDEX unit_movements_order_idx ON public.unit_movements (order_id) WHERE order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.unit_movements_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- The only permitted change: the order FK being cleared when an order is deleted.
  IF TG_OP = 'UPDATE'
     AND OLD.order_id IS NOT NULL AND NEW.order_id IS NULL
     AND (to_jsonb(NEW) - 'order_id') = (to_jsonb(OLD) - 'order_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'unit_movements is append-only';
END;
$$;

CREATE TRIGGER unit_movements_append_only
BEFORE UPDATE OR DELETE ON public.unit_movements
FOR EACH ROW EXECUTE FUNCTION public.unit_movements_append_only();

-- Now that unit_movements exists, attach the stock_items triggers
DROP TRIGGER IF EXISTS stock_items_before_insert ON public.stock_items;
CREATE TRIGGER stock_items_before_insert
BEFORE INSERT ON public.stock_items
FOR EACH ROW EXECUTE FUNCTION public.stock_items_before_insert();

DROP TRIGGER IF EXISTS stock_items_before_update ON public.stock_items;
CREATE TRIGGER stock_items_before_update
BEFORE UPDATE ON public.stock_items
FOR EACH ROW EXECUTE FUNCTION public.stock_items_before_update();

DROP TRIGGER IF EXISTS stock_items_before_delete ON public.stock_items;
CREATE TRIGGER stock_items_before_delete
BEFORE DELETE ON public.stock_items
FOR EACH ROW EXECUTE FUNCTION public.stock_items_before_delete();

-- Log any status change made outside unit_move (status dropdown, scanner,
-- order pickup/return trigger) as a 'status_change' movement.
CREATE OR REPLACE FUNCTION public.stock_items_log_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND COALESCE(current_setting('app.unit_move', true), '') <> 'on' THEN
    INSERT INTO public.unit_movements (stock_item_id, action, from_status, to_status, performed_by)
    VALUES (NEW.id, 'status_change', OLD.status, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stock_items_log_status_change ON public.stock_items;
CREATE TRIGGER stock_items_log_status_change
AFTER UPDATE OF status ON public.stock_items
FOR EACH ROW EXECUTE FUNCTION public.stock_items_log_status_change();

-- Make sure anon can never read the register directly
REVOKE ALL ON public.stock_items FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_items TO authenticated;
GRANT ALL ON public.stock_items TO service_role;

-- 3. unit_reports --------------------------------------------------------
CREATE TABLE public.unit_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_item_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  report_type text NOT NULL CHECK (report_type IN ('note', 'fault')),
  reporter_role text NOT NULL CHECK (reporter_role IN ('customer', 'staff')),
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 2000),
  reporter_name text CHECK (reporter_name IS NULL OR char_length(reporter_name) <= 120),
  reporter_phone text CHECK (reporter_phone IS NULL OR char_length(reporter_phone) <= 40),
  reporter_email text CHECK (reporter_email IS NULL OR char_length(reporter_email) <= 200),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'handled')),
  handled_by uuid,
  handled_at timestamptz,
  admin_note text CHECK (admin_note IS NULL OR char_length(admin_note) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.unit_reports TO authenticated;
GRANT ALL ON public.unit_reports TO service_role;
REVOKE ALL ON public.unit_reports FROM anon;

ALTER TABLE public.unit_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage unit reports" ON public.unit_reports
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX unit_reports_item_time_idx ON public.unit_reports (stock_item_id, created_at DESC);
CREATE INDEX unit_reports_status_idx ON public.unit_reports (status);

CREATE OR REPLACE FUNCTION public.unit_reports_set_handled()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'handled' AND OLD.status <> 'handled' THEN
    NEW.handled_at := COALESCE(NEW.handled_at, now());
    NEW.handled_by := COALESCE(NEW.handled_by, auth.uid());
  ELSIF NEW.status = 'new' AND OLD.status <> 'new' THEN
    NEW.handled_at := NULL;
    NEW.handled_by := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER unit_reports_set_handled
BEFORE UPDATE ON public.unit_reports
FOR EACH ROW EXECUTE FUNCTION public.unit_reports_set_handled();

-- 4a. get_public_unit ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_unit(_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'unit_number', s.unit_number,
    'name', e.name,
    'image_url', e.image_url,
    'description', CASE
      WHEN e.description IS NULL THEN NULL
      WHEN char_length(e.description) > 300 THEN left(e.description, 297) || '…'
      ELSE e.description
    END,
    'page_type', e.page_type,
    'page_slug', e.page_slug,
    'is_retired', s.status = 'retired'
  )
  FROM public.stock_items s
  JOIN public.equipment e ON e.id = s.equipment_id
  WHERE _token IS NOT NULL
    AND char_length(_token) BETWEEN 16 AND 64
    AND s.qr_token = btrim(_token)
  LIMIT 1;
$$;

-- 4b. submit_unit_report -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_unit_report(
  _token text,
  _type text,
  _role text,
  _message text,
  _name text DEFAULT NULL,
  _phone text DEFAULT NULL,
  _email text DEFAULT NULL,
  _honeypot text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit public.stock_items;
  v_message text := btrim(COALESCE(_message, ''));
  v_name text := NULLIF(btrim(COALESCE(_name, '')), '');
  v_phone text := NULLIF(btrim(COALESCE(_phone, '')), '');
  v_email text := NULLIF(btrim(COALESCE(_email, '')), '');
  v_type text := lower(btrim(COALESCE(_type, '')));
  v_role text := lower(btrim(COALESCE(_role, '')));
BEGIN
  -- Bots that fill the hidden field get a fake success.
  IF btrim(COALESCE(_honeypot, '')) <> '' THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  IF _token IS NULL OR char_length(_token) NOT BETWEEN 16 AND 64 THEN
    RAISE EXCEPTION 'invalid_token';
  END IF;

  SELECT * INTO v_unit FROM public.stock_items WHERE qr_token = btrim(_token) FOR UPDATE;
  IF v_unit.id IS NULL THEN RAISE EXCEPTION 'invalid_token'; END IF;
  IF v_unit.status = 'retired' THEN RAISE EXCEPTION 'unit_retired'; END IF;

  IF v_type NOT IN ('note', 'fault') THEN RAISE EXCEPTION 'invalid_type'; END IF;
  IF v_role NOT IN ('customer', 'staff') THEN RAISE EXCEPTION 'invalid_role'; END IF;
  IF char_length(v_message) < 3 OR char_length(v_message) > 2000 THEN RAISE EXCEPTION 'invalid_message'; END IF;
  IF v_name IS NOT NULL AND char_length(v_name) > 120 THEN RAISE EXCEPTION 'invalid_name'; END IF;
  IF v_phone IS NOT NULL AND char_length(v_phone) > 40 THEN RAISE EXCEPTION 'invalid_phone'; END IF;
  IF v_email IS NOT NULL AND (char_length(v_email) > 200 OR POSITION('@' IN v_email) < 2) THEN
    RAISE EXCEPTION 'invalid_email';
  END IF;

  IF (SELECT count(*) FROM public.unit_reports r
      WHERE r.stock_item_id = v_unit.id AND r.created_at > now() - interval '10 minutes') >= 5
     OR (SELECT count(*) FROM public.unit_reports r
      WHERE r.stock_item_id = v_unit.id AND r.created_at > now() - interval '1 day') >= 30 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  INSERT INTO public.unit_reports (
    stock_item_id, report_type, reporter_role, message, reporter_name, reporter_phone, reporter_email
  ) VALUES (v_unit.id, v_type, v_role, v_message, v_name, v_phone, v_email);

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 4c. create_units -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_units(
  _equipment_id uuid,
  _count integer,
  _serials text[] DEFAULT NULL,
  _batch text DEFAULT NULL,
  _location text DEFAULT NULL,
  _is_test boolean DEFAULT false
)
RETURNS TABLE (id uuid, unit_number text, qr_token text, serial_number text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_equipment public.equipment;
  v_serials text[];
  v_dupes text;
  v_n integer;
  v_ids uuid[];
  v_batch text := NULLIF(left(btrim(COALESCE(_batch, '')), 120), '');
  v_location text := NULLIF(left(btrim(COALESCE(_location, '')), 200), '');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT * INTO v_equipment FROM public.equipment e WHERE e.id = _equipment_id FOR UPDATE;
  IF v_equipment.id IS NULL THEN RAISE EXCEPTION 'unknown_item'; END IF;
  IF v_equipment.item_kind IN ('service', 'bundle') THEN
    RAISE EXCEPTION 'item_kind_not_trackable:%', v_equipment.item_kind;
  END IF;

  IF _serials IS NOT NULL THEN
    SELECT COALESCE(array_agg(t.s ORDER BY t.ord), ARRAY[]::text[]) INTO v_serials
    FROM (
      SELECT btrim(x) AS s, ord FROM unnest(_serials) WITH ORDINALITY AS u(x, ord)
      WHERE x IS NOT NULL AND btrim(x) <> ''
    ) t;

    IF cardinality(v_serials) = 0 THEN RAISE EXCEPTION 'no_serials'; END IF;

    SELECT string_agg(d.s, ', ') INTO v_dupes FROM (
      SELECT min(s) AS s FROM unnest(v_serials) s GROUP BY lower(s) HAVING count(*) > 1
    ) d;
    IF v_dupes IS NOT NULL THEN
      RAISE EXCEPTION 'duplicate_serials_in_input: %', v_dupes;
    END IF;

    SELECT string_agg(s.serial_number, ', ' ORDER BY s.serial_number) INTO v_dupes
    FROM public.stock_items s
    WHERE s.equipment_id = _equipment_id
      AND lower(s.serial_number) IN (SELECT lower(x) FROM unnest(v_serials) x);
    IF v_dupes IS NOT NULL THEN
      RAISE EXCEPTION 'duplicate_serials: %', v_dupes;
    END IF;

    v_n := cardinality(v_serials);
  ELSE
    v_n := COALESCE(_count, 0);
  END IF;

  IF v_n < 1 OR v_n > 1000 THEN RAISE EXCEPTION 'invalid_count: 1..1000 units per call'; END IF;

  IF v_equipment.tracking <> 'serialized' THEN
    UPDATE public.equipment e SET tracking = 'serialized' WHERE e.id = _equipment_id;
  END IF;

  WITH ins AS (
    INSERT INTO public.stock_items (equipment_id, identifier, serial_number, import_batch, location, is_test)
    SELECT _equipment_id, NULL, CASE WHEN v_serials IS NULL THEN NULL ELSE v_serials[g] END,
           v_batch, v_location, COALESCE(_is_test, false)
    FROM generate_series(1, v_n) g
    ORDER BY g
    RETURNING stock_items.id
  )
  SELECT array_agg(ins.id) INTO v_ids FROM ins;

  INSERT INTO public.unit_movements (stock_item_id, action, from_status, to_status, reference, performed_by)
  SELECT s.id, 'created', NULL, s.status, v_batch, auth.uid()
  FROM public.stock_items s WHERE s.id = ANY (v_ids);

  RETURN QUERY
  SELECT s.id, s.unit_number, s.qr_token, s.serial_number
  FROM public.stock_items s
  WHERE s.id = ANY (v_ids)
  ORDER BY s.unit_number;
END;
$$;

-- 4d. unit_move -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unit_move(
  _unit_ids uuid[],
  _action text,
  _order_id uuid DEFAULT NULL,
  _reference text DEFAULT NULL,
  _force boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
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

  v_target := CASE _action WHEN 'check_out' THEN 'with_customer' ELSE 'in_stock' END;

  -- Lock all units in a stable order, then validate every one
  PERFORM 1 FROM public.stock_items s WHERE s.id = ANY (v_ids) ORDER BY s.id FOR UPDATE;

  FOR v_missing IN
    SELECT x FROM unnest(v_ids) x WHERE NOT EXISTS (SELECT 1 FROM public.stock_items s WHERE s.id = x)
  LOOP
    v_blocking := true;
    v_problems := v_problems || jsonb_build_object(
      'unit_id', v_missing, 'unit_number', NULL, 'status', NULL, 'reason', 'not_found');
  END LOOP;

  FOR v_unit IN
    SELECT s.id, s.unit_number, s.status FROM public.stock_items s WHERE s.id = ANY (v_ids) ORDER BY s.unit_number
  LOOP
    v_reason := CASE
      WHEN v_unit.status = 'retired' THEN 'unit_retired'
      WHEN v_unit.status = 'service' THEN 'unit_in_service'
      WHEN v_unit.status = 'damaged' THEN 'unit_damaged'
      WHEN _action = 'check_out' AND v_unit.status = 'with_customer' THEN 'already_checked_out'
      WHEN _action = 'check_in' AND v_unit.status = 'in_stock' THEN 'already_checked_in'
      ELSE NULL
    END;
    IF v_reason IS NOT NULL THEN
      v_forced := v_forced || v_unit.id;
      v_problems := v_problems || jsonb_build_object(
        'unit_id', v_unit.id, 'unit_number', v_unit.unit_number, 'status', v_unit.status, 'reason', v_reason);
    END IF;
  END LOOP;

  IF v_blocking OR (cardinality(v_forced) > 0 AND NOT COALESCE(_force, false)) THEN
    RETURN jsonb_build_object('ok', false, 'problems', v_problems);
  END IF;

  -- Log first so from_status is the pre-move status
  INSERT INTO public.unit_movements (stock_item_id, action, from_status, to_status, order_id, reference, forced, performed_by)
  SELECT s.id, _action, s.status, v_target, _order_id, v_reference, s.id = ANY (v_forced), auth.uid()
  FROM public.stock_items s WHERE s.id = ANY (v_ids);

  -- Status update without the generic status_change log row
  PERFORM set_config('app.unit_move', 'on', true);
  UPDATE public.stock_items s SET status = v_target WHERE s.id = ANY (v_ids) AND s.status <> v_target;
  PERFORM set_config('app.unit_move', '', true);

  -- Link to the order's lines when an order is given
  IF _order_id IS NOT NULL THEN
    FOR v_unit IN
      SELECT s.id, s.equipment_id FROM public.stock_items s WHERE s.id = ANY (v_ids) ORDER BY s.unit_number
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
           'unit_id', s.id, 'unit_number', s.unit_number, 'forced', s.id = ANY (v_forced))
           ORDER BY s.unit_number), '[]'::jsonb)
    INTO v_moved FROM public.stock_items s WHERE s.id = ANY (v_ids);

  RETURN jsonb_build_object('ok', true, 'moved', v_moved);
END;
$$;

-- 4e. record_label_print -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_label_print(_unit_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.stock_items s
     SET label_print_count = s.label_print_count + 1,
         label_last_printed_at = now()
   WHERE s.id IN (SELECT DISTINCT x FROM unnest(COALESCE(_unit_ids, ARRAY[]::uuid[])) x);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 4f. scan_lookup: also item numbers, QR tokens and /i/<token> URLs ---------------
CREATE OR REPLACE FUNCTION public.scan_lookup(_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  code text := btrim(COALESCE(_code, ''));
  url_token text := substring(btrim(COALESCE(_code, '')) FROM '/i/([A-Za-z0-9_-]+)');
  result jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tester')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF url_token IS NULL THEN
    SELECT jsonb_build_object(
      'kind', 'order',
      'order_id', o.id,
      'order_number', o.order_number,
      'status', o.status,
      'starts_on', o.starts_on,
      'ends_on', o.ends_on,
      'customer', c.name
    ) INTO result
    FROM public.orders o
    LEFT JOIN public.customers c ON c.id = o.customer_id
    WHERE upper(o.order_number) = upper(code) OR o.share_token = code
    LIMIT 1;
    IF result IS NOT NULL THEN RETURN result; END IF;
  END IF;

  SELECT jsonb_build_object(
    'kind', 'unit',
    'stock_item_id', s.id,
    'identifier', s.identifier,
    'unit_number', s.unit_number,
    'qr_token', s.qr_token,
    'status', s.status,
    'equipment_id', e.id,
    'equipment_name', e.name
  ) INTO result
  FROM public.stock_items s
  JOIN public.equipment e ON e.id = s.equipment_id
  WHERE CASE
    WHEN url_token IS NOT NULL THEN s.qr_token = url_token
    ELSE s.qr_token = code
      OR upper(s.unit_number) = upper(code)
      OR s.barcode = code
      OR upper(s.identifier) = upper(code)
  END
  ORDER BY (s.qr_token = COALESCE(url_token, code)) DESC, (upper(s.unit_number) = upper(code)) DESC
  LIMIT 1;
  IF result IS NOT NULL THEN RETURN result; END IF;

  IF url_token IS NULL THEN
    SELECT jsonb_build_object(
      'kind', 'product',
      'equipment_id', e.id,
      'equipment_name', e.name,
      'sku', e.sku
    ) INTO result
    FROM public.equipment e
    WHERE e.barcode = code OR upper(COALESCE(e.sku, '')) = upper(code)
    LIMIT 1;
    IF result IS NOT NULL THEN RETURN result; END IF;
  END IF;

  RETURN jsonb_build_object('kind', 'unknown', 'code', code);
END;
$$;

-- Execute grants -------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_public_unit(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_unit(text) TO anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.submit_unit_report(text, text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_unit_report(text, text, text, text, text, text, text, text) TO anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.create_units(uuid, integer, text[], text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_units(uuid, integer, text[], text, text, boolean) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.unit_move(uuid[], text, uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unit_move(uuid[], text, uuid, text, boolean) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.record_label_print(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_label_print(uuid[]) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.scan_lookup(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scan_lookup(text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.stock_items_before_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.stock_items_before_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.stock_items_log_status_change() FROM PUBLIC, anon, authenticated;
