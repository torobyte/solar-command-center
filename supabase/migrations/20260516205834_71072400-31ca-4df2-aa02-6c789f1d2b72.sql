-- widget_tokens: opaque tokens used by the Android widget to call /api/public/widget-data
CREATE TABLE public.widget_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

ALTER TABLE public.widget_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "widget_tokens_select_own_or_admin" ON public.widget_tokens
  FOR SELECT USING (user_id = auth.uid() OR has_role(auth.uid(), 'superadmin'::app_role));
CREATE POLICY "widget_tokens_insert_own" ON public.widget_tokens
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "widget_tokens_update_own" ON public.widget_tokens
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "widget_tokens_delete_own" ON public.widget_tokens
  FOR DELETE USING (user_id = auth.uid());

CREATE INDEX idx_widget_tokens_user ON public.widget_tokens(user_id);
CREATE INDEX idx_widget_tokens_token ON public.widget_tokens(token);

-- widget_configs: definition of each Android widget instance
CREATE TABLE public.widget_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_id uuid REFERENCES public.widget_tokens(id) ON DELETE SET NULL,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Mi sitio',
  metrics jsonb NOT NULL DEFAULT '["pv","battery","load","grid"]'::jsonb,
  theme text NOT NULL DEFAULT 'dark',
  refresh_minutes integer NOT NULL DEFAULT 30,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.widget_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "widget_configs_select_own" ON public.widget_configs
  FOR SELECT USING (user_id = auth.uid() OR has_role(auth.uid(), 'superadmin'::app_role));
CREATE POLICY "widget_configs_insert_own" ON public.widget_configs
  FOR INSERT WITH CHECK (user_id = auth.uid() AND has_site_access(site_id, auth.uid(), 'viewer'::site_member_role));
CREATE POLICY "widget_configs_update_own" ON public.widget_configs
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "widget_configs_delete_own" ON public.widget_configs
  FOR DELETE USING (user_id = auth.uid());

CREATE INDEX idx_widget_configs_user ON public.widget_configs(user_id);

CREATE TRIGGER widget_configs_set_updated_at
  BEFORE UPDATE ON public.widget_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add start_path column to apk_config for separate launch path
ALTER TABLE public.apk_config
  ADD COLUMN IF NOT EXISTS start_path text NOT NULL DEFAULT '/app-login';