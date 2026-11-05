-- Placeholder defaults so inserts may omit these columns; the
-- stock_items_before_insert trigger always replaces them server-side.
ALTER TABLE public.stock_items ALTER COLUMN unit_number SET DEFAULT '';
ALTER TABLE public.stock_items ALTER COLUMN qr_token SET DEFAULT '';
