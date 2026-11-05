-- Calculation -> order also creates the customer from the calculation's name/email when none is linked.
CREATE OR REPLACE FUNCTION public.convert_calculation_to_order(_calculation_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_calc public.calculations;
  v_order public.orders;
  v_customer uuid;
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

  v_customer := v_calc.customer_id;
  IF v_customer IS NULL AND length(trim(COALESCE(v_calc.customer_name, ''))) > 0 THEN
    INSERT INTO public.customers (name, email, created_by)
    VALUES (left(trim(v_calc.customer_name), 200),
            NULLIF(lower(trim(COALESCE(v_calc.customer_email, ''))), ''), auth.uid())
    RETURNING id INTO v_customer;
  END IF;

  INSERT INTO public.orders (
    customer_id, status, starts_on, ends_on, shipping_method, delivery_address,
    discount_percent, vat_percent, source, company_id, responsible_staff_id,
    transport_amount, transport_status, transport_breakdown, transport_distance_m, transport_duration_s,
    internal_notes, created_by
  ) VALUES (
    v_customer, 'draft', v_calc.starts_on, v_calc.ends_on, v_calc.shipping_method, v_calc.delivery_address,
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

  -- Raises (rolling back the whole conversion, customer included) if stock is gone.
  v_result := public.confirm_order(v_order.id);

  UPDATE public.calculations
  SET status = 'converted', converted_order_id = v_order.id, customer_id = v_customer
  WHERE id = _calculation_id;

  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.convert_calculation_to_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_calculation_to_order(uuid) TO authenticated;
