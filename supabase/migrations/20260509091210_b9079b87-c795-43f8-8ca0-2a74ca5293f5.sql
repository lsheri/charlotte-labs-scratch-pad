
ALTER TABLE public.receipt_jobs
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS receipt_jobs_touch_updated_at ON public.receipt_jobs;
CREATE TRIGGER receipt_jobs_touch_updated_at
BEFORE UPDATE ON public.receipt_jobs
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();
