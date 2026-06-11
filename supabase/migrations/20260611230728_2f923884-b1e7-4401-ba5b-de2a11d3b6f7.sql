
CREATE TABLE public.user_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'API key',
  token text NOT NULL UNIQUE DEFAULT ('tb_live_' || encode(extensions.gen_random_bytes(24), 'hex')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX idx_user_api_keys_user ON public.user_api_keys(user_id);
CREATE INDEX idx_user_api_keys_token ON public.user_api_keys(token);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_api_keys TO authenticated;
GRANT ALL ON public.user_api_keys TO service_role;

ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "api_keys_select_own" ON public.user_api_keys
  FOR SELECT USING (user_id = auth.uid() OR has_role(auth.uid(), 'superadmin'::app_role));
CREATE POLICY "api_keys_insert_own" ON public.user_api_keys
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "api_keys_update_own" ON public.user_api_keys
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "api_keys_delete_own" ON public.user_api_keys
  FOR DELETE USING (user_id = auth.uid());
