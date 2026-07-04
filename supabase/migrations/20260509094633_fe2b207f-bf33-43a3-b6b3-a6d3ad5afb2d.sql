CREATE TABLE IF NOT EXISTS public.cron_heartbeats (
  job_name text PRIMARY KEY,
  last_run_at timestamptz NOT NULL DEFAULT now(),
  last_status text NOT NULL DEFAULT 'ok',
  last_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cron_heartbeats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read cron_heartbeats"
  ON public.cron_heartbeats FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER cron_heartbeats_touch_updated_at
  BEFORE UPDATE ON public.cron_heartbeats
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
