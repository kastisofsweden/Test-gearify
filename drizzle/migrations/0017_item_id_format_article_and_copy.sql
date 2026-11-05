-- Item-ID format: <main org initials><3-digit article no.><2-letter article code><3-digit copy no.>, e.g. DCB001CE001.
CREATE OR REPLACE FUNCTION public.letters_only(_s text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT regexp_replace(upper(translate(COALESCE(_s, ''), 'åäöÅÄÖéÉèÈüÜ', 'aaoAAOeEeEuU')), '[^A-Z]', '', 'g')
$$;

-- "Cable" -> "CE": first + last letter of the product name.
CREATE OR REPLACE FUNCTION public.derive_item_code(_name text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN length(l) >= 2 THEN left(l, 1) || right(l, 1) WHEN length(l) = 1 THEN l || l ELSE 'XX' END
  FROM (SELECT public.letters_only(_name) AS l) t
$$;

-- "Dream Crazy Big" -> "DCB": first letter of every word.
CREATE OR REPLACE FUNCTION public.derive_org_prefix(_name text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT NULLIF(left(string_agg(left(public.letters_only(w), 1), '' ORDER BY ord), 6), '')
  FROM regexp_split_to_table(COALESCE(_name, ''), '\s+') WITH ORDINALITY AS t(w, ord)
  WHERE public.letters_only(w) <> ''
$$;

CREATE OR REPLACE FUNCTION public.organizations_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.item_prefix := NULLIF(upper(btrim(COALESCE(NEW.item_prefix, ''))), '');
  IF NEW.parent_id IS NULL AND NEW.item_prefix IS NULL THEN
    NEW.item_prefix := public.derive_org_prefix(NEW.name);
    IF length(COALESCE(NEW.item_prefix, '')) < 2 THEN NEW.item_prefix := NULL; END IF;
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

-- organizations.next_item_number now counts articles (products) per main organization.
ALTER TABLE public.organizations ALTER COLUMN next_item_number SET DEFAULT 1;
UPDATE public.organizations SET next_item_number = 1 WHERE NOT item_prefix_locked;
COMMENT ON COLUMN public.organizations.next_item_number IS 'Next article number (the 001 in DCB001CE001) for this main organization; never reused.';

ALTER TABLE public.equipment
  ADD COLUMN item_code text,
  ADD COLUMN item_seq integer,
  ADD COLUMN item_root_org_id uuid REFERENCES public.organizations(id),
  ADD COLUMN next_unit_number integer NOT NULL DEFAULT 1;
UPDATE public.equipment SET item_code = public.derive_item_code(name) WHERE item_code IS NULL;
ALTER TABLE public.equipment
  ADD CONSTRAINT equipment_item_code_format CHECK (item_code IS NULL OR item_code ~ '^[A-Z]{2}$'),
  ADD CONSTRAINT equipment_next_unit_number_positive CHECK (next_unit_number >= 1);
CREATE UNIQUE INDEX equipment_item_seq_key ON public.equipment (item_root_org_id, item_seq) WHERE item_seq IS NOT NULL;
COMMENT ON COLUMN public.equipment.item_code IS 'Two-letter article code in unit Item-IDs (the CE in DCB001CE001); locked once units exist.';
COMMENT ON COLUMN public.equipment.item_seq IS 'Article number within the main organization, assigned when the first physical unit is registered.';

CREATE OR REPLACE FUNCTION public.equipment_lock_item_id_parts()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_root uuid;
BEGIN
  IF OLD.item_seq IS NOT NULL THEN
    IF NEW.item_seq IS DISTINCT FROM OLD.item_seq OR NEW.item_root_org_id IS DISTINCT FROM OLD.item_root_org_id THEN
      RAISE EXCEPTION 'item_number_locked';
    END IF;
    IF NEW.item_code IS DISTINCT FROM OLD.item_code THEN
      RAISE EXCEPTION 'item_code_locked';
    END IF;
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      SELECT COALESCE(o.parent_id, o.id) INTO v_root FROM public.organizations o WHERE o.id = NEW.organization_id;
      IF v_root IS DISTINCT FROM OLD.item_root_org_id THEN
        RAISE EXCEPTION 'product_organization_locked';
      END IF;
    END IF;
  END IF;
  IF NEW.next_unit_number < OLD.next_unit_number THEN
    RAISE EXCEPTION 'item_number_cannot_decrease';
  END IF;
  NEW.item_code := NULLIF(upper(btrim(COALESCE(NEW.item_code, ''))), '');
  RETURN NEW;
END $$;
CREATE TRIGGER equipment_lock_item_id_parts BEFORE UPDATE ON public.equipment
  FOR EACH ROW EXECUTE FUNCTION public.equipment_lock_item_id_parts();

-- Atomically allocates DCB001CE001-style IDs. Article number on first unit, then copy numbers per product.
CREATE OR REPLACE FUNCTION public.allocate_item_id(_equipment_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e public.equipment;
  v_root uuid;
  v_prefix text;
  v_seq integer;
  v_copy integer;
  v_id text;
BEGIN
  SELECT * INTO e FROM public.equipment WHERE id = _equipment_id FOR UPDATE;
  IF e.id IS NULL THEN RAISE EXCEPTION 'unknown_item'; END IF;
  IF e.organization_id IS NULL THEN RAISE EXCEPTION 'product_has_no_organization'; END IF;

  IF e.item_seq IS NULL THEN
    SELECT COALESCE(o.parent_id, o.id) INTO v_root FROM public.organizations o WHERE o.id = e.organization_id;
    UPDATE public.organizations o
       SET next_item_number = o.next_item_number + 1, item_prefix_locked = true
     WHERE o.id = v_root AND o.item_prefix IS NOT NULL
     RETURNING o.next_item_number - 1 INTO v_seq;
    IF v_seq IS NULL THEN RAISE EXCEPTION 'organization_prefix_missing'; END IF;
    UPDATE public.equipment
       SET item_seq = v_seq, item_root_org_id = v_root,
           item_code = COALESCE(item_code, public.derive_item_code(name))
     WHERE id = e.id
     RETURNING * INTO e;
  END IF;

  SELECT o.item_prefix INTO v_prefix FROM public.organizations o WHERE o.id = e.item_root_org_id;
  LOOP
    UPDATE public.equipment SET next_unit_number = next_unit_number + 1
     WHERE id = e.id RETURNING next_unit_number - 1 INTO v_copy;
    v_id := v_prefix || lpad(e.item_seq::text, 3, '0') || e.item_code || lpad(v_copy::text, 3, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.stock_items s WHERE upper(s.unit_number) = v_id);
  END LOOP;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.allocate_item_id(uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN public.stock_items.unit_number IS 'Readable Item-ID (S/N), e.g. DCB001CE001: main-org prefix + article number + article code + copy number; never reused. Separate from manufacturer serial_number.';
