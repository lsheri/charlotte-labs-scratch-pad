-- Remove old cron job (hardcoded preview URL + hardcoded apikey)
DO $$
DECLARE existing_jobid bigint;
BEGIN
  SELECT jobid INTO existing_jobid FROM cron.job WHERE jobname = 'researcher-weekly-digest';
  IF existing_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(existing_jobid);
  END IF;
END $$;

-- Re-create pointing to production domain. The shared secret is read from a
-- Postgres GUC at run-time (set out-of-band via:
--   ALTER DATABASE postgres SET app.cron_secret = '<value>';
-- ). Never hardcode the secret in the migration.
SELECT cron.schedule(
  'researcher-weekly-digest',
  '0 9 * * 1',
  $cron$
  SELECT net.http_post(
    url := 'https://charlotte-labs.com/api/public/cron/researcher-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.cron_secret', true)
    ),
    body := jsonb_build_object('source', 'pg_cron')
  );
  $cron$
);