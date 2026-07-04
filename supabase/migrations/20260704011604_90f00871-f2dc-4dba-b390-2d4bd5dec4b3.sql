
-- 1. metadata on research_sessions
ALTER TABLE public.research_sessions
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS research_sessions_metadata_kind_idx
  ON public.research_sessions ((metadata->>'kind'));

-- 2. class_assignments
CREATE TABLE IF NOT EXISTS public.class_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.research_sessions(id) ON DELETE CASCADE,
  code text NOT NULL,
  title text NOT NULL,
  description text,
  due_at timestamptz,
  expected_tools text[] NOT NULL DEFAULT ARRAY[]::text[],
  rubric jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_assignments TO authenticated;
GRANT ALL ON public.class_assignments TO service_role;
ALTER TABLE public.class_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "class members read assignments"
  ON public.class_assignments FOR SELECT TO authenticated
  USING (public.is_session_participant(session_id) OR public.owns_session(session_id));

CREATE POLICY "class owner writes assignments"
  ON public.class_assignments FOR INSERT TO authenticated
  WITH CHECK (public.owns_session(session_id));

CREATE POLICY "class owner updates assignments"
  ON public.class_assignments FOR UPDATE TO authenticated
  USING (public.owns_session(session_id))
  WITH CHECK (public.owns_session(session_id));

CREATE POLICY "class owner deletes assignments"
  ON public.class_assignments FOR DELETE TO authenticated
  USING (public.owns_session(session_id));

CREATE TRIGGER class_assignments_updated_at
  BEFORE UPDATE ON public.class_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. assignment_submissions
CREATE TABLE IF NOT EXISTS public.assignment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.class_assignments(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receipt_id uuid REFERENCES public.receipts(id) ON DELETE SET NULL,
  notes text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, participant_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assignment_submissions TO authenticated;
GRANT ALL ON public.assignment_submissions TO service_role;
ALTER TABLE public.assignment_submissions ENABLE ROW LEVEL SECURITY;

-- Members of the class can read all submissions for that class.
CREATE POLICY "class members read submissions"
  ON public.assignment_submissions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.class_assignments a
      WHERE a.id = assignment_id
        AND (public.is_session_participant(a.session_id) OR public.owns_session(a.session_id))
    )
  );

CREATE POLICY "student inserts own submission"
  ON public.assignment_submissions FOR INSERT TO authenticated
  WITH CHECK (
    participant_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.class_assignments a
      WHERE a.id = assignment_id AND public.is_session_participant(a.session_id)
    )
  );

CREATE POLICY "student updates own submission"
  ON public.assignment_submissions FOR UPDATE TO authenticated
  USING (participant_id = auth.uid())
  WITH CHECK (participant_id = auth.uid());

CREATE POLICY "student deletes own submission"
  ON public.assignment_submissions FOR DELETE TO authenticated
  USING (participant_id = auth.uid());

CREATE POLICY "class owner deletes any submission"
  ON public.assignment_submissions FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.class_assignments a WHERE a.id = assignment_id AND public.owns_session(a.session_id))
  );

CREATE TRIGGER assignment_submissions_updated_at
  BEFORE UPDATE ON public.assignment_submissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Seed ECON201 workspace + owner membership (idempotent)
DO $$
DECLARE
  _owner uuid := 'a91960da-15ef-4afa-8b1e-92d454681862';
  _sid uuid;
BEGIN
  SELECT id INTO _sid FROM public.research_sessions WHERE join_code = 'ECON201' LIMIT 1;
  IF _sid IS NULL THEN
    INSERT INTO public.research_sessions
      (researcher_id, name, description, join_code, consent_text, status, kind, metadata)
    VALUES (
      _owner,
      'Principles of Microeconomics — ECON201',
      'ECON201 class workspace. Class-wide tools, fluency, and assignments.',
      'ECON201',
      'By joining ECON201 you agree to share your captured AI workflows with your instructor and classmates for coursework review.',
      'active',
      'research',
      jsonb_build_object('kind','class','course_code','ECON201','term','Spring 2026')
    )
    RETURNING id INTO _sid;
  ELSE
    UPDATE public.research_sessions
      SET metadata = metadata || jsonb_build_object('kind','class','course_code','ECON201','term','Spring 2026')
      WHERE id = _sid;
  END IF;

  INSERT INTO public.session_participants (session_id, participant_id, consent_accepted_at)
  VALUES (_sid, _owner, now())
  ON CONFLICT DO NOTHING;
END $$;
