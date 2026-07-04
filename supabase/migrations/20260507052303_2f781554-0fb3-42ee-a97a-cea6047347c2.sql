
-- Withdrawal tracking
ALTER TABLE public.session_participants
  ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz;

CREATE INDEX IF NOT EXISTS session_participants_withdrawn_idx
  ON public.session_participants (participant_id) WHERE withdrawn_at IS NOT NULL;

-- Ensure pg_cron + pg_net available (may already be enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule weekly researcher digest (Mon 09:00 UTC)
DO $$
DECLARE existing_jobid bigint;
BEGIN
  SELECT jobid INTO existing_jobid FROM cron.job WHERE jobname = 'researcher-weekly-digest';
  IF existing_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(existing_jobid);
  END IF;

  PERFORM cron.schedule(
    'researcher-weekly-digest',
    '0 9 * * 1',
    $cron$
    SELECT net.http_post(
      url := 'https://project--587b3636-dac3-4081-bfb6-e7028ae194bd.lovable.app/api/public/cron/researcher-digest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhybHp1ZGN4c2pkZHFqaWlhZWNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxMTE1MzksImV4cCI6MjA5MzY4NzUzOX0.X_MezT49vaXN0r-kLybJHa4XiK5O11PUP4pWXlxX5bI'
      ),
      body := jsonb_build_object('source', 'pg_cron')
    );
    $cron$
  );
END $$;
