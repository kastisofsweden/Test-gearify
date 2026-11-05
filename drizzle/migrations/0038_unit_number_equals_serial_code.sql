-- New units get unit_number = serial_code.
CREATE OR REPLACE FUNCTION public.stock_items_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE a record;
BEGIN
  NEW.qr_token := public.new_qr_token();
  SELECT * INTO a FROM public.allocate_unit_serial(NEW.equipment_id);
  NEW.serial_code := a.serial;
  NEW.sn_series_id := a.series_id;
  NEW.sn_org_no := a.org_no;
  NEW.sn_item_no := a.item_no;
  -- New units: the legacy unit number is the S/N itself (existing rows are not rewritten).
  NEW.unit_number := NEW.serial_code;
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
END $function$;
REVOKE ALL ON FUNCTION public.stock_items_before_insert() FROM PUBLIC, anon, authenticated;
