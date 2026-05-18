ALTER TABLE public.pv_system_config
  ADD COLUMN IF NOT EXISTS manual_calibration numeric,
  ADD COLUMN IF NOT EXISTS calibration_smoothing_alpha numeric DEFAULT 0.1;