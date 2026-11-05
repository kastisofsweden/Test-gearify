ALTER TABLE public.equipment ADD CONSTRAINT equipment_category_not_blank CHECK (btrim(category) <> '');
