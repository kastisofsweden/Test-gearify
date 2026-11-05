ALTER TABLE public.equipment
  ADD COLUMN label_print_count integer NOT NULL DEFAULT 0,
  ADD COLUMN label_last_printed_at timestamptz;
ALTER TABLE public.equipment ADD CONSTRAINT equipment_label_print_count_check CHECK (label_print_count >= 0);
COMMENT ON COLUMN public.equipment.label_print_count IS 'Product (no-unit) labels printed; unit labels are counted on stock_items.';

CREATE OR REPLACE FUNCTION public.record_product_label_print(_equipment_id uuid, _count integer DEFAULT 1)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v integer;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tester')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.equipment
     SET label_print_count = label_print_count + GREATEST(1, LEAST(COALESCE(_count, 1), 1000)),
         label_last_printed_at = now()
   WHERE id = _equipment_id
   RETURNING label_print_count INTO v;
  RETURN COALESCE(v, 0);
END $$;
REVOKE ALL ON FUNCTION public.record_product_label_print(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_product_label_print(uuid, integer) TO authenticated;
