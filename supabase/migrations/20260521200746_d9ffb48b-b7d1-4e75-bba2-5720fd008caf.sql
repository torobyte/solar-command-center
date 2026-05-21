ALTER TABLE public.branding_settings
  ADD COLUMN IF NOT EXISTS login_bg_url text,
  ADD COLUMN IF NOT EXISTS login_bg_url_dark text,
  ADD COLUMN IF NOT EXISTS login_bg_overlay numeric NOT NULL DEFAULT 0.55;