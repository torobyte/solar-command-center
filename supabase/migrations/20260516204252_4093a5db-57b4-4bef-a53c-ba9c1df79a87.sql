
INSERT INTO storage.buckets (id, name, public) VALUES ('apk-assets', 'apk-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "apk_assets public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'apk-assets');

CREATE POLICY "apk_assets superadmin write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'apk-assets' AND public.has_role(auth.uid(), 'superadmin'));

CREATE POLICY "apk_assets superadmin update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'apk-assets' AND public.has_role(auth.uid(), 'superadmin'));

CREATE POLICY "apk_assets superadmin delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'apk-assets' AND public.has_role(auth.uid(), 'superadmin'));
