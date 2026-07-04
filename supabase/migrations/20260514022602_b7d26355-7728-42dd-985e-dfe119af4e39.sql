
CREATE TABLE public.admin_receipt_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL,
  admin_user_id uuid NOT NULL,
  action text NOT NULL,
  before_value jsonb,
  after_value jsonb,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_receipt_decisions_receipt ON public.admin_receipt_decisions (receipt_id, created_at DESC);
CREATE INDEX idx_admin_receipt_decisions_admin ON public.admin_receipt_decisions (admin_user_id, created_at DESC);

ALTER TABLE public.admin_receipt_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read all admin_receipt_decisions"
  ON public.admin_receipt_decisions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins insert admin_receipt_decisions"
  ON public.admin_receipt_decisions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) AND admin_user_id = auth.uid());
