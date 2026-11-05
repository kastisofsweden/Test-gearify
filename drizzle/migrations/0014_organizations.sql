CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  org_number text,
  email text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read organizations" ON public.organizations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'tester'));
CREATE POLICY "Admins insert organizations" ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins update organizations" ON public.organizations FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins delete organizations" ON public.organizations FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER organizations_updated_at BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.organizations (name, created_by) VALUES ('Dream Crazy Big', NULL);

ALTER TABLE public.equipment ADD COLUMN organization_id uuid REFERENCES public.organizations(id);
UPDATE public.equipment SET organization_id = (SELECT id FROM public.organizations WHERE name='Dream Crazy Big');
CREATE INDEX equipment_organization_id_idx ON public.equipment(organization_id);

CREATE OR REPLACE FUNCTION public.equipment_require_organization()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.parent_id IS NOT NULL THEN
    SELECT organization_id INTO NEW.organization_id FROM public.equipment WHERE id = NEW.parent_id;
  END IF;
  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'Parent organization is required';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER equipment_require_organization BEFORE INSERT OR UPDATE ON public.equipment
  FOR EACH ROW EXECUTE FUNCTION public.equipment_require_organization();
