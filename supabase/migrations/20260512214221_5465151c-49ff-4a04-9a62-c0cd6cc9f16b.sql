
-- Branding settings (singleton)
CREATE TABLE public.branding_settings (
  key text PRIMARY KEY DEFAULT 'global',
  site_name text NOT NULL DEFAULT 'SolarOps',
  tagline text DEFAULT 'Monitor your solar inverter',
  logo_url text,
  favicon_url text,
  primary_color text DEFAULT '#f59e0b',
  primary_foreground text DEFAULT '#ffffff',
  accent_color text DEFAULT '#fbbf24',
  background_color text DEFAULT '#0a0a0a',
  foreground_color text DEFAULT '#fafafa',
  card_color text DEFAULT '#171717',
  muted_color text DEFAULT '#262626',
  border_color text DEFAULT '#262626',
  success_color text DEFAULT '#22c55e',
  warning_color text DEFAULT '#f59e0b',
  destructive_color text DEFAULT '#ef4444',
  font_display text DEFAULT 'Inter',
  font_body text DEFAULT 'Inter',
  radius text DEFAULT '0.5rem',
  pwa_name text DEFAULT 'SolarOps',
  pwa_short_name text DEFAULT 'SolarOps',
  pwa_description text DEFAULT 'Monitor your solar inverter',
  pwa_theme_color text DEFAULT '#f59e0b',
  pwa_background_color text DEFAULT '#0a0a0a',
  pwa_display text DEFAULT 'standalone',
  pwa_icon_192 text,
  pwa_icon_512 text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT branding_singleton CHECK (key = 'global')
);
ALTER TABLE public.branding_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY branding_select_all ON public.branding_settings FOR SELECT USING (true);
CREATE POLICY branding_admin_write ON public.branding_settings FOR ALL
  USING (public.has_role(auth.uid(),'superadmin'))
  WITH CHECK (public.has_role(auth.uid(),'superadmin'));
INSERT INTO public.branding_settings(key) VALUES ('global') ON CONFLICT DO NOTHING;

-- Plans table
CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  duration_days integer,
  is_lifetime boolean NOT NULL DEFAULT false,
  price_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY plans_select_all ON public.plans FOR SELECT USING (true);
CREATE POLICY plans_admin_all ON public.plans FOR ALL
  USING (public.has_role(auth.uid(),'superadmin'))
  WITH CHECK (public.has_role(auth.uid(),'superadmin'));

INSERT INTO public.plans(slug,name,description,duration_days,is_lifetime,price_cents,sort_order,features) VALUES
  ('trial','Trial','Prueba gratuita',14,false,0,1,'["Acceso básico"]'::jsonb),
  ('pro','Pro','Plan anual',365,false,4900,2,'["Telemetría completa","Alertas","Histórico"]'::jsonb),
  ('lifetime','De por vida','Pago único, acceso ilimitado',NULL,true,29900,3,'["Todo Pro","Sin renovaciones","Soporte prioritario"]'::jsonb)
ON CONFLICT (slug) DO NOTHING;

-- Allow lifetime on license_codes (duration_days nullable when lifetime)
ALTER TABLE public.license_codes ADD COLUMN IF NOT EXISTS is_lifetime boolean NOT NULL DEFAULT false;
ALTER TABLE public.license_codes ALTER COLUMN duration_days DROP NOT NULL;

-- Allow superadmin DELETE on license_codes (already covered by ALL policy)
-- Triggers for updated_at
CREATE TRIGGER trg_branding_updated BEFORE UPDATE ON public.branding_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_plans_updated BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
