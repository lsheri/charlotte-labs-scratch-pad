
-- Enums
CREATE TYPE public.source_type_enum AS ENUM ('canonical', 'supplemental');
CREATE TYPE public.dimension_category_enum AS ENUM ('anthropic_4d', 'unesco_students', 'unesco_teachers', 'oecd', 'charlotte_overlay', 'ailiteracy');
CREATE TYPE public.framework_origin_enum AS ENUM ('anthropic', 'charlotte', 'unesco', 'oecd', 'ailiteracy');
CREATE TYPE public.input_type_enum AS ENUM ('transcript', 'receipt_only', 'aggregate_only');
CREATE TYPE public.redaction_level_enum AS ENUM ('none', 'minimal', 'strong');

-- updated_at helper (reuse if exists)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ============================================
-- Reference: framework_sources
-- ============================================
CREATE TABLE public.framework_sources (
  source_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  organization TEXT NOT NULL,
  url TEXT NOT NULL,
  source_type public.source_type_enum NOT NULL DEFAULT 'canonical',
  retrieved_at TIMESTAMPTZ,
  content_snapshot_text TEXT,
  content_hash TEXT,
  version_label TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.framework_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authed read framework_sources" ON public.framework_sources
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Researchers manage framework_sources" ON public.framework_sources
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'researcher'))
  WITH CHECK (public.has_role(auth.uid(), 'researcher'));

-- ============================================
-- Reference: dimension_registry
-- ============================================
CREATE TABLE public.dimension_registry (
  dimension_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  category public.dimension_category_enum NOT NULL,
  source_ids UUID[] NOT NULL DEFAULT '{}',
  priority_rank INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.dimension_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authed read dimension_registry" ON public.dimension_registry
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Researchers manage dimension_registry" ON public.dimension_registry
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'researcher'))
  WITH CHECK (public.has_role(auth.uid(), 'researcher'));

-- ============================================
-- Reference: crosswalk_mappings
-- ============================================
CREATE TABLE public.crosswalk_mappings (
  mapping_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_dimension_id UUID NOT NULL REFERENCES public.dimension_registry(dimension_id) ON DELETE CASCADE,
  to_framework public.framework_origin_enum NOT NULL,
  to_term TEXT NOT NULL,
  to_term_level TEXT,
  source_id UUID NOT NULL REFERENCES public.framework_sources(source_id) ON DELETE CASCADE,
  confidence FLOAT NOT NULL DEFAULT 0.5,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.crosswalk_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authed read crosswalk_mappings" ON public.crosswalk_mappings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Researchers manage crosswalk_mappings" ON public.crosswalk_mappings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'researcher'))
  WITH CHECK (public.has_role(auth.uid(), 'researcher'));

-- ============================================
-- Reference: behavior_library
-- ============================================
CREATE TABLE public.behavior_library (
  behavior_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  behavior_code TEXT NOT NULL UNIQUE,
  behavior_label TEXT NOT NULL,
  dimension_id UUID NOT NULL REFERENCES public.dimension_registry(dimension_id) ON DELETE CASCADE,
  framework_origin public.framework_origin_enum NOT NULL,
  detection_rules TEXT,
  reflection_prompts JSONB DEFAULT '[]'::jsonb,
  source_id UUID NOT NULL REFERENCES public.framework_sources(source_id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.behavior_library ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authed read behavior_library" ON public.behavior_library
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Researchers manage behavior_library" ON public.behavior_library
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'researcher'))
  WITH CHECK (public.has_role(auth.uid(), 'researcher'));

-- ============================================
-- Reference: system_prompt_templates
-- ============================================
CREATE TABLE public.system_prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  prompt_text TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.system_prompt_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authed read system_prompt_templates" ON public.system_prompt_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Researchers manage system_prompt_templates" ON public.system_prompt_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'researcher'))
  WITH CHECK (public.has_role(auth.uid(), 'researcher'));
CREATE TRIGGER update_system_prompt_templates_updated_at
  BEFORE UPDATE ON public.system_prompt_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- receipts (conversation captures, scoped to session+participant)
-- ============================================
CREATE TABLE public.receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.research_sessions(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL,
  conversation_id UUID REFERENCES public.ai_conversations(id) ON DELETE SET NULL,
  tool_used TEXT NOT NULL CHECK (tool_used IN ('chatgpt','claude','gemini','copilot','perplexity','lovable','other')),
  conversation_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  prompt_preview TEXT,
  response_preview TEXT,
  time_spent_minutes INTEGER,
  quality_scores JSONB DEFAULT '{}'::jsonb,
  quality_passed BOOLEAN,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants manage own receipts" ON public.receipts
  FOR ALL TO authenticated
  USING (participant_id = auth.uid())
  WITH CHECK (participant_id = auth.uid());
CREATE POLICY "Researchers read receipts in own sessions" ON public.receipts
  FOR SELECT TO authenticated USING (public.owns_session(session_id));
CREATE INDEX receipts_session_idx ON public.receipts(session_id);
CREATE INDEX receipts_participant_idx ON public.receipts(participant_id);
CREATE TRIGGER update_receipts_updated_at
  BEFORE UPDATE ON public.receipts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- fluency_analysis_runs (scoped to session+participant)
-- ============================================
CREATE TABLE public.fluency_analysis_runs (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  session_id UUID NOT NULL REFERENCES public.research_sessions(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL,
  receipt_id UUID REFERENCES public.receipts(id) ON DELETE SET NULL,
  input_type public.input_type_enum NOT NULL DEFAULT 'transcript',
  tool_metadata JSONB DEFAULT '{}'::jsonb,
  analysis_output_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  overall_confidence FLOAT,
  privacy_flags JSONB DEFAULT '{}'::jsonb,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.fluency_analysis_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants read own fluency runs" ON public.fluency_analysis_runs
  FOR SELECT TO authenticated USING (participant_id = auth.uid());
CREATE POLICY "Researchers read fluency runs in own sessions" ON public.fluency_analysis_runs
  FOR SELECT TO authenticated USING (public.owns_session(session_id));
CREATE POLICY "Participants insert own fluency runs" ON public.fluency_analysis_runs
  FOR INSERT TO authenticated WITH CHECK (participant_id = auth.uid());
CREATE INDEX fluency_runs_session_idx ON public.fluency_analysis_runs(session_id);
CREATE INDEX fluency_runs_participant_idx ON public.fluency_analysis_runs(participant_id);

-- ============================================
-- fluency_receipts (rendered output)
-- ============================================
CREATE TABLE public.fluency_receipts (
  receipt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.fluency_analysis_runs(run_id) ON DELETE CASCADE,
  rendered_summary TEXT,
  rendered_json JSONB DEFAULT '{}'::jsonb,
  citations JSONB DEFAULT '[]'::jsonb,
  redaction_level public.redaction_level_enum NOT NULL DEFAULT 'minimal',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.fluency_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read fluency_receipts via run access" ON public.fluency_receipts
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.fluency_analysis_runs r
            WHERE r.run_id = fluency_receipts.run_id
              AND (r.participant_id = auth.uid() OR public.owns_session(r.session_id)))
  );
CREATE POLICY "Insert fluency_receipts via own run" ON public.fluency_receipts
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.fluency_analysis_runs r
            WHERE r.run_id = fluency_receipts.run_id
              AND r.participant_id = auth.uid())
  );
