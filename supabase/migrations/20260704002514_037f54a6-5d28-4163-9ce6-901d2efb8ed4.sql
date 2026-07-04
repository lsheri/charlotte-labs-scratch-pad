
CREATE TYPE public.checklist_item_status AS ENUM ('open', 'verified', 'dismissed');

CREATE TABLE public.receipt_checklist_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  receipt_id UUID NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
  template_key TEXT NOT NULL,
  item_key TEXT NOT NULL,
  status public.checklist_item_status NOT NULL DEFAULT 'open',
  resolved_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (receipt_id, template_key, item_key)
);

CREATE INDEX idx_receipt_checklist_items_receipt ON public.receipt_checklist_items(receipt_id);
CREATE INDEX idx_receipt_checklist_items_status ON public.receipt_checklist_items(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.receipt_checklist_items TO authenticated;
GRANT ALL ON public.receipt_checklist_items TO service_role;

ALTER TABLE public.receipt_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage checklist items on their own receipts"
ON public.receipt_checklist_items
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.receipts r
    WHERE r.id = receipt_checklist_items.receipt_id
      AND r.participant_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.receipts r
    WHERE r.id = receipt_checklist_items.receipt_id
      AND r.participant_id = auth.uid()
  )
);

CREATE TRIGGER trg_receipt_checklist_items_updated_at
BEFORE UPDATE ON public.receipt_checklist_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
