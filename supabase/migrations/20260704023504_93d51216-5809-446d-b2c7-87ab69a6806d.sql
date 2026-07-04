ALTER TABLE public.assignment_submissions
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.assignment_submissions.metadata IS
  'Free-form JSON. Currently stores { templateKeys: string[] } — which receipt templates the student chose to include in this submission. Additive; safe to extend.';