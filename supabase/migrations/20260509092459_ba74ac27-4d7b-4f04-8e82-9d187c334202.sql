ALTER TABLE public.receipt_jobs
  ADD COLUMN IF NOT EXISTS retry_after timestamptz;

CREATE INDEX IF NOT EXISTS idx_receipt_jobs_retry_after
  ON public.receipt_jobs (status, retry_after)
  WHERE status = 'rate_limited';