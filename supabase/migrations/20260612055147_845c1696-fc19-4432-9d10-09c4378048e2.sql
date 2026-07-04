
-- 1. Admin feature flag on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS template_picker_enabled boolean NOT NULL DEFAULT false;

-- 2. Receipt templates catalog
CREATE TABLE IF NOT EXISTS public.receipt_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key          text UNIQUE NOT NULL,
  name         text NOT NULL,
  audience     text NOT NULL CHECK (audience IN ('student','employee','all')),
  promise      text NOT NULL,
  best_for     text,
  phase        integer NOT NULL DEFAULT 1,
  status       text NOT NULL DEFAULT 'live' CHECK (status IN ('live','beta','hidden')),
  sort_order   integer NOT NULL DEFAULT 0
);
GRANT SELECT ON public.receipt_templates TO authenticated;
GRANT ALL ON public.receipt_templates TO service_role;
ALTER TABLE public.receipt_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "templates readable by authenticated"
  ON public.receipt_templates FOR SELECT
  TO authenticated USING (true);

INSERT INTO public.receipt_templates (key, name, audience, promise, best_for, phase, status, sort_order) VALUES
  ('classic_fluency',  'Classic Fluency',    'all',      'Your full 8-dimension fluency analysis.',                                   'Detailed deep-dive',           1, 'live', 0),
  ('still_yours',      'Still Yours',        'student',  'See how much of this thinking is still yours.',                             'Understanding your contribution', 1, 'live', 1),
  ('thinking_map',     'Thinking Map',       'student',  'Your whole session as a map: every branch, every judgment, every loop.',   'Visual learners',              1, 'beta', 2),
  ('proof_card',       'Proof Card',         'student',  'Turn one session into shareable proof of judgment.',                       'Career artifacts',             2, 'hidden', 3),
  ('class_pulse',      'Class Pulse',        'student',  'See where you land this week, anonymously.',                                'Class sections with 8+ members', 2, 'hidden', 4),
  ('shield',           'Shield',             'employee', 'Prove your work was verified before it shipped.',                           'High-stakes deliverables',     3, 'hidden', 5),
  ('impact_statement', 'Impact Statement',   'employee', 'Your AI-driven impact, review-ready, with receipts behind every claim.',   'Performance review prep',      3, 'hidden', 6),
  ('ledger',           'Ledger',             'employee', 'What each deliverable actually cost, and where the loops are.',             'Efficiency tracking',          3, 'hidden', 7),
  ('defense_board',    'Defense Board',      'student',  'Present your process in 90 seconds, backed by the full transcript.',       'Assignment submission',        4, 'hidden', 8),
  ('distiller',        'Distiller',          'employee', 'Turn a 90 turn session into a workflow a colleague can run tomorrow.',     'Knowledge handoff',            4, 'hidden', 9),
  ('decision_trail',   'Decision Trail',     'employee', 'Every consequential call on this deliverable, with the road not taken still visible.', 'Audit and postmortem', 4, 'hidden', 10)
ON CONFLICT (key) DO NOTHING;

-- 3. Renderings cache
CREATE TABLE IF NOT EXISTS public.renderings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id    uuid NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
  template_key  text NOT NULL,
  payload       jsonb NOT NULL DEFAULT '{}',
  generation_ms integer,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(receipt_id, template_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.renderings TO authenticated;
GRANT ALL ON public.renderings TO service_role;
ALTER TABLE public.renderings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner read own renderings"
  ON public.renderings FOR SELECT
  USING (receipt_id IN (SELECT id FROM public.receipts WHERE participant_id = auth.uid()));
CREATE POLICY "owner insert own renderings"
  ON public.renderings FOR INSERT
  WITH CHECK (receipt_id IN (SELECT id FROM public.receipts WHERE participant_id = auth.uid()));
CREATE POLICY "owner update own renderings"
  ON public.renderings FOR UPDATE
  USING (receipt_id IN (SELECT id FROM public.receipts WHERE participant_id = auth.uid()));

-- 4. Template events
CREATE TABLE IF NOT EXISTS public.template_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  template_key text NOT NULL,
  event        text NOT NULL CHECK (event IN ('impression','select','complete','dwell','export','share','rerun')),
  receipt_id   uuid REFERENCES public.receipts(id) ON DELETE SET NULL,
  metadata     jsonb DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.template_events TO authenticated;
GRANT ALL ON public.template_events TO service_role;
ALTER TABLE public.template_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "insert own events"
  ON public.template_events FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "read own events"
  ON public.template_events FOR SELECT
  USING (user_id = auth.uid());

-- 5. Analysis events
CREATE TABLE IF NOT EXISTS public.analysis_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id    uuid NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
  turn_index    integer NOT NULL,
  event_type    text NOT NULL CHECK (event_type IN ('user_prompt','ai_output','judgment_moment','verification_event','loop_member','artifact')),
  evidence_quote text,
  token_count   integer,
  ts            timestamptz,
  inferred      boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analysis_events TO authenticated;
GRANT ALL ON public.analysis_events TO service_role;
ALTER TABLE public.analysis_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner read analysis events"
  ON public.analysis_events FOR SELECT
  USING (receipt_id IN (SELECT id FROM public.receipts WHERE participant_id = auth.uid()));
