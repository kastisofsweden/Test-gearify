-- Unit reports from anonymous visitors are always 'customer'; testers may record label prints;
-- the unused product label print counter RPC is removed.
CREATE OR REPLACE FUNCTION public.submit_unit_report(_token text, _type text, _role text, _message text, _name text DEFAULT NULL::text, _phone text DEFAULT NULL::text, _email text DEFAULT NULL::text, _honeypot text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  ) VALUES (
    v_unit.id, v_type,
    -- Anonymous reporters are always customers; only signed-in users may report as staff.
    CASE WHEN auth.uid() IS NULL THEN 'customer' ELSE v_role END,
    v_message, v_name, v_phone, v_email);

  RETURN jsonb_build_object('ok', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_label_print(_unit_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_count integer;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tester')) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.stock_items s
     SET label_print_count = s.label_print_count + 1,
         label_last_printed_at = now()
   WHERE s.id IN (SELECT DISTINCT x FROM unnest(COALESCE(_unit_ids, ARRAY[]::uuid[])) x);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_label_print(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_label_print(uuid[]) TO authenticated;
DROP FUNCTION IF EXISTS public.record_product_label_print(uuid, integer);
