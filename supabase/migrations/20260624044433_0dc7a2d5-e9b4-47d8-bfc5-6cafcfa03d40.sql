
CREATE TABLE public.template_demo_feedback (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receipt_id UUID NOT NULL,
  template_key TEXT NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('up','down')),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX template_demo_feedback_template_key_idx ON public.template_demo_feedback (template_key);
CREATE INDEX template_demo_feedback_user_id_idx ON public.template_demo_feedback (user_id);

GRANT SELECT, INSERT ON public.template_demo_feedback TO authenticated;
GRANT ALL ON public.template_demo_feedback TO service_role;

ALTER TABLE public.template_demo_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own demo feedback"
  ON public.template_demo_feedback FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read their own demo feedback"
  ON public.template_demo_feedback FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can read all demo feedback"
  ON public.template_demo_feedback FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
