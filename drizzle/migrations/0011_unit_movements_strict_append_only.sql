REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.unit_movements FROM authenticated;
REVOKE ALL ON public.unit_movements FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.unit_reports FROM authenticated;
REVOKE ALL ON public.unit_reports FROM anon;

CREATE OR REPLACE FUNCTION public.unit_movements_no_truncate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'unit_movements is append-only';
END;
$$;

DROP TRIGGER IF EXISTS unit_movements_no_truncate ON public.unit_movements;
CREATE TRIGGER unit_movements_no_truncate
BEFORE TRUNCATE ON public.unit_movements
FOR EACH STATEMENT EXECUTE FUNCTION public.unit_movements_no_truncate();
