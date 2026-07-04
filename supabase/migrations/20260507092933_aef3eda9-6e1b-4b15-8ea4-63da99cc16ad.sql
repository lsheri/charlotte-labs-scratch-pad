
CREATE TABLE public.chat_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id uuid NOT NULL,
  session_id uuid NOT NULL,
  tool text NOT NULL,
  thread_key text NOT NULL,
  title text,
  last_url text,
  first_captured_at timestamptz NOT NULL DEFAULT now(),
  last_captured_at timestamptz NOT NULL DEFAULT now(),
  turn_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (participant_id, tool, thread_key)
);
CREATE INDEX idx_chat_threads_participant ON public.chat_threads(participant_id, last_captured_at DESC);
CREATE INDEX idx_chat_threads_session ON public.chat_threads(session_id);
ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants manage own threads" ON public.chat_threads FOR ALL TO authenticated
  USING (participant_id = auth.uid()) WITH CHECK (participant_id = auth.uid());
CREATE POLICY "Researchers read threads in own sessions" ON public.chat_threads FOR SELECT TO authenticated
  USING (public.owns_session(session_id));
CREATE POLICY "Admins read all chat_threads" ON public.chat_threads FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

ALTER TABLE public.ai_conversations
  ADD COLUMN thread_id uuid,
  ADD COLUMN transcript_hash text;
CREATE INDEX idx_ai_conv_thread ON public.ai_conversations(thread_id, captured_at DESC);

-- Backfill: compute per-row thread_key first, then aggregate
WITH keyed AS (
  SELECT
    id, participant_id, session_id, tool, title, url, captured_at, created_at,
    COALESCE(NULLIF(lower(regexp_replace(url, '\?.*$', '')), ''), 'manual:' || id::text) AS thread_key
  FROM public.ai_conversations
)
INSERT INTO public.chat_threads (
  participant_id, session_id, tool, thread_key, title, last_url,
  first_captured_at, last_captured_at, turn_count, created_at
)
SELECT
  participant_id,
  (array_agg(session_id ORDER BY captured_at DESC))[1],
  tool,
  thread_key,
  (array_agg(title ORDER BY captured_at DESC))[1],
  (array_agg(url ORDER BY captured_at DESC))[1],
  min(captured_at), max(captured_at), count(*)::int, min(created_at)
FROM keyed
GROUP BY participant_id, tool, thread_key
ON CONFLICT (participant_id, tool, thread_key) DO NOTHING;

UPDATE public.ai_conversations c
SET thread_id = t.id
FROM public.chat_threads t
WHERE t.participant_id = c.participant_id
  AND t.tool = c.tool
  AND t.thread_key = COALESCE(NULLIF(lower(regexp_replace(c.url, '\?.*$', '')), ''), 'manual:' || c.id::text)
  AND c.thread_id IS NULL;

ALTER TABLE public.receipts ALTER COLUMN conversation_id DROP NOT NULL;

CREATE TABLE public.receipt_threads (
  receipt_id uuid NOT NULL,
  thread_id uuid NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (receipt_id, thread_id)
);
CREATE INDEX idx_receipt_threads_thread ON public.receipt_threads(thread_id);
ALTER TABLE public.receipt_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants manage own receipt_threads" ON public.receipt_threads FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.receipts r WHERE r.id = receipt_id AND r.participant_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.receipts r WHERE r.id = receipt_id AND r.participant_id = auth.uid()));
CREATE POLICY "Researchers read receipt_threads in own sessions" ON public.receipt_threads FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.receipts r WHERE r.id = receipt_id AND public.owns_session(r.session_id)));
CREATE POLICY "Admins read all receipt_threads" ON public.receipt_threads FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.receipt_threads (receipt_id, thread_id, position)
SELECT r.id, c.thread_id, 0
FROM public.receipts r
JOIN public.ai_conversations c ON c.id = r.conversation_id
WHERE c.thread_id IS NOT NULL
ON CONFLICT DO NOTHING;
