-- Ensure full row payloads are delivered for realtime updates
ALTER TABLE public.telemetry_samples REPLICA IDENTITY FULL;
ALTER TABLE public.sites REPLICA IDENTITY FULL;

-- Add tables to the realtime publication (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='telemetry_samples'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.telemetry_samples';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='sites'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.sites';
  END IF;
END $$;