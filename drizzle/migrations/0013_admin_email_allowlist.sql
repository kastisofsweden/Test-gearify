-- Admin email allowlist -------------------------------------------------
CREATE TABLE public.admin_email_allowlist (
  email text PRIMARY KEY CHECK (email = lower(btrim(email)) AND position('@' IN email) > 1),
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.admin_email_allowlist TO authenticated;
GRANT ALL ON public.admin_email_allowlist TO service_role;
REVOKE ALL ON public.admin_email_allowlist FROM anon;
REVOKE UPDATE, TRUNCATE, REFERENCES, TRIGGER ON public.admin_email_allowlist FROM authenticated;

ALTER TABLE public.admin_email_allowlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read allowlist" ON public.admin_email_allowlist
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins add to allowlist" ON public.admin_email_allowlist
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins remove from allowlist" ON public.admin_email_allowlist
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Normalise email before the CHECK runs
CREATE OR REPLACE FUNCTION public.admin_email_allowlist_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.email := lower(btrim(NEW.email));
  RETURN NEW;
END;
$$;

CREATE TRIGGER admin_email_allowlist_normalize
BEFORE INSERT ON public.admin_email_allowlist
FOR EACH ROW EXECUTE FUNCTION public.admin_email_allowlist_normalize();

-- Grant admin only to a confirmed, allowlisted email -----------------------
CREATE OR REPLACE FUNCTION public.grant_allowlisted_admin(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  SELECT u.id, 'admin'::public.app_role
  FROM auth.users u
  JOIN public.admin_email_allowlist a ON a.email = lower(u.email)
  WHERE u.id = _user_id
    AND u.email_confirmed_at IS NOT NULL
  ON CONFLICT DO NOTHING;
  RETURN FOUND;
END;
$$;

-- Signup: profile, tester role for the bot account, admin only via allowlist.
-- The old "first user becomes admin" bootstrap is removed.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;

  IF lower(NEW.email) = 'bot@dreamcrazybig.se' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'tester') ON CONFLICT DO NOTHING;
  END IF;

  PERFORM public.grant_allowlisted_admin(NEW.id);
  RETURN NEW;
END;
$$;

-- Confirmation via the email link (or a confirmed email change)
CREATE OR REPLACE FUNCTION public.handle_user_email_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.grant_allowlisted_admin(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_email_confirmed
AFTER UPDATE OF email_confirmed_at, email ON auth.users
FOR EACH ROW
WHEN (NEW.email_confirmed_at IS NOT NULL
      AND (OLD.email_confirmed_at IS NULL OR OLD.email IS DISTINCT FROM NEW.email))
EXECUTE FUNCTION public.handle_user_email_confirmed();

-- Adding an email to the allowlist promotes an already-confirmed account
CREATE OR REPLACE FUNCTION public.admin_email_allowlist_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.grant_allowlisted_admin(u.id)
  FROM auth.users u
  WHERE lower(u.email) = NEW.email AND u.email_confirmed_at IS NOT NULL;
  RETURN NEW;
END;
$$;

CREATE TRIGGER admin_email_allowlist_after_insert
AFTER INSERT ON public.admin_email_allowlist
FOR EACH ROW EXECUTE FUNCTION public.admin_email_allowlist_after_insert();

-- Backfill: existing confirmed accounts already on the allowlist
SELECT public.grant_allowlisted_admin(u.id)
FROM auth.users u
JOIN public.admin_email_allowlist a ON a.email = lower(u.email)
WHERE u.email_confirmed_at IS NOT NULL;

REVOKE EXECUTE ON FUNCTION public.grant_allowlisted_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_user_email_confirmed() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_email_allowlist_after_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_email_allowlist_normalize() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_allowlisted_admin(uuid) TO service_role;
