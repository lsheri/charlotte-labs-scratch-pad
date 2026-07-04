-- ============================================================
-- 1. Audit columns on fluency_analysis_runs
-- ============================================================
ALTER TABLE public.fluency_analysis_runs
  ADD COLUMN IF NOT EXISTS transcript_hash text,
  ADD COLUMN IF NOT EXISTS subject_type text NOT NULL DEFAULT 'student',
  ADD COLUMN IF NOT EXISTS receipt_profile text NOT NULL DEFAULT 'player',
  ADD COLUMN IF NOT EXISTS transcript_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_source text,
  ADD COLUMN IF NOT EXISTS raw_transcript text;

CREATE INDEX IF NOT EXISTS idx_fluency_runs_transcript_hash
  ON public.fluency_analysis_runs(transcript_hash) WHERE transcript_hash IS NOT NULL;

-- ============================================================
-- 2. Seed framework_sources (10 canonical sources)
-- Note: framework_sources.url is NOT unique in our schema; we dedupe by source_id
-- ============================================================
INSERT INTO public.framework_sources (source_id, name, organization, url, source_type, version_label, notes, content_snapshot_text)
VALUES
  ('a629d5b2-1aa7-4a47-907f-04d345702653', 'Anthropic AI Fluency Index (4D + 24 behaviors)', 'Anthropic', 'https://www.anthropic.com/research/AI-fluency-index', 'canonical', 'initial_2026-02-26', 'Anthropic four-dimension fluency index', NULL),
  ('6e4cecad-121b-42e7-a69e-d5232590ef77', 'UNESCO AI competency framework for students (2024)', 'UNESCO', 'https://www.unesco.org/en/articles/ai-competency-framework-students', 'canonical', 'initial_2026-02-26', 'UNESCO student framework', NULL),
  ('b8944fd9-88d5-4ad4-888f-1e6cb5abe3ab', 'UNESCO AI competency framework for teachers (2024)', 'UNESCO', 'https://www.unesco.org/en/uuid/node/ab2e2aae-3d01-4472-bccc-a2266c9212e2', 'canonical', 'initial_2026-02-26', 'UNESCO teacher framework', NULL),
  ('23e53983-958c-4c5f-b456-529963dbf49b', 'OECD Digital Education Outlook 2026 (GenAI in education)', 'OECD', 'https://www.oecd.org/en/publications/oecd-digital-education-outlook-2026_062a7394-en.html', 'canonical', 'initial_2026-02-26', 'OECD GenAI outlook', NULL),
  ('ac04e84e-536d-4627-9971-edacddb49130', 'OECD PISA 2029 Media & Artificial Intelligence Literacy (MAIL)', 'OECD', 'https://www.oecd-ilibrary.org/en/about/projects/pisa-2029-media-and-artificial-intelligence-literacy.html', 'canonical', 'initial_2026-02-26', 'OECD MAIL framework', NULL),
  ('38fee4c8-72cd-45b2-88d4-ffbef28c4f4c', 'AI Literacy Framework initiative (OECD/EC)', 'AILit/OECD/EC', 'https://ailiteracyframework.org/', 'canonical', 'initial_2026-02-26', 'AI Literacy Framework hub', NULL),
  ('07721f54-b921-45ce-91c2-a4a155434e1a', 'The Problem - Charlotte 3.0', 'Charlotte Labs', 'internal://the-problem-charlotte-3.0', 'canonical', NULL, 'Internal Charlotte Labs document', 'Internal Charlotte Labs document.'),
  ('b560d49e-20bd-4760-872d-b8ce7dfaa10c', 'Charlotte Labs Business Model Canvas', 'Charlotte Labs', 'internal://business-model-canvas', 'canonical', NULL, 'Internal Charlotte Labs document', 'Internal Charlotte Labs document.'),
  ('033a38f2-8322-4dfd-9bcd-483d4cb6bd1c', 'Charlotte Labs - 3 Assignment Research Study', 'Charlotte Labs', 'internal://research-study-ai-visible', 'canonical', NULL, 'Internal Charlotte Labs document', 'Internal Charlotte Labs document.'),
  ('2ec4832e-58e5-4122-a72f-4cf8059a8979', 'How I Work and Prompt', 'Charlotte Labs', 'internal://how-i-work-and-prompt', 'canonical', NULL, 'Internal Charlotte Labs document', 'Internal Charlotte Labs document.')
