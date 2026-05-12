
CREATE TABLE public.license_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id uuid,
  license_code text,
  plan text,
  action text NOT NULL,
  performed_by uuid,
  performed_by_email text,
  reason text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.license_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_select_admin ON public.license_audit_log
  FOR SELECT USING (public.has_role(auth.uid(),'superadmin'));

CREATE POLICY audit_insert_admin ON public.license_audit_log
  FOR INSERT WITH CHECK (
    public.has_role(auth.uid(),'superadmin')
    AND performed_by = auth.uid()
  );

CREATE INDEX idx_license_audit_license ON public.license_audit_log(license_id);
CREATE INDEX idx_license_audit_created ON public.license_audit_log(created_at DESC);
