-- Leads are submitted through a server function that passes a salted IP hash.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS client_fingerprint text;
CREATE INDEX IF NOT EXISTS leads_client_fingerprint_created_at_idx
  ON public.leads (client_fingerprint, created_at);
DROP FUNCTION IF EXISTS public.submit_lead(text, text, text, text, text, date, date, text, text, bigint);
CREATE OR REPLACE FUNCTION public.submit_lead(_name text, _email text, _phone text DEFAULT NULL::text, _company text DEFAULT NULL::text, _message text DEFAULT NULL::text, _rental_start date DEFAULT NULL::date, _rental_end date DEFAULT NULL::date, _source text DEFAULT 'website'::text, _honeypot text DEFAULT NULL::text, _form_started_at bigint DEFAULT NULL::bigint, _client_fingerprint text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email text := lower(trim(COALESCE(_email, '')));
  v_name text := trim(COALESCE(_name, ''));
  v_source text := COALESCE(NULLIF(trim(_source), ''), 'website');
BEGIN
  IF _client_fingerprint IS NULL OR _client_fingerprint !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_fingerprint';
  END IF;
  IF length(trim(COALESCE(_honeypot, ''))) > 0 THEN
    RETURN jsonb_build_object('ok', true);
  END IF;
  IF _form_started_at IS NULL
     OR (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT - _form_started_at < 3000 THEN
    RAISE EXCEPTION 'too_fast';
  END IF;
  IF length(v_name) < 2 OR length(v_name) > 120 THEN RAISE EXCEPTION 'invalid_name'; END IF;
  IF length(v_email) > 200 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'invalid_email'; END IF;
  IF length(COALESCE(_phone, '')) > 40 OR length(COALESCE(_company, '')) > 120
     OR length(COALESCE(_message, '')) > 4000 THEN
    RAISE EXCEPTION 'too_long';
  END IF;
  IF v_source !~ '^[a-z0-9_:/.-]{1,80}$' THEN v_source := 'website'; END IF;
  IF _rental_start IS NOT NULL AND _rental_end IS NOT NULL AND _rental_end < _rental_start THEN
    RAISE EXCEPTION 'invalid_dates';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('public.submit_lead'));
  IF (SELECT count(*) FROM public.leads
      WHERE created_by IS NULL AND created_at > now() - interval '1 hour') >= 60 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;
  IF (SELECT count(*) FROM public.leads
      WHERE lower(email) = v_email AND created_at > now() - interval '1 hour') >= 3 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  IF (SELECT count(*) FROM public.leads
      WHERE client_fingerprint = _client_fingerprint AND created_at > now() - interval '1 hour') >= 5 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  INSERT INTO public.leads (name, email, phone, company, message, rental_start, rental_end, source, created_by, client_fingerprint)
  VALUES (
    v_name, v_email,
    NULLIF(trim(COALESCE(_phone, '')), ''),
    NULLIF(trim(COALESCE(_company, '')), ''),
    NULLIF(trim(COALESCE(_message, '')), ''),
    _rental_start, _rental_end, v_source, NULL, _client_fingerprint
  );
  RETURN jsonb_build_object('ok', true);
END $function$;

REVOKE ALL ON FUNCTION public.submit_lead(text, text, text, text, text, date, date, text, text, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_lead(text, text, text, text, text, date, date, text, text, bigint, text) TO service_role;
