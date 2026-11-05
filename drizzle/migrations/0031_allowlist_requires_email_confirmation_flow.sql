CREATE OR REPLACE FUNCTION public.grant_allowlisted_admin(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only accounts that were invited or went through the confirmation email flow.
  INSERT INTO public.user_roles (user_id, role)
  SELECT u.id, a.role
  FROM auth.users u
  JOIN public.admin_email_allowlist a ON a.email = lower(u.email)
  WHERE u.id = _user_id
    AND u.email_confirmed_at IS NOT NULL
    AND (u.confirmation_sent_at IS NOT NULL OR u.invited_at IS NOT NULL)
  ON CONFLICT DO NOTHING;
  RETURN FOUND;
END $$;

REVOKE EXECUTE ON FUNCTION public.grant_allowlisted_admin(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_allowlisted_admin(uuid) TO service_role;
