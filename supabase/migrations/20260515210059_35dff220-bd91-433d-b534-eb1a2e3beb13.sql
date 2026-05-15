
-- 1. Enum de roles
DO $$ BEGIN
  CREATE TYPE public.site_member_role AS ENUM ('viewer','operator','admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Tabla site_members
CREATE TABLE IF NOT EXISTS public.site_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role public.site_member_role NOT NULL DEFAULT 'viewer',
  invited_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(site_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_site_members_user ON public.site_members(user_id);
CREATE INDEX IF NOT EXISTS idx_site_members_site ON public.site_members(site_id);
ALTER TABLE public.site_members ENABLE ROW LEVEL SECURITY;

-- 3. Tabla site_invitations
CREATE TABLE IF NOT EXISTS public.site_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL,
  email text NOT NULL,
  role public.site_member_role NOT NULL DEFAULT 'viewer',
  token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(24),'hex'),
  invited_by uuid NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);
CREATE INDEX IF NOT EXISTS idx_site_invitations_email ON public.site_invitations(lower(email));
CREATE INDEX IF NOT EXISTS idx_site_invitations_site ON public.site_invitations(site_id);
ALTER TABLE public.site_invitations ENABLE ROW LEVEL SECURITY;

-- 4. Helper SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.is_site_member(_site uuid, _user uuid, _min_role public.site_member_role DEFAULT 'viewer')
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.site_members sm
    WHERE sm.site_id = _site AND sm.user_id = _user
      AND CASE _min_role
        WHEN 'viewer'   THEN sm.role IN ('viewer','operator','admin')
        WHEN 'operator' THEN sm.role IN ('operator','admin')
        WHEN 'admin'    THEN sm.role = 'admin'
      END
  );
$$;

CREATE OR REPLACE FUNCTION public.has_site_access(_site uuid, _user uuid, _min_role public.site_member_role DEFAULT 'viewer')
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.sites s WHERE s.id = _site AND s.owner_id = _user)
      OR public.is_site_member(_site, _user, _min_role)
      OR public.has_role(_user, 'superadmin'::app_role);
$$;

-- 5. RLS para site_members
DROP POLICY IF EXISTS "members_select" ON public.site_members;
CREATE POLICY "members_select" ON public.site_members FOR SELECT
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.sites s WHERE s.id = site_id AND s.owner_id = auth.uid())
  OR public.is_site_member(site_id, auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superadmin'::app_role)
);

DROP POLICY IF EXISTS "members_insert" ON public.site_members;
CREATE POLICY "members_insert" ON public.site_members FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM public.sites s WHERE s.id = site_id AND s.owner_id = auth.uid())
  OR public.is_site_member(site_id, auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superadmin'::app_role)
);

DROP POLICY IF EXISTS "members_update" ON public.site_members;
CREATE POLICY "members_update" ON public.site_members FOR UPDATE
USING (
  EXISTS (SELECT 1 FROM public.sites s WHERE s.id = site_id AND s.owner_id = auth.uid())
  OR public.is_site_member(site_id, auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superadmin'::app_role)
);

DROP POLICY IF EXISTS "members_delete" ON public.site_members;
CREATE POLICY "members_delete" ON public.site_members FOR DELETE
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.sites s WHERE s.id = site_id AND s.owner_id = auth.uid())
  OR public.is_site_member(site_id, auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superadmin'::app_role)
);

-- 6. RLS para site_invitations
DROP POLICY IF EXISTS "invitations_select" ON public.site_invitations;
CREATE POLICY "invitations_select" ON public.site_invitations FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.sites s WHERE s.id = site_id AND s.owner_id = auth.uid())
  OR public.is_site_member(site_id, auth.uid(), 'admin')
  OR lower(email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
  OR public.has_role(auth.uid(), 'superadmin'::app_role)
);

DROP POLICY IF EXISTS "invitations_insert" ON public.site_invitations;
CREATE POLICY "invitations_insert" ON public.site_invitations FOR INSERT
WITH CHECK (
  invited_by = auth.uid()
  AND (
    EXISTS (SELECT 1 FROM public.sites s WHERE s.id = site_id AND s.owner_id = auth.uid())
    OR public.is_site_member(site_id, auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'superadmin'::app_role)
  )
);

