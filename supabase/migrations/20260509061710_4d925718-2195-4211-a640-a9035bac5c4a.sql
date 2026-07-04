ALTER TABLE public.receipt_jobs ADD COLUMN IF NOT EXISTS goal text;
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS goal text;

UPDATE public.framework_sources
SET
  content_snapshot_text = 'Anthropic AI Fluency Index (February 2026) — Key findings from 9,830 multi-turn Claude.ai conversations, 11 behavioral classifiers:
Finding 1 — Iteration is the master multiplier. 85.7% of conversations showed iteration. Iterating conversations showed 2.67x more total fluency behaviors, were 5.6x more likely to question model reasoning, and 4x more likely to identify missing context.
Finding 2 — Polished outputs suppress evaluation. In artifact-producing conversations (code, documents, tools), Direction and Delegation behaviors increase significantly, but Discernment drops: -5.2pp on identifying missing context, -3.1pp on questioning reasoning. The more finished the output looks, the less students scrutinize it.
Finding 3 — Collaboration terms are almost never set. Only 30% of conversations include any instruction about how the user wants the AI to interact. This is the lowest-frequency behavior in the dataset.',
  version_label = 'february_2026'
WHERE source_id = 'a629d5b2-1aa7-4a47-907f-04d345702653';

CREATE TABLE IF NOT EXISTS public.receipt_recommendations_cache (
  receipt_id uuid PRIMARY KEY,
  fingerprint text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
ALTER TABLE public.receipt_recommendations_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own receipt_recommendations_cache"
  ON public.receipt_recommendations_cache FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.receipts r
    WHERE r.id = receipt_recommendations_cache.receipt_id
      AND r.participant_id = auth.uid()
  ));
CREATE POLICY "Users insert own receipt_recommendations_cache"
  ON public.receipt_recommendations_cache FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.receipts r
    WHERE r.id = receipt_recommendations_cache.receipt_id
      AND r.participant_id = auth.uid()
  ));
CREATE POLICY "Users update own receipt_recommendations_cache"
  ON public.receipt_recommendations_cache FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.receipts r
    WHERE r.id = receipt_recommendations_cache.receipt_id
      AND r.participant_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.receipts r
    WHERE r.id = receipt_recommendations_cache.receipt_id
      AND r.participant_id = auth.uid()
  ));
CREATE POLICY "Users delete own receipt_recommendations_cache"
  ON public.receipt_recommendations_cache FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.receipts r
    WHERE r.id = receipt_recommendations_cache.receipt_id
      AND r.participant_id = auth.uid()
  ));
CREATE INDEX IF NOT EXISTS idx_receipt_recommendations_cache_expires
  ON public.receipt_recommendations_cache(expires_at);