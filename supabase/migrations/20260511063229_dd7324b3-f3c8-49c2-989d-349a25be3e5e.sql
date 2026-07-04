
ALTER TABLE public.chat_threads
  ADD COLUMN IF NOT EXISTS last_summarized_turn_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS summary_refresh_count_today integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS summary_refresh_day date;

CREATE TABLE IF NOT EXISTS public.thread_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL,
  conversation_id uuid,
  participant_id uuid NOT NULL,
  session_id uuid,
  kind text NOT NULL CHECK (kind IN ('summarize','extract_features')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','processing','completed','failed','rate_limited','dead_letter')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  retry_after timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS thread_jobs_active_unique
  ON public.thread_jobs (thread_id, kind)
  WHERE status IN ('queued','processing');

CREATE INDEX IF NOT EXISTS thread_jobs_status_retry_idx
  ON public.thread_jobs (status, retry_after);

CREATE INDEX IF NOT EXISTS thread_jobs_participant_created_idx
  ON public.thread_jobs (participant_id, created_at DESC);

ALTER TABLE public.thread_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read all thread_jobs" ON public.thread_jobs;
CREATE POLICY "Admins read all thread_jobs"
  ON public.thread_jobs FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Participants read own thread_jobs" ON public.thread_jobs;
CREATE POLICY "Participants read own thread_jobs"
  ON public.thread_jobs FOR SELECT TO authenticated
  USING (participant_id = auth.uid());

DROP TRIGGER IF EXISTS thread_jobs_set_updated_at ON public.thread_jobs;
CREATE TRIGGER thread_jobs_set_updated_at
  BEFORE UPDATE ON public.thread_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
