-- Notification rules per user/site
CREATE TABLE public.notification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  site_id uuid NOT NULL,
  name text NOT NULL,
  metric text NOT NULL,            -- e.g. battery_capacity, pv_input_power, grid_voltage, ac_output_active_power, inverter_temperature, inverter_mode, offline
  operator text NOT NULL,          -- '<', '<=', '>', '>=', '==', '!=', 'changes_to'
  threshold numeric,               -- numeric threshold (nullable for string ops)
  threshold_text text,             -- text threshold (e.g. mode 'B')
  severity text NOT NULL DEFAULT 'info', -- info | warning | critical
  channels jsonb NOT NULL DEFAULT '["browser"]'::jsonb, -- browser | push | email (future)
  cooldown_minutes integer NOT NULL DEFAULT 15,
  enabled boolean NOT NULL DEFAULT true,
  last_triggered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notification_rules_site_idx ON public.notification_rules(site_id);
CREATE INDEX notification_rules_user_idx ON public.notification_rules(user_id);

ALTER TABLE public.notification_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY rules_select_own_or_admin ON public.notification_rules FOR SELECT
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'superadmin'::app_role));
CREATE POLICY rules_insert_own ON public.notification_rules FOR INSERT
  WITH CHECK (user_id = auth.uid()
              AND EXISTS (SELECT 1 FROM public.sites s WHERE s.id = site_id AND s.owner_id = auth.uid()));
CREATE POLICY rules_update_own ON public.notification_rules FOR UPDATE
  USING (user_id = auth.uid());
CREATE POLICY rules_delete_own ON public.notification_rules FOR DELETE
  USING (user_id = auth.uid());

CREATE TRIGGER notification_rules_set_updated_at
  BEFORE UPDATE ON public.notification_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Notification history (so the user sees what fired and when)
CREATE TABLE public.notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  site_id uuid NOT NULL,
  rule_id uuid REFERENCES public.notification_rules(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text,
  severity text NOT NULL DEFAULT 'info',
  metric text,
  value numeric,
  value_text text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notification_events_user_idx ON public.notification_events(user_id, created_at DESC);
CREATE INDEX notification_events_site_idx ON public.notification_events(site_id, created_at DESC);

ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY events_select_own_or_admin ON public.notification_events FOR SELECT
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'superadmin'::app_role));
CREATE POLICY events_insert_own ON public.notification_events FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY events_update_own ON public.notification_events FOR UPDATE
  USING (user_id = auth.uid());
CREATE POLICY events_delete_own ON public.notification_events FOR DELETE
  USING (user_id = auth.uid());