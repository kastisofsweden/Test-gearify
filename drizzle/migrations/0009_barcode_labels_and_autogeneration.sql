-- Barcode symbology per product and per unit
ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS barcode_type text NOT NULL DEFAULT 'code128';

ALTER TABLE public.stock_items
  ADD COLUMN IF NOT EXISTS barcode_type text NOT NULL DEFAULT 'code128';

CREATE UNIQUE INDEX IF NOT EXISTS stock_items_barcode_key
  ON public.stock_items (barcode) WHERE barcode IS NOT NULL;

-- Auto-generate a barcode number whenever one is missing
CREATE OR REPLACE FUNCTION public.generate_barcode_value()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
$$;

CREATE OR REPLACE FUNCTION public.equipment_autobarcode()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.barcode IS NULL OR btrim(NEW.barcode) = '' THEN
    NEW.barcode := public.generate_barcode_value();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS equipment_autobarcode ON public.equipment;
CREATE TRIGGER equipment_autobarcode
BEFORE INSERT OR UPDATE ON public.equipment
FOR EACH ROW EXECUTE FUNCTION public.equipment_autobarcode();

CREATE OR REPLACE FUNCTION public.stock_items_autobarcode()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.barcode IS NULL OR btrim(NEW.barcode) = '' THEN
    NEW.barcode := public.generate_barcode_value();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stock_items_autobarcode ON public.stock_items;
CREATE TRIGGER stock_items_autobarcode
BEFORE INSERT OR UPDATE ON public.stock_items
FOR EACH ROW EXECUTE FUNCTION public.stock_items_autobarcode();

-- Backfill existing rows
UPDATE public.equipment SET barcode = public.generate_barcode_value()
WHERE barcode IS NULL OR btrim(barcode) = '';

UPDATE public.stock_items SET barcode = public.generate_barcode_value()
WHERE barcode IS NULL OR btrim(barcode) = '';

-- Scan lookup: resolve any scanned code to a product, unit or order
CREATE OR REPLACE FUNCTION public.scan_lookup(_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  code text := btrim(_code);
  result jsonb;
BEGIN
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

  SELECT jsonb_build_object(
    'kind', 'unit',
    'stock_item_id', s.id,
    'identifier', s.identifier,
    'status', s.status,
    'equipment_id', e.id,
    'equipment_name', e.name
  ) INTO result
  FROM public.stock_items s
  JOIN public.equipment e ON e.id = s.equipment_id
  WHERE s.barcode = code OR upper(s.identifier) = upper(code)
  LIMIT 1;
  IF result IS NOT NULL THEN RETURN result; END IF;

  SELECT jsonb_build_object(
    'kind', 'product',
    'equipment_id', e.id,
    'equipment_name', e.name,
    'sku', e.sku
  ) INTO result
  FROM public.equipment e
  WHERE e.barcode = code OR upper(coalesce(e.sku, '')) = upper(code)
  LIMIT 1;
  IF result IS NOT NULL THEN RETURN result; END IF;

  RETURN jsonb_build_object('kind', 'unknown', 'code', code);
END;
$$;

GRANT EXECUTE ON FUNCTION public.scan_lookup(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_barcode_value() TO authenticated, service_role;
