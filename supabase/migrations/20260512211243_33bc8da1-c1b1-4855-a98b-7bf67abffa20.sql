-- PV system configuration per site
CREATE TABLE public.pv_system_config (
  site_id uuid PRIMARY KEY,
  array_kwp numeric,
  panel_count integer,
  panel_watts numeric,
  azimuth numeric DEFAULT 180,
  tilt numeric DEFAULT 30,
  battery_kwh numeric,
  system_losses_pct numeric DEFAULT 14,
  latitude numeric,
  longitude numeric,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pv_system_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY pv_cfg_select ON public.pv_system_config FOR SELECT
USING (EXISTS (SELECT 1 FROM public.sites s WHERE s.id = site_id AND (s.owner_id = auth.uid() OR has_role(auth.uid(), 'superadmin'))));

CREATE POLICY pv_cfg_insert ON public.pv_system_config FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.sites s WHERE s.id = site_id AND (s.owner_id = auth.uid() OR has_role(auth.uid(), 'superadmin'))));

CREATE POLICY pv_cfg_update ON public.pv_system_config FOR UPDATE
USING (EXISTS (SELECT 1 FROM public.sites s WHERE s.id = site_id AND (s.owner_id = auth.uid() OR has_role(auth.uid(), 'superadmin'))));

CREATE TRIGGER pv_cfg_updated BEFORE UPDATE ON public.pv_system_config
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Dashboard layouts (per user, per site)
CREATE TABLE public.dashboard_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  site_id uuid NOT NULL,
  widgets jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, site_id)
);
ALTER TABLE public.dashboard_layouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY layouts_select_own ON public.dashboard_layouts FOR SELECT USING (user_id = auth.uid());
CREATE POLICY layouts_insert_own ON public.dashboard_layouts FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY layouts_update_own ON public.dashboard_layouts FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY layouts_delete_own ON public.dashboard_layouts FOR DELETE USING (user_id = auth.uid());

CREATE TRIGGER layouts_updated BEFORE UPDATE ON public.dashboard_layouts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();