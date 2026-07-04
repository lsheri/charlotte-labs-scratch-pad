
-- Per-user fingerprint tour cache
CREATE TABLE public.checkup_cache (
  user_id uuid PRIMARY KEY,
  receipts_fingerprint text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
ALTER TABLE public.checkup_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own checkup_cache" ON public.checkup_cache
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own checkup_cache" ON public.checkup_cache
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users update own checkup_cache" ON public.checkup_cache
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete own checkup_cache" ON public.checkup_cache
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX idx_checkup_cache_expires ON public.checkup_cache(expires_at);

-- Per-receipt walkthrough cache
CREATE TABLE public.receipt_checkup_cache (
  receipt_id uuid PRIMARY KEY,
  fingerprint text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
ALTER TABLE public.receipt_checkup_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own receipt_checkup_cache" ON public.receipt_checkup_cache
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.receipts r WHERE r.id = receipt_checkup_cache.receipt_id AND r.participant_id = auth.uid())
  );
CREATE POLICY "Users insert own receipt_checkup_cache" ON public.receipt_checkup_cache
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.receipts r WHERE r.id = receipt_checkup_cache.receipt_id AND r.participant_id = auth.uid())
  );
CREATE POLICY "Users update own receipt_checkup_cache" ON public.receipt_checkup_cache
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.receipts r WHERE r.id = receipt_checkup_cache.receipt_id AND r.participant_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.receipts r WHERE r.id = receipt_checkup_cache.receipt_id AND r.participant_id = auth.uid())
  );
CREATE POLICY "Users delete own receipt_checkup_cache" ON public.receipt_checkup_cache
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.receipts r WHERE r.id = receipt_checkup_cache.receipt_id AND r.participant_id = auth.uid())
  );

CREATE INDEX idx_receipt_checkup_cache_expires ON public.receipt_checkup_cache(expires_at);
