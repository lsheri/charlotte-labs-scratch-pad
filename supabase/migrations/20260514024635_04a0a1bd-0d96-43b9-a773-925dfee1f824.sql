
-- Enforce required metadata on NEW receipts only.
-- Existing rows are not touched (no backfill, no constraint over historical data).
CREATE OR REPLACE FUNCTION public.enforce_receipt_metadata_quality()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  wt TEXT;
  pv TEXT;
  ps TEXT;
BEGIN
  wt := NEW.metadata->>'workflowType';
  pv := NEW.metadata->>'provenance';
  ps := NEW.metadata->>'provenanceSource';

  IF wt IS NULL OR wt NOT IN ('app','code','document','spreadsheet','creative','other') THEN
    RAISE EXCEPTION 'receipts.metadata.workflowType is required and must be one of app|code|document|spreadsheet|creative|other (got %)', COALESCE(wt,'NULL');
  END IF;

  IF pv IS NULL OR pv NOT IN ('lab','personal') THEN
    RAISE EXCEPTION 'receipts.metadata.provenance is required and must be lab|personal (got %)', COALESCE(pv,'NULL');
  END IF;

  IF ps IS NULL OR ps NOT IN ('auto_session','user','admin_verified') THEN
    RAISE EXCEPTION 'receipts.metadata.provenanceSource is required and must be auto_session|user|admin_verified (got %)', COALESCE(ps,'NULL');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_receipt_metadata_quality ON public.receipts;
CREATE TRIGGER trg_enforce_receipt_metadata_quality
  BEFORE INSERT ON public.receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_receipt_metadata_quality();

-- Same forward-only rule on receipt_jobs at enqueue time so bad jobs never
-- reach the worker.
CREATE OR REPLACE FUNCTION public.enforce_receipt_job_quality()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.workflow_type IS NULL OR NEW.workflow_type NOT IN ('app','code','document','spreadsheet','creative','other') THEN
    RAISE EXCEPTION 'receipt_jobs.workflow_type is required (got %)', COALESCE(NEW.workflow_type,'NULL');
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

DROP TRIGGER IF EXISTS trg_enforce_receipt_job_quality ON public.receipt_jobs;
CREATE TRIGGER trg_enforce_receipt_job_quality
  BEFORE INSERT ON public.receipt_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_receipt_job_quality();
