
-- 1. devices table: one row per physical inverter under a site
CREATE TABLE public.devices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  name text NOT NULL,
  model text,
  serial_number text,
  driver text,
  is_primary boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_devices_site ON public.devices(site_id);
CREATE UNIQUE INDEX uniq_devices_primary_per_site
  ON public.devices(site_id) WHERE is_primary = true;

ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY devices_select_owner_or_admin ON public.devices
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.sites s
            WHERE s.id = devices.site_id
              AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'superadmin')))
  );
CREATE POLICY devices_insert_owner_or_admin ON public.devices
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.sites s
            WHERE s.id = devices.site_id
              AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'superadmin')))
  );
CREATE POLICY devices_update_owner_or_admin ON public.devices
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.sites s
            WHERE s.id = devices.site_id
              AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'superadmin')))
  );
CREATE POLICY devices_delete_owner_or_admin ON public.devices
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.sites s
            WHERE s.id = devices.site_id
              AND (s.owner_id = auth.uid() OR public.has_role(auth.uid(),'superadmin')))
  );

CREATE TRIGGER devices_set_updated_at
  BEFORE UPDATE ON public.devices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. add nullable device_id to existing per-site tables. NULL means the site's
--    primary device, so legacy rows keep working.
ALTER TABLE public.telemetry_samples  ADD COLUMN device_id uuid REFERENCES public.devices(id) ON DELETE CASCADE;
ALTER TABLE public.inverter_specs     ADD COLUMN device_id uuid REFERENCES public.devices(id) ON DELETE CASCADE;
ALTER TABLE public.device_snapshots   ADD COLUMN device_id uuid REFERENCES public.devices(id) ON DELETE CASCADE;
ALTER TABLE public.device_commands    ADD COLUMN device_id uuid REFERENCES public.devices(id) ON DELETE CASCADE;
ALTER TABLE public.notification_rules ADD COLUMN device_id uuid REFERENCES public.devices(id) ON DELETE CASCADE;
ALTER TABLE public.pv_system_config   ADD COLUMN device_id uuid REFERENCES public.devices(id) ON DELETE CASCADE;
ALTER TABLE public.dashboard_layouts  ADD COLUMN device_id uuid REFERENCES public.devices(id) ON DELETE CASCADE;

CREATE INDEX idx_telemetry_device   ON public.telemetry_samples(device_id, recorded_at DESC);
CREATE INDEX idx_specs_device       ON public.inverter_specs(device_id);
CREATE INDEX idx_snapshots_device   ON public.device_snapshots(device_id);
CREATE INDEX idx_commands_device    ON public.device_commands(device_id, created_at DESC);
CREATE INDEX idx_rules_device       ON public.notification_rules(device_id);

-- 3. backfill: for sites that already have data, create a single primary device
INSERT INTO public.devices (site_id, name, model, serial_number, is_primary)
SELECT s.id,
       COALESCE(s.inverter_model, 'Inversor principal'),
       s.inverter_model,
       s.inverter_serial,
       true
FROM public.sites s
WHERE NOT EXISTS (SELECT 1 FROM public.devices d WHERE d.site_id = s.id);
