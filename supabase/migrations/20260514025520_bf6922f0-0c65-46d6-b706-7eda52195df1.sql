
-- Immutable log of non-receipt admin actions (identity reveals, dataset
-- exports, batch verifications). Anything that touches PII or produces a
-- shareable artifact must land here so a customer/IRB audit can be answered.
CREATE TABLE IF NOT EXISTS public.admin_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  action text NOT NULL,
  target_user_id uuid,
  target_resource text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_access_log_admin ON public.admin_access_log(admin_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_access_log_target ON public.admin_access_log(target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_access_log_action ON public.admin_access_log(action, created_at DESC);

ALTER TABLE public.admin_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read admin_access_log"
  ON public.admin_access_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins insert admin_access_log"
  ON public.admin_access_log FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND admin_user_id = auth.uid()
  );

-- No UPDATE/DELETE policies — append-only.

-- Defense-in-depth: enforce the 4-per-24h workflow cap at the DB layer too.
-- The app already enforces it but a misbehaving extension or direct API
-- caller could otherwise burst-submit. This makes the cap unbypassable.
CREATE OR REPLACE FUNCTION public.enforce_receipt_job_daily_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  recent_count INT;
  DAILY_LIMIT CONSTANT INT := 4;
BEGIN
  SELECT count(*) INTO recent_count
  FROM public.receipt_jobs
  WHERE participant_id = NEW.participant_id
    AND created_at >= now() - interval '24 hours';

  IF recent_count >= DAILY_LIMIT THEN
    RAISE EXCEPTION 'Daily workflow generation limit reached (% per 24h)', DAILY_LIMIT
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_receipt_job_daily_cap ON public.receipt_jobs;
CREATE TRIGGER trg_enforce_receipt_job_daily_cap
  BEFORE INSERT ON public.receipt_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_receipt_job_daily_cap();
