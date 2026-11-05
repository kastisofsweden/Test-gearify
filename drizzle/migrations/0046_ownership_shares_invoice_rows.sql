-- Co-ownership shares per item, per-share invoice rows, and order paid_at.
-- Items without ownership rows are owned 100% by equipment.organization_id (legacy single owner).
-- Commission stays with the platform: owners get rental_share rows; the commission row has no organization (admin-only).

CREATE TABLE public.equipment_ownership (
  equipment_id uuid NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  share_bps integer NOT NULL CHECK (share_bps BETWEEN 1 AND 10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (equipment_id, organization_id)
);
GRANT SELECT ON public.equipment_ownership TO authenticated;
GRANT ALL ON public.equipment_ownership TO service_role;
ALTER TABLE public.equipment_ownership ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read ownership" ON public.equipment_ownership FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tester')
         OR public.is_member_of_organization(organization_id));

-- Sum must be exactly 10000 bps at commit time.
CREATE OR REPLACE FUNCTION public.equipment_ownership_check_sum()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_eq uuid; v_sum integer;
BEGIN
  v_eq := COALESCE(NEW.equipment_id, OLD.equipment_id);
  SELECT COALESCE(sum(share_bps), 0) INTO v_sum FROM public.equipment_ownership WHERE equipment_id = v_eq;
  IF v_sum <> 0 AND v_sum <> 10000 THEN
    RAISE EXCEPTION 'ownership_sum_invalid:%', v_sum;
  END IF;
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION public.equipment_ownership_check_sum() FROM PUBLIC, anon, authenticated;
CREATE CONSTRAINT TRIGGER equipment_ownership_check_sum
  AFTER INSERT OR UPDATE OR DELETE ON public.equipment_ownership
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.equipment_ownership_check_sum();

