-- Placeholder so inserts don't need to send serial_code; the BEFORE INSERT triggers always replace it.
ALTER TABLE public.equipment ALTER COLUMN serial_code SET DEFAULT '';
ALTER TABLE public.stock_items ALTER COLUMN serial_code SET DEFAULT '';
