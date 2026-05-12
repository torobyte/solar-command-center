
revoke execute on function public.compute_daily_totals(uuid, date) from public, anon, authenticated;
revoke execute on function public.refresh_all_today_totals() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
