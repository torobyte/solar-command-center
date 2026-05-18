ALTER TABLE public.pv_system_config
  ADD COLUMN IF NOT EXISTS energy_price numeric,
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'CLP',
  ADD COLUMN IF NOT EXISTS feed_in_price numeric;