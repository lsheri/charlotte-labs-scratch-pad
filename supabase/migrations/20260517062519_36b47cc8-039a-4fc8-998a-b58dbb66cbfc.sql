ALTER TABLE public.participant_fluency_history
  ADD COLUMN IF NOT EXISTS provenance text;

-- Backfill from the linked receipt's metadata.provenance
UPDATE public.participant_fluency_history h
SET provenance = COALESCE(r.metadata->>'provenance', 'personal')
FROM public.receipts r
WHERE h.receipt_id = r.id
  AND h.provenance IS NULL;

-- Any orphans default to personal
UPDATE public.participant_fluency_history
SET provenance = 'personal'
WHERE provenance IS NULL;

-- Enforce going forward
ALTER TABLE public.participant_fluency_history
  ALTER COLUMN provenance SET DEFAULT 'personal';

ALTER TABLE public.participant_fluency_history
  ADD CONSTRAINT participant_fluency_history_provenance_chk
  CHECK (provenance IN ('lab','personal'));

CREATE INDEX IF NOT EXISTS idx_pfh_participant_provenance
  ON public.participant_fluency_history (participant_id, provenance, created_at DESC);