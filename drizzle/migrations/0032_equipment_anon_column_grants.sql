-- Anonymous visitors may read only the storefront columns of equipment.
REVOKE SELECT ON public.equipment FROM anon;
GRANT SELECT (
  id, name, category, description, daily_price, image_url, tag, is_active, sort_order,
  quantity, tracking, sku, page_type, page_slug, item_kind, parent_id, variant_label,
  rate_unit, fixed_price, deposit_type, deposit_value, tax_rate_id, organization_id,
  created_at, updated_at
) ON public.equipment TO anon;