DROP POLICY IF EXISTS "invitations_delete" ON public.site_invitations;
CREATE POLICY "invitations_delete" ON public.site_invitations FOR DELETE
USING (
  EXISTS (SELECT 1 FROM public.sites s WHERE s.id = site_id AND s.owner_id = auth.uid())
  OR public.is_site_member(site_id, auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superadmin'::app_role)
);

-- 7. Actualizar RLS existentes para incluir miembros
DROP POLICY IF EXISTS sites_select_owner_or_admin ON public.sites;
CREATE POLICY sites_select_owner_or_admin ON public.sites FOR SELECT
USING (
  auth.uid() = owner_id
  OR public.is_site_member(id, auth.uid(), 'viewer')
  OR public.has_role(auth.uid(), 'superadmin'::app_role)
);

DROP POLICY IF EXISTS sites_update_owner_or_admin ON public.sites;
CREATE POLICY sites_update_owner_or_admin ON public.sites FOR UPDATE
USING (
  auth.uid() = owner_id
  OR public.is_site_member(id, auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'superadmin'::app_role)
);

DROP POLICY IF EXISTS telemetry_select_owner_or_admin ON public.telemetry_samples;
CREATE POLICY telemetry_select_owner_or_admin ON public.telemetry_samples FOR SELECT
USING (public.has_site_access(site_id, auth.uid(), 'viewer'));

DROP POLICY IF EXISTS specs_select_owner_or_admin ON public.inverter_specs;
CREATE POLICY specs_select_owner_or_admin ON public.inverter_specs FOR SELECT
USING (public.has_site_access(site_id, auth.uid(), 'viewer'));

DROP POLICY IF EXISTS snapshots_select_owner_or_admin ON public.device_snapshots;
CREATE POLICY snapshots_select_owner_or_admin ON public.device_snapshots FOR SELECT
USING (public.has_site_access(site_id, auth.uid(), 'viewer'));

DROP POLICY IF EXISTS totals_select_owner_or_admin ON public.daily_totals;
CREATE POLICY totals_select_owner_or_admin ON public.daily_totals FOR SELECT
USING (public.has_site_access(site_id, auth.uid(), 'viewer'));

DROP POLICY IF EXISTS devices_select_owner_or_admin ON public.devices;
CREATE POLICY devices_select_owner_or_admin ON public.devices FOR SELECT
USING (public.has_site_access(site_id, auth.uid(), 'viewer'));

DROP POLICY IF EXISTS devices_insert_owner_or_admin ON public.devices;
CREATE POLICY devices_insert_owner_or_admin ON public.devices FOR INSERT
WITH CHECK (public.has_site_access(site_id, auth.uid(), 'admin'));

DROP POLICY IF EXISTS devices_update_owner_or_admin ON public.devices;
CREATE POLICY devices_update_owner_or_admin ON public.devices FOR UPDATE
USING (public.has_site_access(site_id, auth.uid(), 'admin'));

DROP POLICY IF EXISTS devices_delete_owner_or_admin ON public.devices;
CREATE POLICY devices_delete_owner_or_admin ON public.devices FOR DELETE
USING (public.has_site_access(site_id, auth.uid(), 'admin'));

DROP POLICY IF EXISTS commands_select_owner_or_admin ON public.device_commands;
CREATE POLICY commands_select_owner_or_admin ON public.device_commands FOR SELECT
USING (public.has_site_access(site_id, auth.uid(), 'viewer'));

DROP POLICY IF EXISTS commands_insert_owner_or_admin ON public.device_commands;
CREATE POLICY commands_insert_owner_or_admin ON public.device_commands FOR INSERT
WITH CHECK (public.has_site_access(site_id, auth.uid(), 'operator') AND created_by = auth.uid());

DROP POLICY IF EXISTS pv_cfg_select ON public.pv_system_config;
CREATE POLICY pv_cfg_select ON public.pv_system_config FOR SELECT
USING (public.has_site_access(site_id, auth.uid(), 'viewer'));

DROP POLICY IF EXISTS pv_cfg_insert ON public.pv_system_config;
CREATE POLICY pv_cfg_insert ON public.pv_system_config FOR INSERT
WITH CHECK (public.has_site_access(site_id, auth.uid(), 'admin'));

DROP POLICY IF EXISTS pv_cfg_update ON public.pv_system_config;
CREATE POLICY pv_cfg_update ON public.pv_system_config FOR UPDATE
USING (public.has_site_access(site_id, auth.uid(), 'admin'));

-- 8. Trigger para autoaceptar invitaciones por email al registrarse
CREATE OR REPLACE FUNCTION public.accept_pending_site_invitations()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE inv record;
BEGIN
  FOR inv IN
    SELECT * FROM public.site_invitations
    WHERE lower(email) = lower(NEW.email)
      AND accepted_at IS NULL
      AND expires_at > now()
  LOOP
    INSERT INTO public.site_members(site_id, user_id, role, invited_email)
    VALUES (inv.site_id, NEW.id, inv.role, inv.email)
    ON CONFLICT (site_id, user_id) DO NOTHING;
    UPDATE public.site_invitations SET accepted_at = now() WHERE id = inv.id;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_accept_invites ON auth.users;
CREATE TRIGGER on_auth_user_created_accept_invites
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.accept_pending_site_invitations();

-- 9. Plantilla de email para invitaciones
INSERT INTO public.email_templates (id, name, subject, html_body, text_body, enabled)
VALUES (
  'site_invitation',
  'Invitación a sitio',
  'Te invitaron a {{site_name}} en SolarOps',
  '<p>Hola,</p><p><b>{{inviter_name}}</b> te invitó a colaborar en <b>{{site_name}}</b> con rol <b>{{role}}</b>.</p><p><a href="{{accept_url}}">Aceptar invitación</a></p><p>El enlace expira en 7 días.</p>',
  'Te invitaron a {{site_name}} en SolarOps. Acepta la invitación: {{accept_url}}',
  true
) ON CONFLICT (id) DO NOTHING;
