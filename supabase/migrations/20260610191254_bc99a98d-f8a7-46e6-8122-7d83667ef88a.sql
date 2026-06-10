UPDATE public.telemetry_samples SET battery_voltage = NULL
WHERE site_id='91dccf4e-f435-4b81-b87c-69c71eaf1339'
  AND battery_voltage IS NOT NULL
  AND (battery_voltage < 28.8 OR battery_voltage > 64.8);

UPDATE public.telemetry_samples SET pv_input_power = NULL
WHERE site_id='91dccf4e-f435-4b81-b87c-69c71eaf1339'
  AND pv_input_power IS NOT NULL AND pv_input_power > 5720;

UPDATE public.telemetry_samples SET battery_charging_current = NULL
WHERE site_id='91dccf4e-f435-4b81-b87c-69c71eaf1339'
  AND battery_charging_current IS NOT NULL AND battery_charging_current > 300;