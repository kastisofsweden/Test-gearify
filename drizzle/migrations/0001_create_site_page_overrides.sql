CREATE TABLE public.site_page_overrides (
  page_key TEXT PRIMARY KEY,
  page_type TEXT NOT NULL,
  slug TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  image TEXT,
  price_from NUMERIC,
  sv JSONB NOT NULL DEFAULT '{}'::jsonb,
  en JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.site_page_overrides TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_page_overrides TO authenticated;
GRANT ALL ON public.site_page_overrides TO service_role;

ALTER TABLE public.site_page_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Page overrides are public" ON public.site_page_overrides
  FOR SELECT USING (true);

CREATE POLICY "Admins manage page overrides" ON public.site_page_overrides
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER site_page_overrides_updated_at
  BEFORE UPDATE ON public.site_page_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
