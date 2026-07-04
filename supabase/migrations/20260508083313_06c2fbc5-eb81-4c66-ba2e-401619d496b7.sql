ALTER TABLE public.receipt_jobs
  ADD COLUMN IF NOT EXISTS provenance text,
  ADD COLUMN IF NOT EXISTS provenance_source text;

ALTER TABLE public.workflow_templates
  ADD COLUMN IF NOT EXISTS provenance text;