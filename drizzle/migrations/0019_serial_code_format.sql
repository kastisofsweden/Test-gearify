-- New primary S/N: <ORG><NNN>-<CC><MMM>[-<KK>], e.g. DCB001-TV001. Replaces the item_code-based label ID.

-- 1) ASCII letter mapping (Å/Ä -> A, Ö -> O, other accents to ASCII), letters A-Z only.
CREATE OR REPLACE FUNCTION public.letters_only(_s text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT regexp_replace(upper(translate(
    replace(replace(replace(replace(replace(COALESCE(_s, ''), 'ß', 'ss'), 'æ', 'ae'), 'Æ', 'AE'), 'œ', 'oe'), 'Œ', 'OE'),
    'åäáàâãāăąÅÄÁÀÂÃĀĂĄçćčÇĆČďĎđĐéèêëēėęěÉÈÊËĒĖĘĚíìîïīįÍÌÎÏĪĮłŁñńňÑŃŇöóòôõøōőÖÓÒÔÕØŌŐřŘšśşŠŚŞťŤüúùûūůűÜÚÙÛŪŮŰýÿÝžźżŽŹŻ',
    'aaaaaaaaaAAAAAAAAAcccCCCdDdDeeeeeeeeEEEEEEEEiiiiiiIIIIIIlLnnnNNNooooooooOOOOOOOOrRsssSSStTuuuuuuuUUUUUUUyyYzzzZZZ'
  )), '[^A-Z]', '', 'g')
$$;

-- "Dream Crazy Big" -> "DCB": first letter of each word (split on whitespace and hyphens), max 6, 'X' if none.
CREATE OR REPLACE FUNCTION public.derive_org_prefix(_name text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT COALESCE(NULLIF(left(string_agg(left(public.letters_only(w), 1), '' ORDER BY ord), 6), ''), 'X')
  FROM regexp_split_to_table(COALESCE(_name, ''), '[[:space:]‐‑–—-]+') WITH ORDINALITY AS t(w, ord)
  WHERE public.letters_only(w) <> ''
$$;

-- "accessories" -> "AS", "TV" -> "TV", "A" -> "AA", no letters -> "XX".
CREATE OR REPLACE FUNCTION public.serial_category_code(_category text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN length(l) >= 2 THEN left(l, 1) || right(l, 1) WHEN length(l) = 1 THEN l || l ELSE 'XX' END
  FROM (SELECT public.letters_only(_category) AS l) t
$$;

-- Display = ((n-1) % 999) + 1 zero-padded to 3; suffix -KK = floor((n_org-1)/999) only when >= 1.
CREATE OR REPLACE FUNCTION public.format_serial_code(_prefix text, _category_code text, _n_org bigint, _n_cat bigint)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE k bigint;
BEGIN
  IF _n_org IS NULL OR _n_cat IS NULL OR _n_org < 1 OR _n_cat < 1 THEN RAISE EXCEPTION 'invalid_serial_counter'; END IF;
  k := (_n_org - 1) / 999;
  RETURN _prefix || lpad((((_n_org - 1) % 999) + 1)::text, 3, '0')
    || '-' || _category_code || lpad((((_n_cat - 1) % 999) + 1)::text, 3, '0')
    || CASE WHEN k >= 1 THEN '-' || CASE WHEN k < 100 THEN lpad(k::text, 2, '0') ELSE k::text END ELSE '' END;
END $$;

-- Single-letter prefixes are now valid (empty org name -> 'X').
ALTER TABLE public.organizations DROP CONSTRAINT organizations_item_prefix_format;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_item_prefix_format
  CHECK (item_prefix IS NULL OR item_prefix ~ '^[A-Z]{1,6}$');

CREATE OR REPLACE FUNCTION public.organizations_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.item_prefix := NULLIF(upper(btrim(COALESCE(NEW.item_prefix, ''))), '');
  IF NEW.parent_id IS NULL AND NEW.item_prefix IS NULL THEN
    NEW.item_prefix := public.derive_org_prefix(NEW.name);
  END IF;
  IF NEW.parent_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.organizations p WHERE p.id = NEW.parent_id AND p.parent_id IS NOT NULL) THEN
      RAISE EXCEPTION 'parent_must_be_main_organization';
    END IF;
    IF TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM public.organizations c WHERE c.parent_id = NEW.id) THEN
      RAISE EXCEPTION 'organization_has_sub_organizations';
    END IF;
    NEW.item_prefix := NULL;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.item_prefix_locked AND (NEW.item_prefix IS DISTINCT FROM OLD.item_prefix
        OR NEW.parent_id IS DISTINCT FROM OLD.parent_id) THEN
      RAISE EXCEPTION 'item_prefix_locked';
    END IF;
    IF OLD.item_prefix_locked AND NEW.next_item_number < OLD.next_item_number THEN
      RAISE EXCEPTION 'item_number_cannot_decrease';
    END IF;
    IF OLD.item_prefix_locked AND NOT NEW.item_prefix_locked THEN
      NEW.item_prefix_locked := true;
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- 2) Counters: scopes 'org:<PREFIX>' and 'cat:<PREFIX>:<CC>'. Only written by next_serial_code.
CREATE TABLE public.serial_counters (
  scope text PRIMARY KEY,
  last_value bigint NOT NULL CHECK (last_value >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.serial_counters TO authenticated;
GRANT ALL ON public.serial_counters TO service_role;
ALTER TABLE public.serial_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and testers read serial counters" ON public.serial_counters
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tester'));

-- 3) Registry: one row per issued code, so a code is unique across products and units. Never deleted on
-- item delete (owner set to NULL), so a code is never reused.
CREATE TABLE public.serial_codes (
  code text PRIMARY KEY,
  equipment_id uuid REFERENCES public.equipment(id) ON DELETE SET NULL,
  stock_item_id uuid REFERENCES public.stock_items(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT serial_codes_single_owner CHECK (equipment_id IS NULL OR stock_item_id IS NULL)
);
CREATE UNIQUE INDEX serial_codes_equipment_id_key ON public.serial_codes (equipment_id) WHERE equipment_id IS NOT NULL;
CREATE UNIQUE INDEX serial_codes_stock_item_id_key ON public.serial_codes (stock_item_id) WHERE stock_item_id IS NOT NULL;
GRANT SELECT ON public.serial_codes TO authenticated;
GRANT ALL ON public.serial_codes TO service_role;
ALTER TABLE public.serial_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and testers read serial codes" ON public.serial_codes
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tester'));

-- 4) Allocation. The INSERT ... ON CONFLICT DO UPDATE row-locks each counter until commit, so concurrent
-- inserts and bulk create_units/CSV imports serialize per scope and never get the same number.
CREATE OR REPLACE FUNCTION public.next_serial_code(_org_id uuid, _category text)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_root uuid := _org_id;
  v_parent uuid;
  v_depth integer := 0;
  v_prefix text;
  v_name text;
  v_locked boolean;
  v_cc text := public.serial_category_code(_category);
  v_org bigint;
  v_cat bigint;
BEGIN
  -- Walk parent_id to the root organization.
  WHILE v_root IS NOT NULL LOOP
    SELECT o.parent_id INTO v_parent FROM public.organizations o WHERE o.id = v_root;
    IF NOT FOUND THEN v_root := NULL; EXIT; END IF;
    EXIT WHEN v_parent IS NULL;
    v_root := v_parent;
    v_depth := v_depth + 1;
    IF v_depth > 20 THEN RAISE EXCEPTION 'organization_cycle'; END IF;
  END LOOP;
  -- Fallback: the single/default (oldest active) main organization.
  IF v_root IS NULL THEN
    SELECT o.id INTO v_root FROM public.organizations o
    WHERE o.parent_id IS NULL ORDER BY o.is_active DESC, o.created_at, o.id LIMIT 1;
  END IF;

  IF v_root IS NULL THEN
    v_prefix := 'X';
  ELSE
    SELECT o.item_prefix, o.name, o.item_prefix_locked INTO v_prefix, v_name, v_locked
    FROM public.organizations o WHERE o.id = v_root FOR UPDATE;
    v_prefix := COALESCE(NULLIF(public.letters_only(v_prefix), ''), public.derive_org_prefix(v_name));
    IF NOT v_locked THEN
      -- Lock on first issue: a later rename never changes existing codes.
      UPDATE public.organizations SET item_prefix = v_prefix, item_prefix_locked = true WHERE id = v_root;
    END IF;
  END IF;

  INSERT INTO public.serial_counters AS c (scope, last_value) VALUES ('org:' || v_prefix, 1)
  ON CONFLICT (scope) DO UPDATE SET last_value = c.last_value + 1, updated_at = now()
  RETURNING c.last_value INTO v_org;

  INSERT INTO public.serial_counters AS c (scope, last_value) VALUES ('cat:' || v_prefix || ':' || v_cc, 1)
  ON CONFLICT (scope) DO UPDATE SET last_value = c.last_value + 1, updated_at = now()
  RETURNING c.last_value INTO v_cat;

  RETURN public.format_serial_code(v_prefix, v_cc, v_org, v_cat);
END $$;
REVOKE ALL ON FUNCTION public.next_serial_code(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_serial_code(uuid, text) TO service_role;

-- Read-only prediction for the CSV import preview: one code per entry, in creation order. Final codes are
-- assigned on save and can differ if someone else registers items in between.
CREATE OR REPLACE FUNCTION public.preview_serial_codes(_equipment_ids uuid[])
RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_out text[] := ARRAY[]::text[];
  v_next jsonb := '{}'::jsonb;
  v_id uuid;
  e record;
  v_root uuid;
  v_parent uuid;
  v_prefix text;
  v_cc text;
  v_org bigint;
  v_cat bigint;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tester')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF cardinality(COALESCE(_equipment_ids, ARRAY[]::uuid[])) > 5000 THEN RAISE EXCEPTION 'too_many_items'; END IF;
  FOREACH v_id IN ARRAY COALESCE(_equipment_ids, ARRAY[]::uuid[]) LOOP
    SELECT eq.organization_id, eq.category INTO e FROM public.equipment eq WHERE eq.id = v_id;
    IF NOT FOUND THEN v_out := v_out || NULL::text; CONTINUE; END IF;
    v_root := e.organization_id;
    LOOP
      EXIT WHEN v_root IS NULL;
      SELECT o.parent_id INTO v_parent FROM public.organizations o WHERE o.id = v_root;
      EXIT WHEN v_parent IS NULL;
      v_root := v_parent;
    END LOOP;
    IF v_root IS NULL THEN
      SELECT o.id INTO v_root FROM public.organizations o
      WHERE o.parent_id IS NULL ORDER BY o.is_active DESC, o.created_at, o.id LIMIT 1;
    END IF;
    SELECT COALESCE(NULLIF(public.letters_only(o.item_prefix), ''), public.derive_org_prefix(o.name))
      INTO v_prefix FROM public.organizations o WHERE o.id = v_root;
    v_prefix := COALESCE(v_prefix, 'X');
    v_cc := public.serial_category_code(e.category);
    v_org := COALESCE((v_next->>('org:' || v_prefix))::bigint,
      (SELECT c.last_value FROM public.serial_counters c WHERE c.scope = 'org:' || v_prefix), 0) + 1;
    v_cat := COALESCE((v_next->>('cat:' || v_prefix || ':' || v_cc))::bigint,
      (SELECT c.last_value FROM public.serial_counters c WHERE c.scope = 'cat:' || v_prefix || ':' || v_cc), 0) + 1;
    v_next := v_next || jsonb_build_object('org:' || v_prefix, v_org, 'cat:' || v_prefix || ':' || v_cc, v_cat);
    v_out := v_out || public.format_serial_code(v_prefix, v_cc, v_org, v_cat);
  END LOOP;
  RETURN v_out;
END $$;
REVOKE ALL ON FUNCTION public.preview_serial_codes(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_serial_codes(uuid[]) TO authenticated, service_role;

-- 5) Columns + backfill (equipment and units together, in registration order).
ALTER TABLE public.equipment ADD COLUMN serial_code text;
ALTER TABLE public.equipment ADD COLUMN legacy_barcode text;
ALTER TABLE public.stock_items ADD COLUMN serial_code text;

UPDATE public.equipment SET legacy_barcode = barcode
WHERE legacy_barcode IS NULL AND barcode IS NOT NULL AND btrim(barcode) <> '';

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT x.kind, x.id, x.org, x.cat FROM (
      SELECT 'equipment'::text AS kind, e.id, e.organization_id AS org, e.category AS cat, e.created_at
      FROM public.equipment e WHERE e.serial_code IS NULL
      UNION ALL
      SELECT 'unit', s.id, e.organization_id, e.category, s.created_at
      FROM public.stock_items s JOIN public.equipment e ON e.id = s.equipment_id WHERE s.serial_code IS NULL
    ) x
    ORDER BY x.created_at, x.id
  LOOP
    IF r.kind = 'equipment' THEN
      UPDATE public.equipment SET serial_code = public.next_serial_code(r.org, r.cat) WHERE id = r.id;
    ELSE
      UPDATE public.stock_items SET serial_code = public.next_serial_code(r.org, r.cat) WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

INSERT INTO public.serial_codes (code, equipment_id) SELECT serial_code, id FROM public.equipment;
INSERT INTO public.serial_codes (code, stock_item_id) SELECT serial_code, id FROM public.stock_items;

UPDATE public.equipment SET barcode = serial_code;
-- Units: the old item_code-style ID stays in unit_number; only default barcodes move to the new code.
UPDATE public.stock_items SET barcode = serial_code
WHERE barcode IS NULL OR btrim(barcode) = '' OR barcode = unit_number;

ALTER TABLE public.equipment ALTER COLUMN serial_code SET NOT NULL;
ALTER TABLE public.stock_items ALTER COLUMN serial_code SET NOT NULL;
ALTER TABLE public.equipment ADD CONSTRAINT equipment_serial_code_key UNIQUE (serial_code);
ALTER TABLE public.stock_items ADD CONSTRAINT stock_items_serial_code_key UNIQUE (serial_code);
ALTER TABLE public.equipment ADD CONSTRAINT equipment_serial_code_format
  CHECK (serial_code ~ '^[A-Z]{1,6}[0-9]{3}-[A-Z]{2}[0-9]{3}(-[0-9]{2,})?$');
ALTER TABLE public.stock_items ADD CONSTRAINT stock_items_serial_code_format
  CHECK (serial_code ~ '^[A-Z]{1,6}[0-9]{3}-[A-Z]{2}[0-9]{3}(-[0-9]{2,})?$');
CREATE INDEX equipment_legacy_barcode_idx ON public.equipment (upper(legacy_barcode)) WHERE legacy_barcode IS NOT NULL;

COMMENT ON COLUMN public.equipment.serial_code IS 'Primary S/N (e.g. DCB001-TV001), trigger-assigned on insert by next_serial_code, immutable. Printed on labels and encoded in Code 128.';
COMMENT ON COLUMN public.stock_items.serial_code IS 'Primary S/N (e.g. DCB001-TV001), trigger-assigned on insert by next_serial_code, immutable. Printed on labels and encoded in Code 128.';
COMMENT ON COLUMN public.equipment.legacy_barcode IS 'Barcode before the serial_code migration; already printed labels still resolve through scan_lookup.';
COMMENT ON COLUMN public.stock_items.serial_number IS 'Manufacturer S/N (optional, separate from serial_code).';
COMMENT ON COLUMN public.equipment.item_code IS 'DEPRECATED: replaced by serial_code for labels; only feeds the legacy unit_number.';
COMMENT ON COLUMN public.equipment.item_seq IS 'DEPRECATED: replaced by serial_code for labels; only feeds the legacy unit_number.';

-- 6) Triggers.
-- Equipment: autobarcode only on UPDATE now; on INSERT the barcode defaults to the new S/N.
DROP TRIGGER IF EXISTS equipment_autobarcode ON public.equipment;
CREATE OR REPLACE FUNCTION public.equipment_autobarcode()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.barcode IS NULL OR btrim(NEW.barcode) = '' THEN
    NEW.barcode := COALESCE(NEW.serial_code, public.generate_barcode_value());
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER equipment_autobarcode BEFORE UPDATE ON public.equipment
  FOR EACH ROW EXECUTE FUNCTION public.equipment_autobarcode();

-- Runs after equipment_require_organization (alphabetical order) so the organization is resolved.
CREATE OR REPLACE FUNCTION public.equipment_assign_serial_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.serial_code := public.next_serial_code(NEW.organization_id, NEW.category);
  NEW.legacy_barcode := NULL;
  IF NEW.barcode IS NULL OR btrim(NEW.barcode) = '' THEN
    NEW.barcode := NEW.serial_code;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER equipment_serial_code_assign BEFORE INSERT ON public.equipment
  FOR EACH ROW EXECUTE FUNCTION public.equipment_assign_serial_code();

CREATE OR REPLACE FUNCTION public.equipment_serial_code_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.serial_code IS DISTINCT FROM OLD.serial_code THEN RAISE EXCEPTION 'serial_code_immutable'; END IF;
  IF OLD.legacy_barcode IS NOT NULL AND NEW.legacy_barcode IS DISTINCT FROM OLD.legacy_barcode THEN
    RAISE EXCEPTION 'legacy_barcode_immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER equipment_serial_code_immutable BEFORE UPDATE ON public.equipment
  FOR EACH ROW EXECUTE FUNCTION public.equipment_serial_code_immutable();

CREATE OR REPLACE FUNCTION public.stock_items_serial_code_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.serial_code IS DISTINCT FROM OLD.serial_code THEN RAISE EXCEPTION 'serial_code_immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER stock_items_serial_code_immutable BEFORE UPDATE ON public.stock_items
  FOR EACH ROW EXECUTE FUNCTION public.stock_items_serial_code_immutable();

-- Registry rows (AFTER INSERT so the owner row exists for the FK). A clash aborts the insert.
CREATE OR REPLACE FUNCTION public.register_serial_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'equipment' THEN
    INSERT INTO public.serial_codes (code, equipment_id) VALUES (NEW.serial_code, NEW.id);
  ELSE
    INSERT INTO public.serial_codes (code, stock_item_id) VALUES (NEW.serial_code, NEW.id);
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER equipment_serial_code_register AFTER INSERT ON public.equipment
  FOR EACH ROW EXECUTE FUNCTION public.register_serial_code();
CREATE TRIGGER stock_items_serial_code_register AFTER INSERT ON public.stock_items
  FOR EACH ROW EXECUTE FUNCTION public.register_serial_code();

-- Units: S/N from the parent product's organization + category; barcode defaults to it.
CREATE OR REPLACE FUNCTION public.stock_items_before_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org uuid; v_cat text;
BEGIN
  -- Always server-generated; client-supplied values are ignored.
  NEW.unit_number := public.allocate_item_id(NEW.equipment_id);
  NEW.qr_token := public.new_qr_token();
  SELECT e.organization_id, e.category INTO v_org, v_cat FROM public.equipment e WHERE e.id = NEW.equipment_id;
  NEW.serial_code := public.next_serial_code(v_org, v_cat);
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
END $$;

CREATE OR REPLACE FUNCTION public.stock_items_before_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.unit_number IS DISTINCT FROM OLD.unit_number THEN
    RAISE EXCEPTION 'unit_number_immutable';
  END IF;
  IF NEW.qr_token IS DISTINCT FROM OLD.qr_token THEN
    RAISE EXCEPTION 'qr_token_immutable';
  END IF;
  IF NEW.barcode IS NULL OR btrim(NEW.barcode) = '' THEN
    NEW.barcode := COALESCE(NEW.serial_code, NEW.unit_number);
  END IF;
  RETURN NEW;
END $$;

-- 7) RPCs return the new code too.
DROP FUNCTION public.create_units(uuid, integer, text[], text, text, boolean);
CREATE FUNCTION public.create_units(_equipment_id uuid, _count integer, _serials text[] DEFAULT NULL::text[], _batch text DEFAULT NULL::text, _location text DEFAULT NULL::text, _is_test boolean DEFAULT false)
 RETURNS TABLE(id uuid, unit_number text, qr_token text, serial_number text, serial_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Creation order (the order the S/N numbers were issued in).
  RETURN QUERY
  SELECT s.id, s.unit_number, s.qr_token, s.serial_number, s.serial_code
  FROM public.stock_items s
  WHERE s.id = ANY (v_ids)
  ORDER BY array_position(v_ids, s.id);
END;
$function$;
REVOKE ALL ON FUNCTION public.create_units(uuid, integer, text[], text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_units(uuid, integer, text[], text, text, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_public_unit(_token text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'unit_number', s.unit_number,
    'serial_code', s.serial_code,
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
$function$;

CREATE OR REPLACE FUNCTION public.scan_lookup(_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  code text := regexp_replace(btrim(COALESCE(_code, '')), '^S/N:?\s*', '', 'i');
  ucode text;
  url_token text := substring(btrim(COALESCE(_code, '')) FROM '/i/([A-Za-z0-9_-]+)');
  reg public.serial_codes;
  result jsonb;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tester')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  ucode := upper(code);

  -- New S/N (units and products share one registry).
  IF url_token IS NULL AND ucode <> '' THEN
    SELECT * INTO reg FROM public.serial_codes WHERE serial_codes.code = ucode;
    IF reg.stock_item_id IS NOT NULL THEN
      SELECT jsonb_build_object('kind', 'unit', 'stock_item_id', s.id, 'identifier', s.identifier,
        'unit_number', s.unit_number, 'serial_code', s.serial_code, 'qr_token', s.qr_token, 'status', s.status,
        'equipment_id', e.id, 'equipment_name', e.name) INTO result
      FROM public.stock_items s JOIN public.equipment e ON e.id = s.equipment_id
      WHERE s.id = reg.stock_item_id;
      IF result IS NOT NULL THEN RETURN result; END IF;
    ELSIF reg.equipment_id IS NOT NULL THEN
      SELECT jsonb_build_object('kind', 'product', 'equipment_id', e.id, 'equipment_name', e.name, 'sku', e.sku,
        'serial_code', e.serial_code, 'legacy_barcode', e.legacy_barcode) INTO result
      FROM public.equipment e WHERE e.id = reg.equipment_id;
      IF result IS NOT NULL THEN RETURN result; END IF;
    END IF;
  END IF;

  IF url_token IS NULL THEN
    SELECT jsonb_build_object('kind', 'order', 'order_id', o.id, 'order_number', o.order_number,
      'status', o.status, 'starts_on', o.starts_on, 'ends_on', o.ends_on, 'customer', c.name) INTO result
    FROM public.orders o LEFT JOIN public.customers c ON c.id = o.customer_id
    WHERE upper(o.order_number) = ucode OR o.share_token = code
    LIMIT 1;
    IF result IS NOT NULL THEN RETURN result; END IF;
  END IF;

  SELECT jsonb_build_object('kind', 'unit', 'stock_item_id', s.id, 'identifier', s.identifier,
    'unit_number', s.unit_number, 'serial_code', s.serial_code, 'qr_token', s.qr_token, 'status', s.status,
    'equipment_id', e.id, 'equipment_name', e.name) INTO result
  FROM public.stock_items s JOIN public.equipment e ON e.id = s.equipment_id
  WHERE CASE
    WHEN url_token IS NOT NULL THEN s.qr_token = url_token
    ELSE s.qr_token = code OR upper(s.unit_number) = ucode OR s.barcode = code OR upper(s.identifier) = ucode
  END
  ORDER BY (s.qr_token = COALESCE(url_token, code)) DESC, (upper(s.unit_number) = ucode) DESC
  LIMIT 1;
  IF result IS NOT NULL THEN RETURN result; END IF;

  IF url_token IS NULL THEN
    -- Old product labels (e.g. 4C5F1C4281) resolve through legacy_barcode.
    SELECT jsonb_build_object('kind', 'product', 'equipment_id', e.id, 'equipment_name', e.name, 'sku', e.sku,
      'serial_code', e.serial_code, 'legacy_barcode', e.legacy_barcode) INTO result
    FROM public.equipment e
    WHERE upper(e.legacy_barcode) = ucode OR e.barcode = code OR upper(COALESCE(e.sku, '')) = ucode
    ORDER BY (upper(e.legacy_barcode) = ucode) DESC NULLS LAST
    LIMIT 1;
    IF result IS NOT NULL THEN RETURN result; END IF;
  END IF;

  RETURN jsonb_build_object('kind', 'unknown', 'code', code);
END;
$function$;

CREATE OR REPLACE FUNCTION public.unit_move(_unit_ids uuid[], _action text, _order_id uuid DEFAULT NULL::uuid, _reference text DEFAULT NULL::text, _force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  PERFORM 1 FROM public.stock_items s WHERE s.id = ANY (v_ids) ORDER BY s.id FOR UPDATE;

  FOR v_missing IN
    SELECT x FROM unnest(v_ids) x WHERE NOT EXISTS (SELECT 1 FROM public.stock_items s WHERE s.id = x)
  LOOP
    v_blocking := true;
    v_problems := v_problems || jsonb_build_object(
      'unit_id', v_missing, 'unit_number', NULL, 'serial_code', NULL, 'status', NULL, 'reason', 'not_found');
  END LOOP;

  FOR v_unit IN
    SELECT s.id, s.unit_number, s.serial_code, s.status FROM public.stock_items s WHERE s.id = ANY (v_ids) ORDER BY s.serial_code
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
        'unit_id', v_unit.id, 'unit_number', v_unit.unit_number, 'serial_code', v_unit.serial_code,
        'status', v_unit.status, 'reason', v_reason);
    END IF;
  END LOOP;

  IF v_blocking OR (cardinality(v_forced) > 0 AND NOT COALESCE(_force, false)) THEN
    RETURN jsonb_build_object('ok', false, 'problems', v_problems);
  END IF;

  INSERT INTO public.unit_movements (stock_item_id, action, from_status, to_status, order_id, reference, forced, performed_by)
  SELECT s.id, _action, s.status, v_target, _order_id, v_reference, s.id = ANY (v_forced), auth.uid()
  FROM public.stock_items s WHERE s.id = ANY (v_ids);

  PERFORM set_config('app.unit_move', 'on', true);
  UPDATE public.stock_items s SET status = v_target WHERE s.id = ANY (v_ids) AND s.status <> v_target;
  PERFORM set_config('app.unit_move', '', true);

  IF _order_id IS NOT NULL THEN
    FOR v_unit IN
      SELECT s.id, s.equipment_id FROM public.stock_items s WHERE s.id = ANY (v_ids) ORDER BY s.serial_code
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
           'unit_id', s.id, 'unit_number', s.unit_number, 'serial_code', s.serial_code, 'forced', s.id = ANY (v_forced))
           ORDER BY s.serial_code), '[]'::jsonb)
    INTO v_moved FROM public.stock_items s WHERE s.id = ANY (v_ids);

  RETURN jsonb_build_object('ok', true, 'moved', v_moved);
END;
$function$;
