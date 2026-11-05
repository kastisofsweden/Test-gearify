-- Reject manually entered barcodes that collide with any current, old or alias code.
CREATE OR REPLACE FUNCTION public.stock_items_validate_barcode()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE v text := upper(btrim(COALESCE(NEW.barcode, '')));
BEGIN
  IF v = '' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.barcode IS NOT DISTINCT FROM OLD.barcode THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.serial_codes c
             WHERE upper(c.code) = v AND c.stock_item_id IS DISTINCT FROM NEW.id)
     OR EXISTS (SELECT 1 FROM public.equipment e
             WHERE v IN (upper(e.barcode), upper(e.serial_code), upper(e.legacy_barcode)))
     OR EXISTS (SELECT 1 FROM public.stock_items s
             WHERE s.id <> NEW.id
               AND v IN (upper(s.barcode), upper(s.serial_code), upper(s.unit_number))) THEN
    RAISE EXCEPTION 'barcode_in_use:%', NEW.barcode;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.equipment_validate_barcode()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE v text := upper(btrim(COALESCE(NEW.barcode, '')));
BEGIN
  IF v = '' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.barcode IS NOT DISTINCT FROM OLD.barcode THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.serial_codes c
             WHERE upper(c.code) = v
               AND NOT (c.stock_item_id IS NULL AND c.equipment_id = NEW.id))
     OR EXISTS (SELECT 1 FROM public.equipment e
             WHERE e.id <> NEW.id
               AND v IN (upper(e.barcode), upper(e.serial_code), upper(e.legacy_barcode)))
     OR EXISTS (SELECT 1 FROM public.stock_items s
             WHERE v IN (upper(s.barcode), upper(s.serial_code), upper(s.unit_number))) THEN
    RAISE EXCEPTION 'barcode_in_use:%', NEW.barcode;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.stock_items_validate_barcode() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.equipment_validate_barcode() FROM PUBLIC, anon, authenticated;

-- Named to sort after the triggers that fill in default barcodes.
DROP TRIGGER IF EXISTS stock_items_validate_barcode ON public.stock_items;
CREATE TRIGGER stock_items_validate_barcode
  BEFORE INSERT OR UPDATE OF barcode ON public.stock_items
  FOR EACH ROW EXECUTE FUNCTION public.stock_items_validate_barcode();

DROP TRIGGER IF EXISTS equipment_validate_barcode ON public.equipment;
CREATE TRIGGER equipment_validate_barcode
  BEFORE INSERT OR UPDATE OF barcode ON public.equipment
  FOR EACH ROW EXECUTE FUNCTION public.equipment_validate_barcode();
