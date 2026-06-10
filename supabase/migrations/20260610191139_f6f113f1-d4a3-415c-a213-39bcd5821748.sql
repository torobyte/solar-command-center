UPDATE public.telemetry_samples SET battery_voltage = NULL
WHERE site_id='91dccf4e-f435-4b81-b87c-69c71eaf1339'
  AND recorded_at > now() - interval '30 days'
  AND battery_voltage IS NOT NULL
  AND (battery_voltage < 28.8 OR battery_voltage > 64.8);