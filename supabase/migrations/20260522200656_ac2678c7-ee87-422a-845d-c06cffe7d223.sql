
-- 1. email_templates: restrict SELECT to superadmin
DROP POLICY IF EXISTS tpl_select_all ON public.email_templates;
CREATE POLICY tpl_select_admin ON public.email_templates
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));

-- 2. pairing_codes: only the claiming user can read their own claimed rows.
-- Unclaimed lookups happen server-side via supabaseAdmin.
DROP POLICY IF EXISTS pairing_select_own_or_unclaimed ON public.pairing_codes;
CREATE POLICY pairing_select_own ON public.pairing_codes
  FOR SELECT TO authenticated
  USING (claimed_by_user = auth.uid());

-- 3. smtp_settings: explicit SELECT policy (superadmin only) for clarity.
CREATE POLICY smtp_select_admin ON public.smtp_settings
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'superadmin'::public.app_role));

-- 4. Storage: drop broad listing policies on public buckets.
-- Public URLs (getPublicUrl) continue to work without storage.objects SELECT.
DROP POLICY IF EXISTS "apk_assets public read" ON storage.objects;
DROP POLICY IF EXISTS branding_public_read ON storage.objects;

-- 5. Revoke EXECUTE on SECURITY DEFINER functions that should not be
-- callable directly by clients. These are triggers or internal helpers.
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.license_codes_normalize() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.link_licenses_to_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.accept_pending_site_invitations() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dispatch_push_event() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.evaluate_notification_rules() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.compute_daily_totals(uuid, date) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_all_today_totals() FROM anon, authenticated;

-- 6. Realtime: enable RLS on realtime.messages to block ad-hoc
-- broadcast/presence subscriptions. The app only uses postgres_changes,
-- which streams from public tables under their own RLS — unaffected.
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;
