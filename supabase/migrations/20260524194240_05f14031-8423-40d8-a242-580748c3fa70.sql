CREATE OR REPLACE FUNCTION public.enforce_receipt_metadata_quality()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  wt TEXT;
  pv TEXT;
  ps TEXT;
BEGIN
  wt := NEW.metadata->>'workflowType';
  pv := NEW.metadata->>'provenance';
  ps := NEW.metadata->>'provenanceSource';

  IF wt IS NULL OR wt NOT IN (
    'app','code','document','spreadsheet','creative','other',
    'communication','brainstorm','research','plan','presentation','study','data-analysis','custom'
  ) THEN
    RAISE EXCEPTION 'receipts.metadata.workflowType is required and must be a known workflow type (got %)', COALESCE(wt,'NULL');
  END IF;

  IF pv IS NULL OR pv NOT IN ('lab','personal') THEN
    RAISE EXCEPTION 'receipts.metadata.provenance is required and must be lab|personal (got %)', COALESCE(pv,'NULL');
  END IF;

  IF ps IS NULL OR ps NOT IN ('auto_session','user','admin_verified') THEN
    RAISE EXCEPTION 'receipts.metadata.provenanceSource is required and must be auto_session|user|admin_verified (got %)', COALESCE(ps,'NULL');
  END IF;

  RETURN NEW;
END;
$function$;

-- Reset the two stuck jobs so the sweeper/kick picks them up.
UPDATE public.receipt_jobs
SET status='queued', attempts=0, error=NULL, retry_after=NULL,
    progress_label='Re-queued after metadata-validation fix',
    updated_at=now()
WHERE id IN (
  'cb2d645a-f840-4fc2-bddf-6df1a7ae7eac',
  'e40fd6a1-b2f5-4418-a2d5-530833e00011'
);