-- Feature 1: per-organization label branding (sub-orgs inherit from their main org unless set).
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS label_email text,
  ADD COLUMN IF NOT EXISTS label_brand_name text,
  ADD COLUMN IF NOT EXISTS label_logo_url text;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_label_email_format
    CHECK (label_email IS NULL OR (char_length(label_email) <= 200 AND label_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$')),
  ADD CONSTRAINT organizations_label_brand_len CHECK (label_brand_name IS NULL OR char_length(label_brand_name) <= 60),
  ADD CONSTRAINT organizations_label_logo_https CHECK (label_logo_url IS NULL OR label_logo_url ~ '^https://');

-- Feature 2: singleton app settings (QR base URL + legacy QR domains).
CREATE TABLE public.app_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  qr_base_url text CHECK (qr_base_url IS NULL OR qr_base_url ~ '^https://[a-z0-9.-]+(:[0-9]+)?$'),
  qr_legacy_domains text[] NOT NULL DEFAULT '{}',
  qr_last_check_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Back office reads app settings" ON public.app_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tester'));
CREATE POLICY "Admins update app settings" ON public.app_settings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
INSERT INTO public.app_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.app_settings_track_qr_base()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.qr_base_url := NULLIF(rtrim(lower(btrim(COALESCE(NEW.qr_base_url, ''))), '/'), '');
  NEW.qr_legacy_domains := ARRAY(SELECT DISTINCT rtrim(lower(btrim(d)), '/') FROM unnest(NEW.qr_legacy_domains) d
                                 WHERE btrim(d) <> '');
  -- The previous base becomes a legacy domain, so already printed labels stay listed and checked.
  IF OLD.qr_base_url IS NOT NULL AND OLD.qr_base_url IS DISTINCT FROM NEW.qr_base_url
     AND NOT (OLD.qr_base_url = ANY (NEW.qr_legacy_domains)) THEN
    NEW.qr_legacy_domains := NEW.qr_legacy_domains || OLD.qr_base_url;
  END IF;
  IF NEW.qr_base_url IS NOT NULL THEN
    NEW.qr_legacy_domains := array_remove(NEW.qr_legacy_domains, NEW.qr_base_url);
  END IF;
  IF cardinality(NEW.qr_legacy_domains) > 20 THEN RAISE EXCEPTION 'too_many_legacy_domains'; END IF;
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.app_settings_track_qr_base() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER app_settings_track_qr_base BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.app_settings_track_qr_base();

-- Feature 3: forward public unit reports to an external address (per product).
ALTER TABLE public.equipment
  ADD COLUMN IF NOT EXISTS external_report_email text,
  ADD COLUMN IF NOT EXISTS forward_reports_to_external boolean NOT NULL DEFAULT false;
ALTER TABLE public.equipment
  ADD CONSTRAINT equipment_external_report_email_format
    CHECK (external_report_email IS NULL OR (char_length(external_report_email) <= 200
           AND external_report_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'));
ALTER TABLE public.unit_reports
  ADD COLUMN IF NOT EXISTS external_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS external_notify_status text;
CREATE INDEX IF NOT EXISTS unit_reports_unit_created_idx ON public.unit_reports (stock_item_id, created_at DESC);
