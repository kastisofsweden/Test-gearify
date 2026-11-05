-- Organization hierarchy + per-root Item-ID series (e.g. DCB100, DCB101 ...)
ALTER TABLE public.organizations
  ADD COLUMN parent_id uuid REFERENCES public.organizations(id),
  ADD COLUMN item_prefix text,
  ADD COLUMN next_item_number bigint NOT NULL DEFAULT 100,
  ADD COLUMN item_prefix_locked boolean NOT NULL DEFAULT false;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_item_prefix_format CHECK (item_prefix IS NULL OR item_prefix ~ '^[A-Z]{2,6}$'),
  ADD CONSTRAINT organizations_next_item_number_positive CHECK (next_item_number >= 1),
  ADD CONSTRAINT organizations_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id);

CREATE UNIQUE INDEX organizations_item_prefix_key ON public.organizations (item_prefix) WHERE item_prefix IS NOT NULL;

UPDATE public.organizations SET item_prefix = 'DCB' WHERE name = 'Dream Crazy Big' AND item_prefix IS NULL;

CREATE OR REPLACE FUNCTION public.organizations_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.item_prefix := NULLIF(upper(btrim(COALESCE(NEW.item_prefix, ''))), '');
  IF NEW.parent_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.organizations p WHERE p.id = NEW.parent_id AND p.parent_id IS NOT NULL) THEN
      RAISE EXCEPTION 'parent_must_be_main_organization';
    END IF;
    IF TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM public.organizations c WHERE c.parent_id = NEW.id) THEN
      RAISE EXCEPTION 'organization_has_sub_organizations';
    END IF;
    IF NEW.item_prefix IS NOT NULL THEN
      RAISE EXCEPTION 'sub_organization_cannot_have_prefix';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.item_prefix_locked AND (NEW.item_prefix IS DISTINCT FROM OLD.item_prefix
        OR NEW.parent_id IS DISTINCT FROM OLD.parent_id) THEN
      RAISE EXCEPTION 'item_prefix_locked';
    END IF;
    IF NEW.next_item_number < OLD.next_item_number THEN
      RAISE EXCEPTION 'item_number_cannot_decrease';
    END IF;
    IF OLD.item_prefix_locked AND NOT NEW.item_prefix_locked THEN
      NEW.item_prefix_locked := true;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER organizations_validate BEFORE INSERT OR UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.organizations_validate();

-- Atomically allocates the next Item-ID from the product's main organization.
CREATE OR REPLACE FUNCTION public.allocate_item_id(_equipment_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid;
  v_root uuid;
  v_prefix text;
  v_n bigint;
  v_id text;
BEGIN
  SELECT e.organization_id INTO v_org FROM public.equipment e WHERE e.id = _equipment_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'product_has_no_organization'; END IF;
  SELECT COALESCE(o.parent_id, o.id) INTO v_root FROM public.organizations o WHERE o.id = v_org;
  LOOP
    UPDATE public.organizations o
       SET next_item_number = o.next_item_number + 1, item_prefix_locked = true
     WHERE o.id = v_root AND o.item_prefix IS NOT NULL
     RETURNING o.item_prefix, o.next_item_number - 1 INTO v_prefix, v_n;
    IF v_prefix IS NULL THEN RAISE EXCEPTION 'organization_prefix_missing'; END IF;
    v_id := v_prefix || v_n::text;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.stock_items s WHERE upper(s.unit_number) = v_id);
  END LOOP;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.allocate_item_id(uuid) FROM PUBLIC, anon, authenticated;

CREATE UNIQUE INDEX stock_items_unit_number_upper_key ON public.stock_items (upper(unit_number));

CREATE OR REPLACE FUNCTION public.stock_items_before_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  -- Always server-generated; client-supplied values are ignored.
  NEW.unit_number := public.allocate_item_id(NEW.equipment_id);
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
$function$;

COMMENT ON COLUMN public.stock_items.unit_number IS 'Readable Item-ID (S/N), e.g. DCB100: main-organization prefix + never-reused counter. Separate from manufacturer serial_number.';
COMMENT ON FUNCTION public.next_stock_unit_number() IS 'DEPRECATED: replaced by allocate_item_id(equipment_id)';

-- Scanner: accept "S/N: DCB100" as typed/printed, plus all previous aliases.
CREATE OR REPLACE FUNCTION public.scan_lookup(_code text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  code text := regexp_replace(btrim(COALESCE(_code, '')), '^S/N:?\s*', '', 'i');
  url_token text := substring(btrim(COALESCE(_code, '')) FROM '/i/([A-Za-z0-9_-]+)');
  result jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tester')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF url_token IS NULL THEN
    SELECT jsonb_build_object('kind', 'order', 'order_id', o.id, 'order_number', o.order_number,
      'status', o.status, 'starts_on', o.starts_on, 'ends_on', o.ends_on, 'customer', c.name) INTO result
    FROM public.orders o LEFT JOIN public.customers c ON c.id = o.customer_id
    WHERE upper(o.order_number) = upper(code) OR o.share_token = code
    LIMIT 1;
    IF result IS NOT NULL THEN RETURN result; END IF;
  END IF;

  SELECT jsonb_build_object('kind', 'unit', 'stock_item_id', s.id, 'identifier', s.identifier,
    'unit_number', s.unit_number, 'qr_token', s.qr_token, 'status', s.status,
    'equipment_id', e.id, 'equipment_name', e.name) INTO result
  FROM public.stock_items s JOIN public.equipment e ON e.id = s.equipment_id
  WHERE CASE
    WHEN url_token IS NOT NULL THEN s.qr_token = url_token
    ELSE s.qr_token = code OR upper(s.unit_number) = upper(code) OR s.barcode = code OR upper(s.identifier) = upper(code)
  END
  ORDER BY (s.qr_token = COALESCE(url_token, code)) DESC, (upper(s.unit_number) = upper(code)) DESC
  LIMIT 1;
  IF result IS NOT NULL THEN RETURN result; END IF;

  IF url_token IS NULL THEN
    SELECT jsonb_build_object('kind', 'product', 'equipment_id', e.id, 'equipment_name', e.name, 'sku', e.sku) INTO result
    FROM public.equipment e
    WHERE e.barcode = code OR upper(COALESCE(e.sku, '')) = upper(code)
    LIMIT 1;
    IF result IS NOT NULL THEN RETURN result; END IF;
  END IF;

  RETURN jsonb_build_object('kind', 'unknown', 'code', code);
END;
$function$;
