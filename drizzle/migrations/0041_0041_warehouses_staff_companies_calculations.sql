-- ===== Companies =====
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies TO authenticated;
GRANT ALL ON public.companies TO service_role;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
INSERT INTO public.companies (id, name) VALUES ('00000000-0000-4000-a000-0000000000c1', 'Dream Crazy Big');

-- ===== Warehouses =====
CREATE TABLE public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text NOT NULL,
  lat numeric NULL,
  lng numeric NULL,
  loading_time_hours numeric NOT NULL DEFAULT 1 CHECK (loading_time_hours >= 0),
  rig_up_time_hours numeric NOT NULL DEFAULT 1 CHECK (rig_up_time_hours >= 0),
  truck_cost_per_10km_sek numeric NOT NULL DEFAULT 25 CHECK (truck_cost_per_10km_sek >= 0),
  staff_per_delivery integer NOT NULL DEFAULT 1 CHECK (staff_per_delivery >= 1),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.warehouses TO authenticated;
GRANT ALL ON public.warehouses TO service_role;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
INSERT INTO public.warehouses (id, name, address) VALUES
  ('00000000-0000-4000-a000-000000000001', 'Örebro', 'Östra vagnvägen 4, Örebro');

ALTER TABLE public.equipment ADD COLUMN warehouse_id uuid REFERENCES public.warehouses(id);
UPDATE public.equipment SET warehouse_id = '00000000-0000-4000-a000-000000000001' WHERE warehouse_id IS NULL;
ALTER TABLE public.equipment ALTER COLUMN warehouse_id SET DEFAULT '00000000-0000-4000-a000-000000000001';
ALTER TABLE public.equipment ALTER COLUMN warehouse_id SET NOT NULL;
CREATE INDEX equipment_warehouse_id_idx ON public.equipment (warehouse_id);