ON CONFLICT (source_id) DO NOTHING;

-- ============================================================
-- 3. Seed dimension_registry (8 dimensions)
-- Note: our category column is USER-DEFINED enum; we cast text and rely on existing values
-- ============================================================
INSERT INTO public.dimension_registry (dimension_id, canonical_name, display_name, description, category, source_ids, priority_rank)
VALUES
  ('fa6d5566-dd40-402c-a4bf-9187dca9d570', 'direction', 'Direction', 'Ability to clearly articulate goals, set context, and guide AI toward intended outcomes.', 'anthropic_4d', ARRAY['a629d5b2-1aa7-4a47-907f-04d345702653']::uuid[], 1),
  ('e7e70027-9c19-4930-a444-cba522e190f0', 'delegation', 'Delegation', 'Skill in determining what to hand off to AI vs. retain, managing task boundaries effectively.', 'anthropic_4d', ARRAY['a629d5b2-1aa7-4a47-907f-04d345702653']::uuid[], 2),
  ('c170021f-a3c5-4031-b7cf-cfc52bd502f9', 'discernment', 'Discernment', 'Critical evaluation of AI outputs for accuracy, bias, and appropriateness.', 'anthropic_4d', ARRAY['a629d5b2-1aa7-4a47-907f-04d345702653']::uuid[], 3),
  ('84345eeb-a5d9-4ccb-a0fd-93695eeaf22a', 'development', 'Development', 'Continuous learning and adaptation of AI collaboration practices over time.', 'anthropic_4d', ARRAY['a629d5b2-1aa7-4a47-907f-04d345702653']::uuid[], 4),
  ('252e65f0-c841-495f-885e-4f24366174bb', 'ethics_data_responsibility', 'Ethics & Data Responsibility', 'Responsible use of AI including data privacy, consent, bias awareness, and ethical considerations.', 'charlotte_overlay', ARRAY['6e4cecad-121b-42e7-a69e-d5232590ef77','b8944fd9-88d5-4ad4-888f-1e6cb5abe3ab','23e53983-958c-4c5f-b456-529963dbf49b','ac04e84e-536d-4627-9971-edacddb49130']::uuid[], 5),
  ('e0536651-fff7-4d15-9252-7cc9f4db3a85', 'efficiency_leverage', 'Efficiency & Leverage', 'Maximizing productivity gains (10x leverage) through strategic AI tool usage and workflow optimization.', 'charlotte_overlay', ARRAY['23e53983-958c-4c5f-b456-529963dbf49b','ac04e84e-536d-4627-9971-edacddb49130','07721f54-b921-45ce-91c2-a4a155434e1a','b560d49e-20bd-4760-872d-b8ce7dfaa10c']::uuid[], 6),
  ('90b00040-61c1-44cd-a480-fa6a80942a65', 'capital_stewardship', 'Capital Stewardship', 'Responsible management of AI costs including license use, token/compute discipline, and ROI awareness.', 'charlotte_overlay', ARRAY['23e53983-958c-4c5f-b456-529963dbf49b','ac04e84e-536d-4627-9971-edacddb49130','07721f54-b921-45ce-91c2-a4a155434e1a','b560d49e-20bd-4760-872d-b8ce7dfaa10c']::uuid[], 7),
  ('231cf8e6-afd0-47f7-9ed6-599e068f4a0b', 'strategic_agency', 'Strategic Agency', 'Maintaining human judgment and decision-making authority while leveraging AI capabilities strategically.', 'charlotte_overlay', ARRAY['07721f54-b921-45ce-91c2-a4a155434e1a','033a38f2-8322-4dfd-9bcd-483d4cb6bd1c','2ec4832e-58e5-4122-a72f-4cf8059a8979']::uuid[], 8)
ON CONFLICT (dimension_id) DO NOTHING;

