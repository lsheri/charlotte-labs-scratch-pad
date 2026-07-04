-- Flip template picker flag for the second liam account
UPDATE public.profiles
SET template_picker_enabled = true
WHERE id IN (
  SELECT id FROM auth.users WHERE email = 'liamsheridan7@gmail.com'
);

-- ===========================================================
-- Narrow demo-receipt read access for ALL authenticated users.
-- Scoped exclusively to receipt id b3d04504-ee3e-4800-a91e-0de198d64b1a.
-- Nothing else is exposed.
-- ===========================================================

DO $$
DECLARE
  demo_id constant uuid := 'b3d04504-ee3e-4800-a91e-0de198d64b1a';
BEGIN
  -- receipts: expose the demo receipt to authenticated users (read-only)
  EXECUTE format($f$
    CREATE POLICY "Demo receipt is readable by all authenticated"
    ON public.receipts FOR SELECT TO authenticated
    USING (id = %L)
  $f$, demo_id);

  -- receipt_threads
  EXECUTE format($f$
    CREATE POLICY "Demo receipt_threads readable by all authenticated"
    ON public.receipt_threads FOR SELECT TO authenticated
    USING (receipt_id = %L)
  $f$, demo_id);

  -- receipt_jobs
  EXECUTE format($f$
    CREATE POLICY "Demo receipt_jobs readable by all authenticated"
    ON public.receipt_jobs FOR SELECT TO authenticated
    USING (receipt_id = %L)
  $f$, demo_id);

  -- fluency_analysis_runs
  EXECUTE format($f$
    CREATE POLICY "Demo fluency_analysis_runs readable by all authenticated"
    ON public.fluency_analysis_runs FOR SELECT TO authenticated
    USING (receipt_id = %L)
  $f$, demo_id);

  -- prompt_features
  EXECUTE format($f$
    CREATE POLICY "Demo prompt_features readable by all authenticated"
    ON public.prompt_features FOR SELECT TO authenticated
    USING (receipt_id = %L)
  $f$, demo_id);

  -- prompt_chains
  EXECUTE format($f$
    CREATE POLICY "Demo prompt_chains readable by all authenticated"
    ON public.prompt_chains FOR SELECT TO authenticated
    USING (receipt_id = %L)
  $f$, demo_id);

  -- receipt_construct_signals
  EXECUTE format($f$
    CREATE POLICY "Demo receipt_construct_signals readable by all authenticated"
    ON public.receipt_construct_signals FOR SELECT TO authenticated
    USING (receipt_id = %L)
  $f$, demo_id);

  -- renderings (read-only — demo views never persist new rows)
  EXECUTE format($f$
    CREATE POLICY "Demo renderings readable by all authenticated"
    ON public.renderings FOR SELECT TO authenticated
    USING (receipt_id = %L)
  $f$, demo_id);
END$$;

-- chat_threads + conversation_turns are fetched server-side via the admin
-- client in the demo server function, so no RLS changes needed for them.