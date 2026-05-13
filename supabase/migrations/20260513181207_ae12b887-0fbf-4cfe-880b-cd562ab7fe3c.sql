ALTER TABLE public.pv_system_config
  ADD COLUMN IF NOT EXISTS battery_count integer,
  ADD COLUMN IF NOT EXISTS battery_type text,
  ADD COLUMN IF NOT EXISTS battery_voltage_each numeric,
  ADD COLUMN IF NOT EXISTS battery_ah_each numeric,
  ADD COLUMN IF NOT EXISTS battery_usable_dod_pct numeric;