-- Keep user_roles in sync when allowlist rows are removed or their role changes.
CREATE OR REPLACE FUNCTION public.admin_email_allowlist_after_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  DELETE FROM public.user_roles r
  USING auth.users u
  WHERE r.user_id = u.id AND lower(u.email) = OLD.email AND r.role = OLD.role;
  RETURN OLD;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_email_allowlist_after_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role OR NEW.email IS DISTINCT FROM OLD.email THEN
    DELETE FROM public.user_roles r
    USING auth.users u
    WHERE r.user_id = u.id AND lower(u.email) = OLD.email AND r.role = OLD.role;
    -- Same rule as grant_allowlisted_admin: invited or confirmed via the email flow.
    INSERT INTO public.user_roles (user_id, role)
    SELECT u.id, NEW.role FROM auth.users u
    WHERE lower(u.email) = NEW.email
      AND u.email_confirmed_at IS NOT NULL
      AND (u.confirmation_sent_at IS NOT NULL OR u.invited_at IS NOT NULL)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_email_allowlist_after_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_email_allowlist_after_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS admin_email_allowlist_after_delete ON public.admin_email_allowlist;
CREATE TRIGGER admin_email_allowlist_after_delete
  AFTER DELETE ON public.admin_email_allowlist
  FOR EACH ROW EXECUTE FUNCTION public.admin_email_allowlist_after_delete();

DROP TRIGGER IF EXISTS admin_email_allowlist_after_update ON public.admin_email_allowlist;
CREATE TRIGGER admin_email_allowlist_after_update
  AFTER UPDATE OF role ON public.admin_email_allowlist
  FOR EACH ROW EXECUTE FUNCTION public.admin_email_allowlist_after_update();

GRANT UPDATE (role) ON public.admin_email_allowlist TO authenticated;
DROP POLICY IF EXISTS "Admins change allowlist role" ON public.admin_email_allowlist;
CREATE POLICY "Admins change allowlist role" ON public.admin_email_allowlist
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
