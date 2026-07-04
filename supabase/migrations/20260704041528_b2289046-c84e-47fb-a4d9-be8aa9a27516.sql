DROP POLICY IF EXISTS template_analyses_select_via_receipt ON public.template_analyses;

CREATE POLICY template_analyses_select_via_receipt
ON public.template_analyses
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.receipts r
    WHERE r.id = template_analyses.receipt_id
      AND (r.participant_id = auth.uid() OR public.owns_session(r.session_id))
  )
);