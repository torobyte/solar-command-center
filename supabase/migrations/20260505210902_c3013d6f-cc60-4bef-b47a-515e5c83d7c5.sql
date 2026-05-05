
CREATE UNIQUE INDEX IF NOT EXISTS daily_totals_site_day_uidx ON public.daily_totals(site_id, day);
CREATE INDEX IF NOT EXISTS telemetry_site_recorded_idx ON public.telemetry_samples(site_id, recorded_at DESC);

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.compute_daily_totals(_site uuid, _day date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pv numeric; _load numeric; _grid_used numeric; _bat_charge numeric; _bat_discharge numeric;
BEGIN
  -- average power (W) over interval * hours = Wh, /1000 = kWh
  -- Use trapezoidal-ish approximation: avg(power) * (number_of_samples * sample_interval_hours)
  -- Simpler: avg(power) * 24 hours for a full day's data when day is complete; else proportional.
  WITH s AS (
    SELECT
      AVG(COALESCE(pv_input_power,0)) AS pv_w,
      AVG(COALESCE(ac_output_active_power,0)) AS load_w,
      AVG(CASE WHEN COALESCE(grid_voltage,0) > 50 THEN COALESCE(ac_output_active_power,0) ELSE 0 END) AS grid_w,
      AVG(GREATEST(COALESCE(battery_charging_current,0),0) * COALESCE(battery_voltage,0)) AS bat_chg_w,
      AVG(GREATEST(COALESCE(battery_discharge_current,0),0) * COALESCE(battery_voltage,0)) AS bat_dis_w,
      EXTRACT(EPOCH FROM (MAX(recorded_at) - MIN(recorded_at)))/3600.0 AS hours
    FROM public.telemetry_samples
    WHERE site_id = _site
      AND recorded_at >= _day::timestamptz
      AND recorded_at < (_day + 1)::timestamptz
  )
  INSERT INTO public.daily_totals(site_id, day, pv_kwh, load_kwh, grid_used_kwh, grid_exported_kwh, battery_charged_kwh, battery_discharged_kwh)
  SELECT _site, _day,
    COALESCE(s.pv_w * s.hours / 1000.0, 0),
    COALESCE(s.load_w * s.hours / 1000.0, 0),
    COALESCE(s.grid_w * s.hours / 1000.0, 0),
    0,
    COALESCE(s.bat_chg_w * s.hours / 1000.0, 0),
    COALESCE(s.bat_dis_w * s.hours / 1000.0, 0)
  FROM s
  ON CONFLICT (site_id, day) DO UPDATE SET
    pv_kwh = EXCLUDED.pv_kwh,
    load_kwh = EXCLUDED.load_kwh,
    grid_used_kwh = EXCLUDED.grid_used_kwh,
    battery_charged_kwh = EXCLUDED.battery_charged_kwh,
    battery_discharged_kwh = EXCLUDED.battery_discharged_kwh;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_all_today_totals()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT site_id FROM public.telemetry_samples
           WHERE recorded_at >= (CURRENT_DATE)::timestamptz LOOP
    PERFORM public.compute_daily_totals(r.site_id, CURRENT_DATE);
  END LOOP;
END;
$$;

-- Schedule every 15 minutes
SELECT cron.schedule('refresh-daily-totals', '*/15 * * * *', $$SELECT public.refresh_all_today_totals();$$)
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-daily-totals');
