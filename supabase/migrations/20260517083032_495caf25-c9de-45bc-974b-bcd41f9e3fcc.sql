
-- Allow expanded primary type set + new optional fields for extras/custom
ALTER TABLE public.receipt_jobs
  ADD COLUMN IF NOT EXISTS workflow_type_extras text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS workflow_type_custom text;

CREATE OR REPLACE FUNCTION public.enforce_receipt_job_quality()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.workflow_type IS NULL OR NEW.workflow_type NOT IN (
    'app','code','document','spreadsheet','creative','other',
    'communication','brainstorm','research','plan','presentation','study','data-analysis','custom'
  ) THEN
    RAISE EXCEPTION 'receipt_jobs.workflow_type is required and must be a known type (got %)', COALESCE(NEW.workflow_type,'NULL');
  END IF;
  IF NEW.workflow_type = 'custom' AND (NEW.workflow_type_custom IS NULL OR length(trim(NEW.workflow_type_custom)) = 0) THEN
    RAISE EXCEPTION 'receipt_jobs.workflow_type_custom is required when workflow_type = custom';
  END IF;
  IF array_length(NEW.workflow_type_extras, 1) > 2 THEN
    RAISE EXCEPTION 'receipt_jobs.workflow_type_extras supports at most 2 entries';
  END IF;
  IF NEW.provenance IS NULL OR NEW.provenance NOT IN ('lab','personal') THEN
    RAISE EXCEPTION 'receipt_jobs.provenance is required (got %)', COALESCE(NEW.provenance,'NULL');
  END IF;
  IF NEW.provenance_source IS NULL OR NEW.provenance_source NOT IN ('auto_session','user','admin_verified') THEN
    RAISE EXCEPTION 'receipt_jobs.provenance_source is required (got %)', COALESCE(NEW.provenance_source,'NULL');
  END IF;
  RETURN NEW;
END;
$$;
