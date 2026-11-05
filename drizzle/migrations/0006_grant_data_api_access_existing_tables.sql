GRANT SELECT ON public.equipment TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment TO authenticated;
GRANT ALL ON public.equipment TO service_role;

GRANT INSERT ON public.leads TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;

GRANT SELECT ON public.offers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.offers TO authenticated;
GRANT ALL ON public.offers TO service_role;

GRANT SELECT ON public.offer_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.offer_items TO authenticated;
GRANT ALL ON public.offer_items TO service_role;

GRANT SELECT ON public.site_page_overrides TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_page_overrides TO authenticated;
GRANT ALL ON public.site_page_overrides TO service_role;

GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
