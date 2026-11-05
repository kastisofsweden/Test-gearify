DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['customers','leads','offers','offer_items','orders','order_lines','equipment','stock_items','stock_item_assignments','price_rules','shipping_zones','product_components','tax_rates'] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS created_by uuid DEFAULT auth.uid()', t);
    EXECUTE format('CREATE POLICY "Testers read all" ON public.%I FOR SELECT TO authenticated USING (public.has_role(auth.uid(), ''tester''))', t);
    EXECUTE format('CREATE POLICY "Testers create own" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), ''tester'') AND created_by = auth.uid())', t);
    EXECUTE format('CREATE POLICY "Testers edit own" ON public.%I FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), ''tester'') AND created_by = auth.uid()) WITH CHECK (created_by = auth.uid())', t);
    EXECUTE format('CREATE POLICY "Testers delete own" ON public.%I FOR DELETE TO authenticated USING (public.has_role(auth.uid(), ''tester'') AND created_by = auth.uid())', t);
  END LOOP;
END $$;

CREATE POLICY "Testers read order events" ON public.order_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'tester'));
CREATE POLICY "Testers log events on own orders" ON public.order_events FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'tester') AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.created_by = auth.uid()));
CREATE POLICY "Testers read profiles" ON public.profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'tester'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;

  IF lower(NEW.email) = 'bot@dreamcrazybig.se' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'tester') ON CONFLICT DO NOTHING;
  ELSIF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created') THEN
    CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;