-- Admin-only atomic replace. _shares = [{"organization_id": uuid, "share_bps": int}], [] = legacy single owner.
CREATE OR REPLACE FUNCTION public.set_equipment_ownership(_equipment_id uuid, _shares jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF jsonb_typeof(COALESCE(_shares, '[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'invalid_shares'; END IF;
  DELETE FROM public.equipment_ownership WHERE equipment_id = _equipment_id;
  INSERT INTO public.equipment_ownership (equipment_id, organization_id, share_bps)
  SELECT _equipment_id, (s->>'organization_id')::uuid, (s->>'share_bps')::integer
  FROM jsonb_array_elements(COALESCE(_shares, '[]'::jsonb)) s;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 AND (SELECT sum(share_bps) FROM public.equipment_ownership WHERE equipment_id = _equipment_id) <> 10000 THEN
    RAISE EXCEPTION 'ownership_sum_invalid';
  END IF;
  RETURN v_n;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_equipment_ownership(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_equipment_ownership(uuid, jsonb) TO authenticated;

-- Orders: paid_at (admin "Mark paid"; Stripe later). Only admins / service context may change it.
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paid_at timestamptz;
CREATE OR REPLACE FUNCTION public.orders_guard_paid_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.paid_at IS DISTINCT FROM OLD.paid_at
     AND auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden_paid_at';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.orders_guard_paid_at() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER orders_guard_paid_at BEFORE UPDATE OF paid_at ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_guard_paid_at();

-- Invoice rows -------------------------------------------------------------
CREATE TABLE public.org_invoice_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  row_type text NOT NULL CHECK (row_type IN ('rental_share', 'commission')),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_line_id uuid NOT NULL REFERENCES public.order_lines(id) ON DELETE CASCADE,
  equipment_id uuid REFERENCES public.equipment(id) ON DELETE SET NULL,
  share_bps integer NOT NULL DEFAULT 10000,
  base_amount numeric NOT NULL DEFAULT 0,
  commission_amount numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  order_number text,
  customer_name text,
  item_title text,
  starts_on date,
  ends_on date,
  invoiced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX org_invoice_rows_uniq ON public.org_invoice_rows
  (order_line_id, row_type, COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX org_invoice_rows_org_idx ON public.org_invoice_rows (organization_id);
GRANT SELECT ON public.org_invoice_rows TO authenticated;
GRANT ALL ON public.org_invoice_rows TO service_role;
ALTER TABLE public.org_invoice_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read all invoice rows" ON public.org_invoice_rows FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tester'));
CREATE POLICY "Members read own rental shares" ON public.org_invoice_rows FOR SELECT TO authenticated
  USING (row_type = 'rental_share' AND organization_id IS NOT NULL
         AND public.is_member_of_organization(organization_id));

-- Builds rows for one order line (idempotent). Last share (lowest bps, then id) receives leftover öre.
CREATE OR REPLACE FUNCTION public.build_invoice_rows(_order_line_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  l public.order_lines; o public.orders; v_customer text;
  v_shares jsonb; v_n integer; v_i integer := 0; v_alloc numeric := 0; v_part numeric; s jsonb;
BEGIN
  SELECT * INTO l FROM public.order_lines WHERE id = _order_line_id;
  IF l.id IS NULL THEN RETURN; END IF;
  SELECT * INTO o FROM public.orders WHERE id = l.order_id;
  SELECT c.name INTO v_customer FROM public.customers c WHERE c.id = o.customer_id;

  IF l.equipment_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.equipment_ownership WHERE equipment_id = l.equipment_id) THEN
    SELECT jsonb_agg(jsonb_build_object('org', organization_id, 'bps', share_bps) ORDER BY share_bps DESC, organization_id)
      INTO v_shares FROM public.equipment_ownership WHERE equipment_id = l.equipment_id;
  ELSIF l.organization_id IS NOT NULL THEN
    v_shares := jsonb_build_array(jsonb_build_object('org', l.organization_id, 'bps', 10000));
  ELSE
    v_shares := '[]'::jsonb;
  END IF;

  v_n := jsonb_array_length(v_shares);
  FOR s IN SELECT * FROM jsonb_array_elements(v_shares) LOOP
    v_i := v_i + 1;
    IF v_i = v_n THEN v_part := round(l.base_amount, 2) - v_alloc;
    ELSE v_part := round(l.base_amount * (s->>'bps')::integer / 10000.0, 2); END IF;
    v_alloc := v_alloc + v_part;
    INSERT INTO public.org_invoice_rows (row_type, organization_id, order_id, order_line_id, equipment_id,
      share_bps, base_amount, commission_amount, amount, order_number, customer_name, item_title, starts_on, ends_on)
    VALUES ('rental_share', (s->>'org')::uuid, o.id, l.id, l.equipment_id, (s->>'bps')::integer,
      v_part, 0, v_part, o.order_number, v_customer, l.description,
      COALESCE(l.starts_on, o.starts_on), COALESCE(l.ends_on, o.ends_on))
    ON CONFLICT DO NOTHING;
  END LOOP;

  IF COALESCE(l.commission_amount, 0) > 0 THEN
    INSERT INTO public.org_invoice_rows (row_type, organization_id, order_id, order_line_id, equipment_id,
      share_bps, base_amount, commission_amount, amount, order_number, customer_name, item_title, starts_on, ends_on)
    VALUES ('commission', NULL, o.id, l.id, l.equipment_id, 10000, round(l.base_amount, 2), l.commission_amount,
      l.commission_amount, o.order_number, v_customer, l.description,
      COALESCE(l.starts_on, o.starts_on), COALESCE(l.ends_on, o.ends_on))
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.build_invoice_rows(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.order_lines_build_invoice_rows()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.build_invoice_rows(NEW.id);
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION public.order_lines_build_invoice_rows() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER order_lines_build_invoice_rows AFTER INSERT ON public.order_lines
  FOR EACH ROW EXECUTE FUNCTION public.order_lines_build_invoice_rows();

-- Backfill existing lines.
SELECT public.build_invoice_rows(id) FROM public.order_lines;

-- List with computed status (mirrors src/lib/invoiceShares.ts invoiceRowStatus).
CREATE OR REPLACE FUNCTION public.list_org_invoice_rows(_org_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid, row_type text, organization_id uuid, organization_name text, order_id uuid,
  order_number text, order_status text, customer_name text, item_title text,
  starts_on date, ends_on date, share_bps integer, base_amount numeric, commission_amount numeric,
  amount numeric, paid_at timestamptz, ends_at timestamptz, invoiced_at timestamptz, status text
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_staff boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  v_staff := public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tester');
  IF NOT v_staff AND _org_id IS NOT NULL AND NOT public.is_member_of_organization(_org_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT r.id, r.row_type, r.organization_id, org.name, r.order_id,
         r.order_number, o.status, r.customer_name, r.item_title,
         r.starts_on, r.ends_on, r.share_bps, r.base_amount, r.commission_amount, r.amount,
         o.paid_at, x.ends_at, r.invoiced_at,
         CASE WHEN r.invoiced_at IS NOT NULL THEN 'invoiced'
              WHEN o.paid_at IS NOT NULL AND now() >= x.ends_at + interval '24 hours' THEN 'invoiceable'
              ELSE 'pending' END
  FROM public.org_invoice_rows r
  JOIN public.orders o ON o.id = r.order_id
  LEFT JOIN public.organizations org ON org.id = r.organization_id
  CROSS JOIN LATERAL (SELECT (COALESCE(r.ends_on, o.ends_on)::timestamp + interval '1 day')
                              AT TIME ZONE 'Europe/Stockholm' - interval '24 hours' AS ends_at) x
  WHERE o.status NOT IN ('cancelled', 'draft')
    AND (_org_id IS NULL OR r.organization_id = _org_id)
    AND (v_staff OR (r.row_type = 'rental_share' AND public.is_member_of_organization(r.organization_id)))
  ORDER BY r.starts_on DESC NULLS LAST, r.order_number, r.created_at
  LIMIT 5000;
END $$;
REVOKE EXECUTE ON FUNCTION public.list_org_invoice_rows(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_org_invoice_rows(uuid) TO authenticated;

-- Mark invoiceable rows invoiced (or undo). Only rows that are paid and past end+24h can be invoiced.
CREATE OR REPLACE FUNCTION public.set_invoice_rows_invoiced(_ids uuid[], _invoiced boolean DEFAULT true)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_staff boolean; v_n integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  v_staff := public.has_role(auth.uid(), 'admin');
  UPDATE public.org_invoice_rows r
  SET invoiced_at = CASE WHEN _invoiced THEN now() ELSE NULL END
  FROM public.orders o
  WHERE r.id = ANY(_ids) AND o.id = r.order_id
    AND (v_staff OR (r.row_type = 'rental_share' AND public.is_member_of_organization(r.organization_id)))
    AND (NOT _invoiced OR (o.paid_at IS NOT NULL
         AND now() >= (COALESCE(r.ends_on, o.ends_on)::timestamp + interval '1 day') AT TIME ZONE 'Europe/Stockholm'));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_invoice_rows_invoiced(uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_invoice_rows_invoiced(uuid[], boolean) TO authenticated;
