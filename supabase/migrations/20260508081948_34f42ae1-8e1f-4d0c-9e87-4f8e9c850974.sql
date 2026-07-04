
-- Add tag/purpose carry-through to receipt_jobs
ALTER TABLE public.receipt_jobs ADD COLUMN IF NOT EXISTS tags text[];
ALTER TABLE public.receipt_jobs ADD COLUMN IF NOT EXISTS purpose text;

-- Workflow Templates
CREATE TABLE IF NOT EXISTS public.workflow_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  source_receipt_id uuid,
  name text NOT NULL,
  workflow_type text NOT NULL DEFAULT 'other',
  tool_sequence text[] NOT NULL DEFAULT '{}',
  tags text[] NOT NULL DEFAULT '{}',
  purpose text,
  notes text,
  is_shared boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_templates_owner ON public.workflow_templates (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_templates_source ON public.workflow_templates (source_receipt_id);

ALTER TABLE public.workflow_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage own templates" ON public.workflow_templates
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Admins read all templates" ON public.workflow_templates
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Researchers read shared templates from their sessions" ON public.workflow_templates
  FOR SELECT TO authenticated
  USING (
    is_shared = true
    AND source_receipt_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.receipts r
      WHERE r.id = workflow_templates.source_receipt_id
        AND owns_session(r.session_id)
    )
  );

CREATE TRIGGER trg_workflow_templates_updated
  BEFORE UPDATE ON public.workflow_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- GIN index on receipts.metadata to keep tag/purpose/workflowType filtering fast
CREATE INDEX IF NOT EXISTS idx_receipts_metadata_gin ON public.receipts USING gin (metadata jsonb_path_ops);
