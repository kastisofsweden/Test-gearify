-- After the S/N repair every unit has its own organization number; enforce it from now on.
CREATE UNIQUE INDEX stock_items_sn_series_org_key ON public.stock_items (sn_series_id, sn_org_no);
CREATE UNIQUE INDEX stock_items_sn_item_key ON public.stock_items (equipment_id, sn_item_no);
