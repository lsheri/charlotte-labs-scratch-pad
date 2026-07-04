
CREATE TABLE public.receipt_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  thread_ids uuid[] NOT NULL DEFAULT '{}',
  receipt_id uuid,
  label text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.receipt_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants manage own receipt_jobs"
  ON public.receipt_jobs FOR ALL TO authenticated
  USING (participant_id = auth.uid())
  WITH CHECK (participant_id = auth.uid());

CREATE POLICY "Admins read all receipt_jobs"
  ON public.receipt_jobs FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_receipt_jobs_participant ON public.receipt_jobs(participant_id, created_at DESC);

CREATE TRIGGER receipt_jobs_set_updated_at
  BEFORE UPDATE ON public.receipt_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
