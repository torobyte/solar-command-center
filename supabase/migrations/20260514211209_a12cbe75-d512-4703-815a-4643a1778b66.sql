
-- SMTP global settings (single row, key = 'global')
CREATE TABLE IF NOT EXISTS public.smtp_settings (
  key text PRIMARY KEY DEFAULT 'global',
  host text,
  port integer DEFAULT 587,
  secure boolean DEFAULT false,
  username text,
  password text,
  from_email text,
  from_name text DEFAULT 'SolarOps',
  enabled boolean DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.smtp_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY smtp_admin_all ON public.smtp_settings FOR ALL
  USING (public.has_role(auth.uid(),'superadmin'))
  WITH CHECK (public.has_role(auth.uid(),'superadmin'));
INSERT INTO public.smtp_settings(key) VALUES('global') ON CONFLICT DO NOTHING;

-- Email templates
CREATE TABLE IF NOT EXISTS public.email_templates (
  id text PRIMARY KEY,
  name text NOT NULL,
  subject text NOT NULL,
  html_body text NOT NULL,
  text_body text,
  enabled boolean DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY tpl_admin_all ON public.email_templates FOR ALL
  USING (public.has_role(auth.uid(),'superadmin'))
  WITH CHECK (public.has_role(auth.uid(),'superadmin'));
CREATE POLICY tpl_select_all ON public.email_templates FOR SELECT USING (true);

INSERT INTO public.email_templates(id,name,subject,html_body,text_body) VALUES
  ('signup','Bienvenida','Bienvenido a {{site_name}}',
   '<h1>Hola {{full_name}}</h1><p>Tu cuenta en {{site_name}} ha sido creada. Ya puedes iniciar sesión.</p>',
   'Hola {{full_name}}, tu cuenta en {{site_name}} ha sido creada.'),
  ('auth_reset','Recuperar contraseña','Restablece tu contraseña',
   '<h1>Restablecer contraseña</h1><p>Haz clic <a href="{{action_link}}">aquí</a> para crear una nueva.</p>',
   'Restablecer contraseña: {{action_link}}'),
  ('auth_verify','Verificar email','Confirma tu correo',
   '<h1>Confirma tu correo</h1><p>Haz clic <a href="{{action_link}}">aquí</a> para verificar tu cuenta.</p>',
   'Confirma tu correo: {{action_link}}'),
  ('alert','Alerta del sistema','[{{severity}}] {{title}}',
   '<h2>{{title}}</h2><p>{{body}}</p><p><small>Sitio: {{site_name}}</small></p>',
   '{{title}} — {{body}} ({{site_name}})'),
  ('license','Licencia','Tu licencia de {{site_name}}',
   '<h1>Licencia actualizada</h1><p>Plan: {{plan}}<br/>Expira: {{expires_at}}</p>',
   'Plan {{plan}} expira {{expires_at}}')
ON CONFLICT (id) DO NOTHING;

-- Storage bucket for branding assets (logos, icons)
INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "branding_public_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'branding');
CREATE POLICY "branding_admin_write" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'branding' AND public.has_role(auth.uid(),'superadmin'));
CREATE POLICY "branding_admin_update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'branding' AND public.has_role(auth.uid(),'superadmin'));
CREATE POLICY "branding_admin_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'branding' AND public.has_role(auth.uid(),'superadmin'));
