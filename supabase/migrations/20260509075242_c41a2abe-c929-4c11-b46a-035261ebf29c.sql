ALTER TABLE public.team_outreach
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'outreach',
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS viewport TEXT;

CREATE INDEX IF NOT EXISTS idx_team_outreach_kind ON public.team_outreach (kind);