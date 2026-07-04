
-- Step 1: Enums
DO $$ BEGIN
  CREATE TYPE tool_id_enum AS ENUM ('chatgpt','copilot','claude','gemini','grammarly','midjourney','perplexity','custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE task_type_enum AS ENUM ('essay','coding','data_analysis','research','creative','exam','reflection','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE feature_taxonomy_enum AS ENUM ('text_chat','code_interpreter','web_search','image_generation','image_analysis','voice_input','voice_output','file_upload','canvas_artifact','custom_gpt_project','api_integration','reasoning_mode');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Step 2: Add nullable columns to conversation_turns
ALTER TABLE public.conversation_turns ADD COLUMN IF NOT EXISTS sent_at timestamptz;
ALTER TABLE public.conversation_turns ADD COLUMN IF NOT EXISTS pause_before_ms integer;

-- Step 3: New tables

-- participant_baseline
CREATE TABLE IF NOT EXISTS public.participant_baseline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  c1_quiz_total integer,
  c1_quiz_tier text CHECK (c1_quiz_tier IN ('high','mid','low')),
  c1_quiz_completed_at timestamptz,
  discipline text,
  year_of_study integer,
  prior_ai_tool_use text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_participant_baseline_participant_id ON public.participant_baseline(participant_id);
ALTER TABLE public.participant_baseline ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users read own participant_baseline" ON public.participant_baseline FOR SELECT TO authenticated USING (participant_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Users insert own participant_baseline" ON public.participant_baseline FOR INSERT TO authenticated WITH CHECK (participant_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins manage all participant_baseline" ON public.participant_baseline FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- tool_feature_inventory
CREATE TABLE IF NOT EXISTS public.tool_feature_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id tool_id_enum NOT NULL,
  period text NOT NULL,
  available_features feature_taxonomy_enum[],
  configurable_settings_count integer,
  supports_projects boolean,
  supports_custom_instructions boolean,
  supports_model_switch boolean,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tool_id, period)
);
ALTER TABLE public.tool_feature_inventory ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Authenticated users read tool_feature_inventory" ON public.tool_feature_inventory FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins manage tool_feature_inventory" ON public.tool_feature_inventory FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- participant_tool_history
CREATE TABLE IF NOT EXISTS public.participant_tool_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool tool_id_enum NOT NULL,
  first_use_date timestamptz,
  session_count integer NOT NULL DEFAULT 0,
  receipt_count integer NOT NULL DEFAULT 0,
  is_established boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(participant_id, tool)
);
CREATE INDEX IF NOT EXISTS idx_participant_tool_history_participant_id ON public.participant_tool_history(participant_id);
ALTER TABLE public.participant_tool_history ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users read own participant_tool_history" ON public.participant_tool_history FOR SELECT TO authenticated USING (participant_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Users insert own participant_tool_history" ON public.participant_tool_history FOR INSERT TO authenticated WITH CHECK (participant_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Users update own participant_tool_history" ON public.participant_tool_history FOR UPDATE TO authenticated USING (participant_id = auth.uid()) WITH CHECK (participant_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins read all participant_tool_history" ON public.participant_tool_history FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- prompt_features
CREATE TABLE IF NOT EXISTS public.prompt_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turn_id uuid REFERENCES public.conversation_turns(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid,
  thread_id uuid,
  tool tool_id_enum,
  sent_at timestamptz,
  receipt_id uuid,
  prompt_position integer,
  is_first_prompt_in_session boolean,
  is_first_substantive_prompt boolean,
  is_last_three_prompts boolean,
  word_count integer,
  char_length integer,
  template_suspected boolean,
  c3_goal_clarity_score integer CHECK (c3_goal_clarity_score BETWEEN 0 AND 2),
  c3_format_spec_detected boolean,
  c3_exemplar_detected boolean,
  c4_role_directive_detected boolean,
  c4_collaboration_term_detected boolean,
  c4_settings_toggle_count integer,
  c5_challenge_detected boolean,
  c10_clarification_detected boolean,
  c11_planning_element_score integer CHECK (c11_planning_element_score BETWEEN 0 AND 5),
  c12_synthesis_detected boolean,
  c14_attribution_detected boolean,
  is_personal_context boolean,
  c16_meta_prompt_detected boolean,
  meta_prompt_type text CHECK (meta_prompt_type IN ('probing','authoring','configuring')),
  chain_id uuid,
  chain_position integer,
  chain_type text,
  prior_assistant_turn_id uuid,
  semantic_drift_from_prior float,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prompt_features_participant_id ON public.prompt_features(participant_id);
CREATE INDEX IF NOT EXISTS idx_prompt_features_turn_id ON public.prompt_features(turn_id);
CREATE INDEX IF NOT EXISTS idx_prompt_features_receipt_id ON public.prompt_features(receipt_id);
ALTER TABLE public.prompt_features ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users read own prompt_features" ON public.prompt_features FOR SELECT TO authenticated USING (participant_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins read all prompt_features" ON public.prompt_features FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Researchers read prompt_features in own sessions" ON public.prompt_features FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.research_sessions rs
      JOIN public.session_participants sp ON sp.session_id = rs.id
      WHERE rs.researcher_id = auth.uid()
        AND sp.session_id = prompt_features.session_id
        AND sp.participant_id = prompt_features.participant_id
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- prompt_chains
CREATE TABLE IF NOT EXISTS public.prompt_chains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid,
  receipt_id uuid,
  thread_id uuid,
  tool tool_id_enum,
  chain_type text CHECK (chain_type IN ('refinement','challenge','decomposition','pivot','loop','acceptance','new_topic')),
  turn_ids uuid[],
  prompt_feature_ids uuid[],
  prompt_count integer,
  span_ms integer,
  avg_structure_score float,
  structure_score_trend text CHECK (structure_score_trend IN ('improving','declining','flat','insufficient_data')),
  max_semantic_drift float,
  resolution_type text CHECK (resolution_type IN ('accepted','pivoted','abandoned','continued')),
  first_occurrence_for_participant boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prompt_chains_participant_id ON public.prompt_chains(participant_id);
CREATE INDEX IF NOT EXISTS idx_prompt_chains_receipt_id ON public.prompt_chains(receipt_id);
ALTER TABLE public.prompt_chains ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users read own prompt_chains" ON public.prompt_chains FOR SELECT TO authenticated USING (participant_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins read all prompt_chains" ON public.prompt_chains FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- receipt_construct_signals
CREATE TABLE IF NOT EXISTS public.receipt_construct_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid,
  tool tool_id_enum,
  task_type task_type_enum,
  c3_avg_goal_clarity float,
  c3_format_spec_rate float,
  c3_exemplar_rate float,
  c3_iteration_rate float,
  c3_structure_trend text CHECK (c3_structure_trend IN ('improving','flat','declining')),
  c3_insufficient boolean,
  c4_role_directive_count integer,
  c4_role_directive_rate float,
  c4_collaboration_term_count integer,
  c4_settings_toggle_count integer,
  c5_challenge_count integer,
  c5_challenge_rate float,
  c9_tools_used_count integer,
  c9_tool_is_new boolean,
  c10_clarification_count integer,
  c10_clarification_rate float,
  c10_extended_pause_rate float,
  c11_mean_structure_score float,
  c11_insufficient boolean,
  c12_synthesis_rate float,
  c12_receipt_reflection_count integer,
  c14_attribution_rate float,
  c16_meta_count integer,
  c16_meta_rate float,
  total_prompt_count integer,
  total_chain_count integer,
  loop_chain_count integer,
  refinement_chain_count integer,
  challenge_chain_count integer,
  pivot_chain_count integer,
  dominant_chain_type text,
  session_duration_ms integer,
  prerequisite_missing boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(receipt_id)
);
CREATE INDEX IF NOT EXISTS idx_receipt_construct_signals_participant_id ON public.receipt_construct_signals(participant_id);
CREATE INDEX IF NOT EXISTS idx_receipt_construct_signals_receipt_id ON public.receipt_construct_signals(receipt_id);
ALTER TABLE public.receipt_construct_signals ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users read own receipt_construct_signals" ON public.receipt_construct_signals FOR SELECT TO authenticated USING (participant_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins read all receipt_construct_signals" ON public.receipt_construct_signals FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Researchers read construct signals in own sessions" ON public.receipt_construct_signals FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.research_sessions rs WHERE rs.researcher_id = auth.uid() AND rs.id = receipt_construct_signals.session_id)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- participant_fluency_profiles
CREATE TABLE IF NOT EXISTS public.participant_fluency_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  term_id text NOT NULL,
  direction_score_term float,
  delegation_score_term float,
  discernment_score_term float,
  development_score_term float,
  ethics_score_term float,
  efficiency_score_term float,
  strategic_agency_score_term float,
  capital_stewardship_score_term float,
  direction_score_profile float DEFAULT 3.0,
  delegation_score_profile float DEFAULT 3.0,
  discernment_score_profile float DEFAULT 3.0,
  development_score_profile float DEFAULT 3.0,
  ethics_score_profile float DEFAULT 3.0,
  efficiency_score_profile float DEFAULT 3.0,
  strategic_agency_score_profile float DEFAULT 3.0,
  direction_confidence float DEFAULT 0.0,
  delegation_confidence float DEFAULT 0.0,
  discernment_confidence float DEFAULT 0.0,
  development_confidence float DEFAULT 0.0,
  ethics_confidence float DEFAULT 0.0,
  efficiency_confidence float DEFAULT 0.0,
  strategic_agency_confidence float DEFAULT 0.0,
  receipt_count_term integer NOT NULL DEFAULT 0,
  receipt_count_total integer NOT NULL DEFAULT 0,
  last_receipt_id uuid,
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(participant_id, session_id, term_id)
);
CREATE INDEX IF NOT EXISTS idx_participant_fluency_profiles_participant_id ON public.participant_fluency_profiles(participant_id);
ALTER TABLE public.participant_fluency_profiles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Users read own participant_fluency_profiles" ON public.participant_fluency_profiles FOR SELECT TO authenticated USING (participant_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins read all participant_fluency_profiles" ON public.participant_fluency_profiles FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Researchers read profiles in own sessions" ON public.participant_fluency_profiles FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.research_sessions rs WHERE rs.researcher_id = auth.uid() AND rs.id = participant_fluency_profiles.session_id)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Step 4: dimension_construct_map + seed
CREATE TABLE IF NOT EXISTS public.dimension_construct_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension_canonical_name text NOT NULL,
  construct_id text NOT NULL,
  construct_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('primary','supporting','inverse')),
  weight float NOT NULL DEFAULT 1.0,
  is_inverse boolean NOT NULL DEFAULT false,
  v1_status text NOT NULL CHECK (v1_status IN ('active','blocked','future','stage_1_required')),
  UNIQUE(dimension_canonical_name, construct_id)
);
ALTER TABLE public.dimension_construct_map ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Authenticated users read dimension_construct_map" ON public.dimension_construct_map FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Admins manage dimension_construct_map" ON public.dimension_construct_map FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO public.dimension_construct_map (dimension_canonical_name, construct_id, construct_name, role, weight, is_inverse, v1_status) VALUES
  ('direction','C3','Procedural Prompting Skill','primary',1.0,false,'active'),
  ('direction','C4','In-Session Control','primary',0.8,false,'active'),
  ('direction','C11','Metacognitive Planning','supporting',0.5,false,'active'),
  ('direction','C2','Conditional/Strategic Knowledge','primary',1.0,false,'blocked'),
  ('delegation','C2','Conditional/Strategic Knowledge','primary',1.0,false,'blocked'),
  ('delegation','C13','Over-Reliance','primary',1.0,true,'blocked'),
  ('delegation','C15','Verification Ownership','supporting',0.5,false,'blocked'),
  ('discernment','C5','Critical Evaluation','primary',1.0,false,'active'),
  ('discernment','C10','Comprehension Monitoring','supporting',0.6,false,'active'),
  ('discernment','C6','Verification/Cross-Referencing','primary',1.0,false,'future'),
  ('development','C7','Adaptive Strategy Revision','primary',1.0,false,'stage_1_required'),
  ('development','C12','Metacognitive Reflection','primary',1.0,false,'active'),
  ('development','C8','Cross-Tool Transfer','supporting',0.6,false,'stage_1_required'),
  ('development','C9','Continuous-Learning Disposition','supporting',0.4,false,'active'),
  ('ethics','C14','Ethical Reasoning','primary',1.0,false,'active'),
  ('ethics','C15','Verification Ownership','supporting',0.5,false,'blocked'),
  ('efficiency','C16','System Scaffolding','primary',1.0,false,'active'),
  ('strategic_agency','C16','System Scaffolding','supporting',0.6,false,'active')
ON CONFLICT (dimension_canonical_name, construct_id) DO NOTHING;
