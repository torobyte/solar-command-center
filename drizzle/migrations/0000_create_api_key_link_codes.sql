CREATE TABLE public.api_key_link_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  api_key_id uuid NOT NULL REFERENCES public.user_api_keys(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  consumed_at timestamptz,
  consumed_by_ip text,
  label text
);

CREATE INDEX idx_api_key_link_codes_key ON public.api_key_link_codes(api_key_id);
CREATE INDEX idx_api_key_link_codes_expires ON public.api_key_link_codes(expires_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_key_link_codes TO authenticated;
GRANT ALL ON public.api_key_link_codes TO service_role;

ALTER TABLE public.api_key_link_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own link codes"
ON public.api_key_link_codes
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);