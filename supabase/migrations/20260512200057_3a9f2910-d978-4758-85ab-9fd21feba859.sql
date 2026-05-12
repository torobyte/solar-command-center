
-- =========================================================
-- Part 1: License codes — bind by email
-- =========================================================
ALTER TABLE public.license_codes
  ADD COLUMN IF NOT EXISTS assigned_email text,
  ADD COLUMN IF NOT EXISTS assigned_user_id uuid,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_license_codes_assigned_email
  ON public.license_codes (assigned_email);
CREATE INDEX IF NOT EXISTS idx_license_codes_assigned_user_id
  ON public.license_codes (assigned_user_id);

-- Normalize email + auto-link to existing user
CREATE OR REPLACE FUNCTION public.license_codes_normalize()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid;
BEGIN
  IF NEW.assigned_email IS NOT NULL THEN
    NEW.assigned_email := lower(trim(NEW.assigned_email));
    IF NEW.assigned_user_id IS NULL THEN
      SELECT id INTO _uid FROM auth.users WHERE lower(email) = NEW.assigned_email LIMIT 1;
      IF _uid IS NOT NULL THEN
        NEW.assigned_user_id := _uid;
        IF NEW.owner_id IS NULL THEN NEW.owner_id := _uid; END IF;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS license_codes_normalize_trg ON public.license_codes;
CREATE TRIGGER license_codes_normalize_trg
  BEFORE INSERT OR UPDATE ON public.license_codes
  FOR EACH ROW EXECUTE FUNCTION public.license_codes_normalize();

-- When a new auth user signs up, link any pending licenses for that email
CREATE OR REPLACE FUNCTION public.link_licenses_to_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.license_codes
  SET assigned_user_id = NEW.id,
      owner_id = COALESCE(owner_id, NEW.id)
  WHERE assigned_email = lower(NEW.email)
    AND assigned_user_id IS NULL
    AND redeemed_at IS NULL
    AND revoked_at IS NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_link_licenses ON auth.users;
CREATE TRIGGER on_auth_user_created_link_licenses
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.link_licenses_to_new_user();

-- Allow assigned users to see their own licenses (read-only)
DROP POLICY IF EXISTS licenses_select_assigned_user ON public.license_codes;
CREATE POLICY licenses_select_assigned_user ON public.license_codes
  FOR SELECT
  USING (assigned_user_id = auth.uid());

-- =========================================================
-- Part 2: Inverter specifications + device snapshots
-- =========================================================
CREATE TABLE IF NOT EXISTS public.inverter_specs (
  site_id uuid PRIMARY KEY,
  driver text,
  model_name text,
  serial_number text,
  firmware text,
  topology text,
  machine_type text,
  nominal_battery_voltage numeric,
  expected_ac_input_voltage numeric,
  max_ac_input_current numeric,
  max_ac_output_current numeric,
  max_ac_output_power numeric,
  max_ac_output_apparent_power numeric,
  raw jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.inverter_specs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS specs_select_owner_or_admin ON public.inverter_specs;
CREATE POLICY specs_select_owner_or_admin ON public.inverter_specs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.sites s
            WHERE s.id = inverter_specs.site_id
              AND (s.owner_id = auth.uid() OR has_role(auth.uid(), 'superadmin')))
  );

CREATE TABLE IF NOT EXISTS public.device_snapshots (
  site_id uuid PRIMARY KEY,
  ssid text,
  ip_eth text,
  ip_wlan text,
  ip_public text,
  internet_up boolean,
  cpu_temp_c numeric,
  storage_used_pct numeric,
  storage_total_gb numeric,
  usb_devices integer,
  board_model text,
  agent_version text,
  voltage_dips integer,
  raw jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.device_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS snapshots_select_owner_or_admin ON public.device_snapshots;
CREATE POLICY snapshots_select_owner_or_admin ON public.device_snapshots
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.sites s
            WHERE s.id = device_snapshots.site_id
              AND (s.owner_id = auth.uid() OR has_role(auth.uid(), 'superadmin')))
  );

-- =========================================================
-- Part 3: Device commands queue
-- =========================================================
CREATE TABLE IF NOT EXISTS public.device_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL,
  command text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  result jsonb,
  error text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  acked_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_device_commands_site_status
  ON public.device_commands (site_id, status, created_at);

ALTER TABLE public.device_commands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commands_select_owner_or_admin ON public.device_commands;
CREATE POLICY commands_select_owner_or_admin ON public.device_commands
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.sites s
            WHERE s.id = device_commands.site_id
              AND (s.owner_id = auth.uid() OR has_role(auth.uid(), 'superadmin')))
  );

DROP POLICY IF EXISTS commands_insert_owner_or_admin ON public.device_commands;
CREATE POLICY commands_insert_owner_or_admin ON public.device_commands
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.sites s
            WHERE s.id = device_commands.site_id
              AND (s.owner_id = auth.uid() OR has_role(auth.uid(), 'superadmin')))
    AND created_by = auth.uid()
  );

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.device_commands;
ALTER PUBLICATION supabase_realtime ADD TABLE public.inverter_specs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.device_snapshots;