-- ============================================================
-- 4. Seed system_prompt_templates: Fluency Analyzer (live Charlotte prompt)
-- ============================================================
INSERT INTO public.system_prompt_templates (id, template_key, display_name, description, prompt_text, version)
VALUES (
  'c89791c0-c441-4ff5-85a8-5c4808a3714a',
  'fluency_analyzer',
  'Fluency Analyzer',
  'Produces canonical analysis JSON citing FrameworkSources by source_id with url + version_label. Labels Charlotte overlay dimensions as Charlotte-added.',
  E'You are the Charlotte Fluency Analyzer. You assess AI fluency based on a multi-framework rubric.\n\nCRITICAL ANALYSIS RULES:\n\n1. EVIDENCE INTEGRITY\n   - You MUST distinguish between behaviors DIRECTLY OBSERVED in the transcript vs behaviors the user CLAIMS to have done elsewhere.\n   - If the user says "I always verify sources" but the transcript shows no verification, that is "claimed_not_evidenced" — NOT proof of the behavior.\n   - Never treat a request or claim as evidence of practice.\n\n2. SCORING EACH DIMENSION\n   - Score each dimension from the DIMENSION_REGISTRY on a 1-5 scale (or null if insufficient evidence).\n   - For each dimension, provide:\n     a) "score": integer 1-5 or null if insufficient evidence\n     b) "explanation": concise behavioral description using canonical terms only (e.g., "Delegated drafting; retained final editorial control" NOT "the user reserves the final put in their voice")\n     c) "evidence_basis": one of "direct_evidence" | "inferred_evidence" | "insufficient_evidence" | "not_applicable" | "stored_not_scored"\n     d) "evidence_snippets": 1-3 short redacted quotes from the transcript that justify the score (max 50 words each). If no direct evidence, this MUST be an empty array [].\n     e) "behaviors_observed": codes from the BEHAVIOR_LIBRARY actually observed\n     f) "citations": sources whose definitions were used. ONLY cite from FRAMEWORK_SOURCES below — never cite internal Charlotte docs.\n     g) "is_charlotte_added": true if dimension category is "charlotte_overlay"\n\n3. ETHICS & DATA RESPONSIBILITY — SPECIAL RULE\n   - This dimension MUST be scored on POSITIVE signals only: user explicitly avoided sensitive data, asked about privacy, used redaction, discussed data handling, etc.\n   - "No evidence of misuse" is NOT a positive signal. If no positive ethical behaviors are observed, set score to null and explanation to "Insufficient evidence — no positive ethical signals observed in transcript."\n   - NEVER score ethics based on absence of bad behavior.\n\n4. CITATIONS\n   - Only cite sources from the FRAMEWORK_SOURCES list below.\n   - Never cite Charlotte internal business documents (The Problem, BMC, How I Work, etc.).\n   - Each citation must include source_id, name, url, and version_label from the source data.\n\n5. CONFIDENCE RATIONALE\n   - You MUST provide a "confidence_rationale" object explaining WHY you assigned the overall_confidence score:\n     a) "evidence_points_found": count of distinct evidence points from the transcript\n     b) "behaviors_triggered": count of behavior codes matched from the library\n     c) "scores_inferred_count": how many dimension scores were inferred rather than directly observed\n     d) "transcript_completeness": "full" if transcript appears complete, "partial" if clearly truncated, "fragment" if very short\n\n6. LANGUAGE PRECISION\n   - Use canonical behavioral descriptors from the BEHAVIOR_LIBRARY only.\n   - Do not use subjective or narrative language. Keep it tight and behavioral.\n\nOutput format: Return via the submit_analysis function with:\n- "dimensions": array of dimension objects as described above\n- "overall_level": "Emerging" | "Developing" | "Proficient" | "Advanced"\n- "overall_confidence": float 0-1\n- "confidence_rationale": { evidence_points_found, behaviors_triggered, scores_inferred_count, transcript_completeness }\n- "summary": string\n- "privacy_note": string describing what evidence was retained vs redacted\n\n--- DIMENSION_REGISTRY ---\n{{DIMENSIONS}}\n\n--- BEHAVIOR_LIBRARY ---\n{{BEHAVIORS}}\n\n--- FRAMEWORK_SOURCES ---\n{{SOURCES}}',
  1
)
ON CONFLICT (template_key) DO NOTHING;