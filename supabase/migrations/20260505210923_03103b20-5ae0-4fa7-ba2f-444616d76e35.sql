
REVOKE EXECUTE ON FUNCTION public.compute_daily_totals(uuid, date) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.refresh_all_today_totals() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, authenticated, public;
