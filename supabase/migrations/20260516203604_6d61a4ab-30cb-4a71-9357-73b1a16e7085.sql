
CREATE TABLE IF NOT EXISTS public.apk_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  app_id text NOT NULL DEFAULT 'app.solarops.client',
  app_name text NOT NULL DEFAULT 'SolarOps',
  version_name text NOT NULL DEFAULT '1.0.0',
  version_code integer NOT NULL DEFAULT 1,
  server_url text NOT NULL DEFAULT 'https://project--7cb3041b-eb20-43aa-ba17-b0848cb53051.lovable.app',
  primary_color text NOT NULL DEFAULT '#f59e0b',
  background_color text NOT NULL DEFAULT '#0a0a0a',
  splash_color text NOT NULL DEFAULT '#0a0a0a',
  status_bar_style text NOT NULL DEFAULT 'dark',
  icon_url text,
  splash_url text,
  enable_push boolean NOT NULL DEFAULT true,
  cleartext boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.apk_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "apk_config superadmin read" ON public.apk_config
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "apk_config superadmin write" ON public.apk_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'))
  WITH CHECK (public.has_role(auth.uid(), 'superadmin'));

INSERT INTO public.apk_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TRIGGER apk_config_set_updated_at
  BEFORE UPDATE ON public.apk_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
