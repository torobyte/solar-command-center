-- =========================
-- Roles
-- =========================
CREATE TYPE public.app_role AS ENUM ('superadmin', 'user');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- has_role helper (SECURITY DEFINER avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- Trigger: create profile + default role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '')
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER profiles_set_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- Sites (cada Raspberry/OrangePi de un cliente)
-- =========================
CREATE TABLE public.sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  inverter_model TEXT,
  inverter_serial TEXT,
  device_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  hardware_id TEXT,
  last_seen_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | online | offline
  plan TEXT NOT NULL DEFAULT 'trial',     -- trial | pro
  license_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
CREATE INDEX sites_owner_idx ON public.sites(owner_id);

CREATE TRIGGER sites_set_updated_at
BEFORE UPDATE ON public.sites
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- License codes (superadmin genera, usuario canjea desde su Raspberry)
-- =========================
CREATE TABLE public.license_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'pro',
  duration_days INTEGER NOT NULL DEFAULT 365,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  redeemed_by_site UUID REFERENCES public.sites(id) ON DELETE SET NULL,
  redeemed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.license_codes ENABLE ROW LEVEL SECURITY;

-- =========================
-- Telemetry (samples + daily totals)
-- =========================
CREATE TABLE public.telemetry_samples (
  id BIGSERIAL PRIMARY KEY,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Voltronic / Axpert standard QPIGS fields
  grid_voltage NUMERIC,
  grid_frequency NUMERIC,
  ac_output_voltage NUMERIC,
  ac_output_frequency NUMERIC,
  ac_output_apparent_power NUMERIC,
  ac_output_active_power NUMERIC,
  load_percent NUMERIC,
  bus_voltage NUMERIC,
  battery_voltage NUMERIC,
  battery_charging_current NUMERIC,
  battery_capacity NUMERIC,            -- %
  battery_discharge_current NUMERIC,
  inverter_temperature NUMERIC,
  pv_input_current NUMERIC,
  pv_input_voltage NUMERIC,
  pv_input_power NUMERIC,
  device_status TEXT,
  inverter_mode TEXT,
  raw JSONB
);
ALTER TABLE public.telemetry_samples ENABLE ROW LEVEL SECURITY;
CREATE INDEX telemetry_site_time_idx ON public.telemetry_samples(site_id, recorded_at DESC);

CREATE TABLE public.daily_totals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  load_kwh NUMERIC NOT NULL DEFAULT 0,
  pv_kwh NUMERIC NOT NULL DEFAULT 0,
  battery_charged_kwh NUMERIC NOT NULL DEFAULT 0,
  battery_discharged_kwh NUMERIC NOT NULL DEFAULT 0,
  grid_used_kwh NUMERIC NOT NULL DEFAULT 0,
  grid_exported_kwh NUMERIC NOT NULL DEFAULT 0,
  UNIQUE (site_id, day)
);
ALTER TABLE public.daily_totals ENABLE ROW LEVEL SECURITY;

-- =========================
-- RLS POLICIES
-- =========================

-- profiles: own + superadmin
CREATE POLICY "profiles_select_own_or_admin" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "profiles_insert_self" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- user_roles: read own; only superadmin writes
CREATE POLICY "roles_select_own_or_admin" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "roles_admin_all" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'superadmin'))
  WITH CHECK (public.has_role(auth.uid(), 'superadmin'));

-- sites: owner full + superadmin full
CREATE POLICY "sites_select_owner_or_admin" ON public.sites
  FOR SELECT USING (auth.uid() = owner_id OR public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "sites_insert_owner" ON public.sites
  FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "sites_update_owner_or_admin" ON public.sites
  FOR UPDATE USING (auth.uid() = owner_id OR public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "sites_delete_owner_or_admin" ON public.sites
  FOR DELETE USING (auth.uid() = owner_id OR public.has_role(auth.uid(), 'superadmin'));

-- license_codes: only superadmin (agent activates via service role on server)
CREATE POLICY "licenses_admin_all" ON public.license_codes
  FOR ALL USING (public.has_role(auth.uid(), 'superadmin'))
  WITH CHECK (public.has_role(auth.uid(), 'superadmin'));

-- telemetry_samples: read for site owner / superadmin; insert via service role only
CREATE POLICY "telemetry_select_owner_or_admin" ON public.telemetry_samples
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      WHERE s.id = site_id
        AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(), 'superadmin'))
    )
  );

-- daily_totals: same
CREATE POLICY "totals_select_owner_or_admin" ON public.daily_totals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.sites s
      WHERE s.id = site_id
        AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(), 'superadmin'))
    )
  );