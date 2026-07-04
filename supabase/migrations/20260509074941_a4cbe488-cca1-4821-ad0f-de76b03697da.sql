CREATE TABLE public.team_outreach (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  reason TEXT NOT NULL,
  message TEXT,
  page_url TEXT,
  referrer TEXT,
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.team_outreach ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read team_outreach"
ON public.team_outreach
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX idx_team_outreach_created_at ON public.team_outreach (created_at DESC);