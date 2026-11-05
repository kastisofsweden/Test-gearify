-- item-images accepts only JPEG, PNG and WebP (by file extension and declared content type).
DROP POLICY IF EXISTS "Back office uploads item images" ON storage.objects;
CREATE POLICY "Back office uploads item images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'item-images'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tester'))
    AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp')
    AND COALESCE(metadata->>'mimetype', 'image/jpeg') IN ('image/jpeg', 'image/png', 'image/webp')
  );

DROP POLICY IF EXISTS "Admins update item images" ON storage.objects;
CREATE POLICY "Admins update item images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'item-images' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (
    bucket_id = 'item-images'
    AND public.has_role(auth.uid(), 'admin')
    AND lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp')
  );
