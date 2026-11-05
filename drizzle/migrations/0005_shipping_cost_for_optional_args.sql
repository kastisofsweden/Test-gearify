CREATE OR REPLACE FUNCTION public.shipping_cost_for(
  _method TEXT,
  _zone_id UUID DEFAULT NULL,
  _postal TEXT DEFAULT NULL,
  _city TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_zone public.shipping_zones;
BEGIN
  v_zone := public.resolve_shipping(_method, _zone_id, _postal, _city);
  IF v_zone.id IS NULL THEN
    RETURN jsonb_build_object('zone_id', NULL, 'zone_name', NULL, 'cost', 0);
  END IF;
  RETURN jsonb_build_object(
    'zone_id', v_zone.id,
    'zone_name', v_zone.name,
    'cost', ROUND(v_zone.base_fee + v_zone.per_km * v_zone.distance_km)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.shipping_cost_for(TEXT, UUID, TEXT, TEXT) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.available_quantity(
  _equipment_id UUID, _start DATE, _end DATE, _exclude_order UUID DEFAULT NULL
) RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT LEAST(
    GREATEST(
      public.equipment_total_units(_equipment_id)
        - public.equipment_reserved(_equipment_id, _start, _end, _exclude_order),
      0
    ),
    COALESCE((
      SELECT MIN(
        FLOOR(
          GREATEST(
            public.equipment_total_units(pc.child_equipment_id)
              - public.equipment_reserved(pc.child_equipment_id, _start, _end, _exclude_order),
            0
          )::numeric / GREATEST(pc.quantity, 1)
        )
      )::int
      FROM public.product_components pc
      WHERE pc.parent_equipment_id = _equipment_id
    ), 2147483647)
  );
$$;
GRANT EXECUTE ON FUNCTION public.available_quantity(UUID, DATE, DATE, UUID) TO anon, authenticated, service_role;
