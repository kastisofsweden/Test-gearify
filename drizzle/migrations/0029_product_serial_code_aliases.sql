-- Products may have alias codes (old barcodes) in serial_codes like units do;
-- only one current code per product stays enforced.
DROP INDEX IF EXISTS public.serial_codes_equipment_id_key;
CREATE UNIQUE INDEX serial_codes_equipment_current_key
  ON public.serial_codes (equipment_id)
  WHERE equipment_id IS NOT NULL AND kind = 'current';
CREATE INDEX IF NOT EXISTS serial_codes_equipment_idx
  ON public.serial_codes (equipment_id)
  WHERE equipment_id IS NOT NULL;