-- ===== Staff =====
CREATE TABLE public.staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) DEFAULT '00000000-0000-4000-a000-0000000000c1',
  hourly_rate_sek numeric NOT NULL DEFAULT 600 CHECK (hourly_rate_sek >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX staff_company_id_idx ON public.staff (company_id);
CREATE INDEX staff_user_id_idx ON public.staff (user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff TO authenticated;
GRANT ALL ON public.staff TO service_role;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
INSERT INTO public.staff (id, name, email, user_id, company_id, hourly_rate_sek) VALUES
  ('00000000-0000-4000-a000-0000000000a1', 'Marcus Bornold', 'marcusbornold@gmail.com',
   '927b2f80-3405-4177-b5e3-6370c18ce2a5', '00000000-0000-4000-a000-0000000000c1', 600),
  ('00000000-0000-4000-a000-0000000000a2', 'Samuel Kastberg', 'samuel@dreambig.se',
   'd4de9137-497a-4fb0-a950-c6fc4f2ff320', '00000000-0000-4000-a000-0000000000c1', 600);

-- ===== user_companies =====
CREATE TABLE public.user_companies (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, company_id)
);
GRANT SELECT ON public.user_companies TO authenticated;
GRANT ALL ON public.user_companies TO service_role;
ALTER TABLE public.user_companies ENABLE ROW LEVEL SECURITY;
INSERT INTO public.user_companies (user_id, company_id) VALUES
  ('d4de9137-497a-4fb0-a950-c6fc4f2ff320', '00000000-0000-4000-a000-0000000000c1');

-- ===== RLS helpers =====
CREATE OR REPLACE FUNCTION public.is_partner_of(_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'partner') AND EXISTS (
    SELECT 1 FROM public.user_companies uc WHERE uc.user_id = auth.uid() AND uc.company_id = _company_id)
$$;
CREATE OR REPLACE FUNCTION public.my_company_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(company_id), '{}') FROM public.user_companies WHERE user_id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.is_partner_of(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_company_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_partner_of(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_company_ids() TO authenticated;

-- Policies: companies / warehouses / staff / user_companies
CREATE POLICY "Admins manage companies" ON public.companies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Testers read companies" ON public.companies FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'tester'));
CREATE POLICY "Partners read own company" ON public.companies FOR SELECT TO authenticated
  USING (public.is_partner_of(id));

CREATE POLICY "Admins manage warehouses" ON public.warehouses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Staff read warehouses" ON public.warehouses FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'tester') OR public.has_role(auth.uid(), 'partner'));

CREATE POLICY "Admins manage staff" ON public.staff FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Testers read staff" ON public.staff FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'tester'));
CREATE POLICY "Partners read own company staff" ON public.staff FOR SELECT TO authenticated
  USING (public.is_partner_of(company_id));

CREATE POLICY "Users read own company links" ON public.user_companies FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ===== Allowlist: partner company =====
ALTER TABLE public.admin_email_allowlist ADD COLUMN company_id uuid NULL REFERENCES public.companies(id);
ALTER TABLE public.admin_email_allowlist ADD CONSTRAINT admin_email_allowlist_partner_company
  CHECK (role <> 'partner' OR company_id IS NOT NULL);
GRANT UPDATE (role, company_id) ON public.admin_email_allowlist TO authenticated;

CREATE OR REPLACE FUNCTION public.grant_allowlisted_admin(_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_found boolean;
BEGIN
  -- Only accounts that were invited or went through the confirmation email flow.
  INSERT INTO public.user_roles (user_id, role)
  SELECT u.id, a.role
  FROM auth.users u
  JOIN public.admin_email_allowlist a ON a.email = lower(u.email)
  WHERE u.id = _user_id
    AND u.email_confirmed_at IS NOT NULL
    AND (u.confirmation_sent_at IS NOT NULL OR u.invited_at IS NOT NULL)
  ON CONFLICT DO NOTHING;
  v_found := FOUND;
  INSERT INTO public.user_companies (user_id, company_id)
  SELECT u.id, a.company_id
  FROM auth.users u
  JOIN public.admin_email_allowlist a ON a.email = lower(u.email)
  WHERE u.id = _user_id AND a.role = 'partner' AND a.company_id IS NOT NULL
    AND u.email_confirmed_at IS NOT NULL
    AND (u.confirmation_sent_at IS NOT NULL OR u.invited_at IS NOT NULL)
  ON CONFLICT DO NOTHING;
  RETURN v_found;
END $$;
REVOKE EXECUTE ON FUNCTION public.grant_allowlisted_admin(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_allowlisted_admin(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_email_allowlist_after_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.user_roles r
  USING auth.users u
  WHERE r.user_id = u.id AND lower(u.email) = OLD.email AND r.role = OLD.role;
  IF OLD.role = 'partner' AND OLD.company_id IS NOT NULL THEN
    DELETE FROM public.user_companies uc
    USING auth.users u
    WHERE uc.user_id = u.id AND lower(u.email) = OLD.email AND uc.company_id = OLD.company_id;
  END IF;
  RETURN OLD;
END $$;

CREATE OR REPLACE FUNCTION public.admin_email_allowlist_after_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    DELETE FROM public.user_roles r
    USING auth.users u
    WHERE r.user_id = u.id AND lower(u.email) = OLD.email AND r.role = OLD.role;
    IF OLD.role = 'partner' AND OLD.company_id IS NOT NULL THEN
      DELETE FROM public.user_companies uc
      USING auth.users u
      WHERE uc.user_id = u.id AND lower(u.email) = OLD.email AND uc.company_id = OLD.company_id;
    END IF;
    -- Same rule as grant_allowlisted_admin: invited or confirmed via the email flow.
    INSERT INTO public.user_roles (user_id, role)
    SELECT u.id, NEW.role FROM auth.users u
    WHERE lower(u.email) = NEW.email
      AND u.email_confirmed_at IS NOT NULL
      AND (u.confirmation_sent_at IS NOT NULL OR u.invited_at IS NOT NULL)
    ON CONFLICT DO NOTHING;
    IF NEW.role = 'partner' AND NEW.company_id IS NOT NULL THEN
      INSERT INTO public.user_companies (user_id, company_id)
      SELECT u.id, NEW.company_id FROM auth.users u
      WHERE lower(u.email) = NEW.email
        AND u.email_confirmed_at IS NOT NULL
        AND (u.confirmation_sent_at IS NOT NULL OR u.invited_at IS NOT NULL)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.admin_email_allowlist_after_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_email_allowlist_after_update() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS admin_email_allowlist_after_update ON public.admin_email_allowlist;
CREATE TRIGGER admin_email_allowlist_after_update
  AFTER UPDATE OF role, company_id ON public.admin_email_allowlist
  FOR EACH ROW EXECUTE FUNCTION public.admin_email_allowlist_after_update();

-- ===== Orders: company, responsible staff, transport =====
ALTER TABLE public.orders
  ADD COLUMN company_id uuid REFERENCES public.companies(id) DEFAULT '00000000-0000-4000-a000-0000000000c1',
  ADD COLUMN responsible_staff_id uuid NULL REFERENCES public.staff(id) DEFAULT '00000000-0000-4000-a000-0000000000a1',
  ADD COLUMN transport_amount numeric NULL,
  ADD COLUMN transport_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN transport_breakdown jsonb NULL,
  ADD COLUMN transport_distance_m numeric NULL,
  ADD COLUMN transport_duration_s numeric NULL;
UPDATE public.orders SET company_id = '00000000-0000-4000-a000-0000000000c1' WHERE company_id IS NULL;
UPDATE public.orders SET transport_status = 'waived', transport_amount = 0 WHERE shipping_method = 'pickup';
ALTER TABLE public.orders ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.orders ADD CONSTRAINT orders_transport_status_check
  CHECK (transport_status IN ('pending', 'quoted', 'waived'));
CREATE INDEX orders_company_id_idx ON public.orders (company_id);
CREATE INDEX orders_responsible_staff_id_idx ON public.orders (responsible_staff_id);

CREATE POLICY "Partners read company orders" ON public.orders FOR SELECT TO authenticated
  USING (public.is_partner_of(company_id));
CREATE POLICY "Partners update company orders" ON public.orders FOR UPDATE TO authenticated
  USING (public.is_partner_of(company_id)) WITH CHECK (public.is_partner_of(company_id));
CREATE POLICY "Partners read company order lines" ON public.order_lines FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND public.is_partner_of(o.company_id)));
CREATE POLICY "Partners update company order lines" ON public.order_lines FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND public.is_partner_of(o.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND public.is_partner_of(o.company_id)));

-- ===== Transport cache + rate log (service role only) =====
CREATE TABLE public.transport_cache (
  cache_key text PRIMARY KEY,
  response jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.transport_cache TO service_role;
ALTER TABLE public.transport_cache ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.transport_quote_log (
  id bigserial PRIMARY KEY,
  client_fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX transport_quote_log_fp_idx ON public.transport_quote_log (client_fingerprint, created_at);
GRANT ALL ON public.transport_quote_log TO service_role;
GRANT USAGE ON SEQUENCE public.transport_quote_log_id_seq TO service_role;
ALTER TABLE public.transport_quote_log ENABLE ROW LEVEL SECURITY;

-- ===== Calculations =====
CREATE TABLE public.calculations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calculation_number text NOT NULL UNIQUE DEFAULT ('K-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4))),
  title text,
  customer_id uuid NULL REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text,
  customer_email text,
  starts_on date NOT NULL DEFAULT CURRENT_DATE,
  ends_on date NOT NULL DEFAULT CURRENT_DATE,
  delivery_address text,
  shipping_method text NOT NULL DEFAULT 'delivery' CHECK (shipping_method IN ('pickup', 'delivery')),
  company_id uuid NOT NULL REFERENCES public.companies(id) DEFAULT '00000000-0000-4000-a000-0000000000c1',
  responsible_staff_id uuid NOT NULL REFERENCES public.staff(id) DEFAULT '00000000-0000-4000-a000-0000000000a1',
  warehouse_id uuid NULL REFERENCES public.warehouses(id),
  transport_amount numeric NULL,
  transport_status text NOT NULL DEFAULT 'pending' CHECK (transport_status IN ('pending', 'quoted', 'waived')),
  transport_breakdown jsonb NULL,
  transport_distance_m numeric NULL,
  transport_duration_s numeric NULL,
  discount_percent numeric NOT NULL DEFAULT 0,
  vat_percent numeric NOT NULL DEFAULT 25,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'converted', 'archived')),
  converted_order_id uuid NULL REFERENCES public.orders(id) ON DELETE SET NULL,
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on)
);
CREATE INDEX calculations_company_id_idx ON public.calculations (company_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calculations TO authenticated;
GRANT ALL ON public.calculations TO service_role;
ALTER TABLE public.calculations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.calculation_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calculation_id uuid NOT NULL REFERENCES public.calculations(id) ON DELETE CASCADE,
  equipment_id uuid NULL REFERENCES public.equipment(id) ON DELETE SET NULL,
  name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  days integer NOT NULL DEFAULT 1 CHECK (days > 0),
  unit_price numeric NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX calculation_lines_calc_idx ON public.calculation_lines (calculation_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calculation_lines TO authenticated;
GRANT ALL ON public.calculation_lines TO service_role;
ALTER TABLE public.calculation_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage calculations" ON public.calculations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Testers read calculations" ON public.calculations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'tester'));
CREATE POLICY "Testers write own calculations" ON public.calculations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'tester') AND created_by = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'tester') AND created_by = auth.uid());
CREATE POLICY "Partners manage company calculations" ON public.calculations FOR ALL TO authenticated
  USING (public.is_partner_of(company_id)) WITH CHECK (public.is_partner_of(company_id));

