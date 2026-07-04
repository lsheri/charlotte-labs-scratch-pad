
CREATE TABLE public.ai_provider_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  label TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  status TEXT NOT NULL CHECK (status IN ('ok','fallback','error','content_filter')),
  http_status INT,
  attempts INT,
  latency_ms INT,
  error_message TEXT,
  receipt_id UUID,
  participant_id UUID
);

CREATE INDEX idx_ai_provider_events_created_at ON public.ai_provider_events (created_at DESC);
CREATE INDEX idx_ai_provider_events_status ON public.ai_provider_events (status);

ALTER TABLE public.ai_provider_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view AI provider events"
ON public.ai_provider_events
FOR SELECT
USING (public.has_role(auth.uid(), 'admin'::app_role));
