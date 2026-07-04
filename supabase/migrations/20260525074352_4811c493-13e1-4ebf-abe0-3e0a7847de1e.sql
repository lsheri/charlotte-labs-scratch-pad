
ALTER TABLE public.receipt_jobs
  ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS bucket text,
  ADD COLUMN IF NOT EXISTS chunks_total integer,
  ADD COLUMN IF NOT EXISTS chunks_done integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS eta_seconds integer;

CREATE INDEX IF NOT EXISTS idx_receipt_jobs_stage ON public.receipt_jobs (stage);

CREATE TABLE IF NOT EXISTS public.fluency_chunk_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.receipt_jobs(id) ON DELETE CASCADE,
  chunk_idx integer NOT NULL,
  chunk_total integer NOT NULL,
  analysis_json jsonb,
  summary_text text,
  attempt integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (job_id, chunk_idx)
);

CREATE INDEX IF NOT EXISTS idx_fluency_chunk_results_job ON public.fluency_chunk_results (job_id);

ALTER TABLE public.fluency_chunk_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read fluency_chunk_results"
  ON public.fluency_chunk_results
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
