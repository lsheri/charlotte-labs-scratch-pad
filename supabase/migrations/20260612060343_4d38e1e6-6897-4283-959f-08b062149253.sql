-- Add shared_proof flag for opt-in public proof card sharing
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS shared_proof boolean NOT NULL DEFAULT false;

-- Public read of renderings when the receipt has been opted in for sharing
DROP POLICY IF EXISTS "public read shared proof renderings" ON public.renderings;
CREATE POLICY "public read shared proof renderings"
ON public.renderings
FOR SELECT
TO anon, authenticated
USING (
  receipt_id IN (
    SELECT id FROM public.receipts WHERE shared_proof = true
  )
);

-- Public read of minimal receipt fields for shared proof cards
DROP POLICY IF EXISTS "public read shared proof receipt" ON public.receipts;
CREATE POLICY "public read shared proof receipt"
ON public.receipts
FOR SELECT
TO anon, authenticated
USING (shared_proof = true);

GRANT SELECT ON public.renderings TO anon;
GRANT SELECT ON public.receipts TO anon;