ALTER TABLE public.workflow_templates
  ADD CONSTRAINT fk_workflow_templates_owner
  FOREIGN KEY (owner_id)
  REFERENCES auth.users(id)
  ON DELETE CASCADE;