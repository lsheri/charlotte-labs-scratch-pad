
-- Mapping table so a student can tie their threads to assignments before generating a receipt.
CREATE TABLE public.assignment_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.class_assignments(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mapped_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, thread_id)
);

GRANT SELECT, INSERT, DELETE ON public.assignment_threads TO authenticated;
GRANT ALL ON public.assignment_threads TO service_role;

ALTER TABLE public.assignment_threads ENABLE ROW LEVEL SECURITY;

-- Students see & manage their own mappings, only within classes they belong to.
CREATE POLICY "Participants read own mappings"
  ON public.assignment_threads FOR SELECT
  TO authenticated
  USING (
    participant_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.class_assignments a
      WHERE a.id = assignment_threads.assignment_id
        AND public.is_session_participant(a.session_id)
    )
  );

CREATE POLICY "Participants create own mappings"
  ON public.assignment_threads FOR INSERT
  TO authenticated
  WITH CHECK (
    participant_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.class_assignments a
      WHERE a.id = assignment_threads.assignment_id
        AND public.is_session_participant(a.session_id)
    )
  );

CREATE POLICY "Participants delete own mappings"
  ON public.assignment_threads FOR DELETE
  TO authenticated
  USING (participant_id = auth.uid());

-- Instructor/owner of the class can read all mappings for their assignments.
CREATE POLICY "Class owner reads mappings"
  ON public.assignment_threads FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.class_assignments a
      WHERE a.id = assignment_threads.assignment_id
        AND public.owns_session(a.session_id)
    )
  );

CREATE INDEX assignment_threads_participant_idx
  ON public.assignment_threads (participant_id, assignment_id);
CREATE INDEX assignment_threads_thread_idx
  ON public.assignment_threads (thread_id);
