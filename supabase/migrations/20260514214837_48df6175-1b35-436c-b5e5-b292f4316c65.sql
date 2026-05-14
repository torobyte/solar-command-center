
ALTER TABLE public.branding_settings
  ADD COLUMN IF NOT EXISTS logo_url_dark text,
  ADD COLUMN IF NOT EXISTS favicon_url_dark text,
  ADD COLUMN IF NOT EXISTS pwa_icon_192_dark text,
  ADD COLUMN IF NOT EXISTS pwa_icon_512_dark text,
  ADD COLUMN IF NOT EXISTS primary_color_dark text DEFAULT '#fbbf24',
  ADD COLUMN IF NOT EXISTS primary_foreground_dark text DEFAULT '#0a0a0a',
  ADD COLUMN IF NOT EXISTS accent_color_dark text DEFAULT '#fbbf24',
  ADD COLUMN IF NOT EXISTS background_color_dark text DEFAULT '#0a0a0a',
  ADD COLUMN IF NOT EXISTS foreground_color_dark text DEFAULT '#fafafa',
  ADD COLUMN IF NOT EXISTS card_color_dark text DEFAULT '#171717',
  ADD COLUMN IF NOT EXISTS muted_color_dark text DEFAULT '#262626',
  ADD COLUMN IF NOT EXISTS border_color_dark text DEFAULT '#262626',
  ADD COLUMN IF NOT EXISTS success_color_dark text DEFAULT '#22c55e',
  ADD COLUMN IF NOT EXISTS warning_color_dark text DEFAULT '#f59e0b',
  ADD COLUMN IF NOT EXISTS destructive_color_dark text DEFAULT '#ef4444',
  ADD COLUMN IF NOT EXISTS pwa_theme_color_dark text DEFAULT '#0a0a0a',
  ADD COLUMN IF NOT EXISTS pwa_background_color_dark text DEFAULT '#0a0a0a';

-- Update default light values to be light-friendly
UPDATE public.branding_settings
SET background_color = COALESCE(background_color, '#ffffff'),
    foreground_color = COALESCE(foreground_color, '#0a0a0a'),
    card_color = COALESCE(card_color, '#ffffff'),
    muted_color = COALESCE(muted_color, '#f5f5f5'),
    border_color = COALESCE(border_color, '#e5e5e5')
WHERE key = 'global';
