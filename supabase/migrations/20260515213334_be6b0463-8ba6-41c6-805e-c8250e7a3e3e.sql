ALTER TABLE public.inverter_specs
  ADD COLUMN IF NOT EXISTS max_ac_charge_current numeric,
  ADD COLUMN IF NOT EXISTS max_charge_current numeric,
  ADD COLUMN IF NOT EXISTS output_source_priority text,
  ADD COLUMN IF NOT EXISTS charger_source_priority text,
  ADD COLUMN IF NOT EXISTS battery_type text,
  ADD COLUMN IF NOT EXISTS input_voltage_range text;