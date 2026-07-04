-- Tier 1: rubric versioning
ALTER TABLE public.fluency_analysis_runs
  ADD COLUMN IF NOT EXISTS rubric_version text NOT NULL DEFAULT 'v1';

CREATE INDEX IF NOT EXISTS idx_fluency_runs_rubric_version
  ON public.fluency_analysis_runs(rubric_version);

-- Tier 2: append-only fluency history (one snapshot per receipt)
CREATE TABLE IF NOT EXISTS public.participant_fluency_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id uuid NOT NULL,
  session_id uuid NOT NULL,
  receipt_id uuid NOT NULL,
  term_id text NOT NULL,
  rubric_version text NOT NULL DEFAULT 'v1',

  -- Post-receipt overall (cross-term) profile scores
  direction_score_profile double precision,
  delegation_score_profile double precision,
  discernment_score_profile double precision,
  development_score_profile double precision,
  ethics_score_profile double precision,
  efficiency_score_profile double precision,
  strategic_agency_score_profile double precision,

  -- Confidences at the time of this snapshot
  direction_confidence double precision,
  delegation_confidence double precision,
  discernment_confidence double precision,
  development_confidence double precision,
  ethics_confidence double precision,
  efficiency_confidence double precision,
  strategic_agency_confidence double precision,

  receipt_count_total integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT participant_fluency_history_receipt_unique UNIQUE (receipt_id)
);

CREATE INDEX IF NOT EXISTS idx_pfh_participant_created
  ON public.participant_fluency_history(participant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pfh_session
  ON public.participant_fluency_history(session_id);
CREATE INDEX IF NOT EXISTS idx_pfh_rubric_version
  ON public.participant_fluency_history(rubric_version);

ALTER TABLE public.participant_fluency_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own participant_fluency_history"
  ON public.participant_fluency_history
  FOR SELECT
  TO authenticated
  USING (participant_id = auth.uid());

CREATE POLICY "Researchers read history in own sessions"
  ON public.participant_fluency_history
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.research_sessions rs
    WHERE rs.id = participant_fluency_history.session_id
      AND rs.researcher_id = auth.uid()
  ));

CREATE POLICY "Admins read all participant_fluency_history"
  ON public.participant_fluency_history
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));