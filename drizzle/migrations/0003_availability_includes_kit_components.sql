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