CREATE POLICY "Admins manage calculation lines" ON public.calculation_lines FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Testers read calculation lines" ON public.calculation_lines FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'tester'));
CREATE POLICY "Testers write own calculation lines" ON public.calculation_lines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.calculations c WHERE c.id = calculation_id
                 AND public.has_role(auth.uid(), 'tester') AND c.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.calculations c WHERE c.id = calculation_id
                 AND public.has_role(auth.uid(), 'tester') AND c.created_by = auth.uid()));
CREATE POLICY "Partners manage company calculation lines" ON public.calculation_lines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.calculations c WHERE c.id = calculation_id AND public.is_partner_of(c.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.calculations c WHERE c.id = calculation_id AND public.is_partner_of(c.company_id)));

CREATE TRIGGER warehouses_updated_at BEFORE UPDATE ON public.warehouses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER staff_updated_at BEFORE UPDATE ON public.staff FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER calculations_updated_at BEFORE UPDATE ON public.calculations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== confirm_order: partners may confirm their company's orders =====
CREATE OR REPLACE FUNCTION public.confirm_order(_order_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_order public.orders;
  v_line RECORD;
  v_free INTEGER;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF v_order.id IS NULL THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF NOT (public.has_role(auth.uid(), 'admin')
          OR (public.has_role(auth.uid(), 'tester') AND v_order.created_by = auth.uid())
          OR public.is_partner_of(v_order.company_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF v_order.status NOT IN ('pending', 'draft') THEN
    RAISE EXCEPTION 'order_not_pending:%', v_order.status;
  END IF;

  PERFORM 1 FROM public.equipment e
  WHERE e.id IN (
    SELECT l.equipment_id FROM public.order_lines l WHERE l.order_id = _order_id AND l.equipment_id IS NOT NULL
    UNION
    SELECT pc.child_equipment_id FROM public.order_lines l
    JOIN public.product_components pc ON pc.parent_equipment_id = l.equipment_id
    WHERE l.order_id = _order_id
  )
  ORDER BY e.id
  FOR UPDATE;

  PERFORM set_config('app.order_confirm', 'on', true);
  UPDATE public.orders SET status = 'reserved' WHERE id = _order_id RETURNING * INTO v_order;
  PERFORM set_config('app.order_confirm', 'off', true);

  FOR v_line IN
    SELECT DISTINCT e.id, e.name, l.starts_at, l.ends_at
    FROM public.order_lines l
    JOIN public.equipment e ON e.id = l.equipment_id
    WHERE l.order_id = _order_id AND e.item_kind <> 'service'
    UNION
    SELECT DISTINCT e.id, e.name, l.starts_at, l.ends_at
    FROM public.order_lines l
    JOIN public.product_components pc ON pc.parent_equipment_id = l.equipment_id
    JOIN public.equipment e ON e.id = pc.child_equipment_id
    WHERE l.order_id = _order_id AND e.item_kind <> 'service'
  LOOP
    v_free := public.equipment_total_units(v_line.id)
      - public.equipment_reserved_at(v_line.id, v_line.starts_at, v_line.ends_at, NULL);
    IF v_free < 0 THEN
      RAISE EXCEPTION 'unavailable:%:%', v_line.name,
        GREATEST(public.equipment_total_units(v_line.id)
          - public.equipment_reserved_at(v_line.id, v_line.starts_at, v_line.ends_at, _order_id), 0);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('id', v_order.id, 'order_number', v_order.order_number, 'status', v_order.status);
END $function$;
REVOKE ALL ON FUNCTION public.confirm_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_order(uuid) TO authenticated;

-- ===== Calculation -> order (all-or-nothing) =====
CREATE OR REPLACE FUNCTION public.convert_calculation_to_order(_calculation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_calc public.calculations;
  v_order public.orders;
  v_result jsonb;
BEGIN
  SELECT * INTO v_calc FROM public.calculations WHERE id = _calculation_id FOR UPDATE;
  IF v_calc.id IS NULL THEN RAISE EXCEPTION 'calculation_not_found'; END IF;
  IF NOT (public.has_role(auth.uid(), 'admin')
          OR (public.has_role(auth.uid(), 'tester') AND v_calc.created_by = auth.uid())
          OR public.is_partner_of(v_calc.company_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF v_calc.status IN ('converted', 'archived') THEN
    RAISE EXCEPTION 'calculation_not_open:%', v_calc.status;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.calculation_lines WHERE calculation_id = _calculation_id) THEN
    RAISE EXCEPTION 'empty_calculation';
  END IF;

  INSERT INTO public.orders (
    customer_id, status, starts_on, ends_on, shipping_method, delivery_address,
    discount_percent, vat_percent, source, company_id, responsible_staff_id,
    transport_amount, transport_status, transport_breakdown, transport_distance_m, transport_duration_s,
    internal_notes, created_by
  ) VALUES (
    v_calc.customer_id, 'draft', v_calc.starts_on, v_calc.ends_on, v_calc.shipping_method, v_calc.delivery_address,
    v_calc.discount_percent, v_calc.vat_percent, 'calculation', v_calc.company_id, v_calc.responsible_staff_id,
    v_calc.transport_amount, v_calc.transport_status, v_calc.transport_breakdown,
    v_calc.transport_distance_m, v_calc.transport_duration_s,
    'From calculation ' || v_calc.calculation_number, auth.uid()
  ) RETURNING * INTO v_order;

  INSERT INTO public.order_lines (order_id, equipment_id, description, quantity, days, unit_price,
                                  starts_on, ends_on, sort_order, created_by)
  SELECT v_order.id, l.equipment_id, l.name, l.quantity, l.days, l.unit_price,
         v_calc.starts_on, v_calc.ends_on, l.sort_order, auth.uid()
  FROM public.calculation_lines l WHERE l.calculation_id = _calculation_id;

  -- Raises (and rolls back the whole conversion) if stock is gone.
  v_result := public.confirm_order(v_order.id);

  UPDATE public.calculations SET status = 'converted', converted_order_id = v_order.id
  WHERE id = _calculation_id;

  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.convert_calculation_to_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_calculation_to_order(uuid) TO authenticated;

-- ===== My jobs =====
CREATE OR REPLACE FUNCTION public.my_jobs(_all boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(j ORDER BY (j->>'starts_on')), '[]'::jsonb) FROM (
    SELECT jsonb_build_object(
      'id', o.id, 'order_number', o.order_number, 'status', o.status,
      'starts_on', o.starts_on, 'ends_on', o.ends_on,
      'shipping_method', o.shipping_method, 'delivery_address', o.delivery_address,
      'delivery_city', o.delivery_city,
      'customer_name', c.name, 'customer_company', c.company,
      'company_name', co.name, 'responsible_staff', s.name,
      'transport_amount', o.transport_amount, 'transport_status', o.transport_status,
      'transport_breakdown', o.transport_breakdown,
      'lines', COALESCE((SELECT jsonb_agg(jsonb_build_object('description', l.description, 'quantity', l.quantity) ORDER BY l.sort_order)
                         FROM public.order_lines l WHERE l.order_id = o.id), '[]'::jsonb)
    ) AS j
    FROM public.orders o
    LEFT JOIN public.customers c ON c.id = o.customer_id
    LEFT JOIN public.companies co ON co.id = o.company_id
    LEFT JOIN public.staff s ON s.id = o.responsible_staff_id
    WHERE o.status NOT IN ('cancelled', 'completed')
      AND (
        (_all AND public.has_role(auth.uid(), 'admin'))
        OR s.user_id = auth.uid() AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tester'))
        OR public.is_partner_of(o.company_id)
      )
  ) t
$$;
REVOKE ALL ON FUNCTION public.my_jobs(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_jobs(boolean) TO authenticated;
