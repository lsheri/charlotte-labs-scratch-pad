
-- Framework sources (10)
INSERT INTO public.framework_sources (source_id, name, organization, url, source_type, version_label, notes)
VALUES
  ('a629d5b2-1aa7-4a47-907f-04d345702653', 'Anthropic AI Fluency Index (4D + 24 behaviors)', 'Anthropic', 'https://www.anthropic.com/research/AI-fluency-index', 'canonical', 'initial_2026-02-26', NULL),
  ('6e4cecad-121b-42e7-a69e-d5232590ef77', 'UNESCO AI competency framework for students (2024)', 'UNESCO', 'https://www.unesco.org/en/articles/ai-competency-framework-students', 'canonical', 'initial_2026-02-26', NULL),
  ('b8944fd9-88d5-4ad4-888f-1e6cb5abe3ab', 'UNESCO AI competency framework for teachers (2024)', 'UNESCO', 'https://www.unesco.org/en/uuid/node/ab2e2aae-3d01-4472-bccc-a2266c9212e2', 'canonical', 'initial_2026-02-26', NULL),
  ('23e53983-958c-4c5f-b456-529963dbf49b', 'OECD Digital Education Outlook 2026 (GenAI in education)', 'OECD', 'https://www.oecd.org/en/publications/oecd-digital-education-outlook-2026_062a7394-en.html', 'canonical', 'initial_2026-02-26', NULL),
  ('ac04e84e-536d-4627-9971-edacddb49130', 'OECD PISA 2029 Media & Artificial Intelligence Literacy (MAIL)', 'OECD', 'https://www.oecd-ilibrary.org/en/about/projects/pisa-2029-media-and-artificial-intelligence-literacy.html', 'canonical', 'initial_2026-02-26', NULL),
  ('38fee4c8-72cd-45b2-88d4-ffbef28c4f4c', 'AI Literacy Framework initiative (OECD/EC)', 'AILit/OECD/EC', 'https://ailiteracyframework.org/', 'canonical', 'initial_2026-02-26', NULL),
  ('07721f54-b921-45ce-91c2-a4a155434e1a', 'The Problem - Charlotte 3.0', 'Charlotte Labs', 'internal://the-problem-charlotte-3.0', 'canonical', NULL, 'Internal'),
  ('b560d49e-20bd-4760-872d-b8ce7dfaa10c', 'Charlotte Labs Business Model Canvas', 'Charlotte Labs', 'internal://business-model-canvas', 'canonical', NULL, 'Internal'),
  ('033a38f2-8322-4dfd-9bcd-483d4cb6bd1c', 'Charlotte Labs - 3 Assignment Research Study', 'Charlotte Labs', 'internal://research-study-ai-visible', 'canonical', NULL, 'Internal'),
  ('2ec4832e-58e5-4122-a72f-4cf8059a8979', 'How I Work and Prompt', 'Charlotte Labs', 'internal://how-i-work-and-prompt', 'canonical', NULL, 'Internal')
ON CONFLICT DO NOTHING;

-- 8 Dimensions
INSERT INTO public.dimension_registry (dimension_id, canonical_name, display_name, description, category, source_ids, priority_rank)
VALUES
  ('fa6d5566-dd40-402c-a4bf-9187dca9d570', 'direction', 'Direction', 'Ability to clearly articulate goals, set context, and guide AI toward intended outcomes.', 'anthropic_4d', ARRAY['a629d5b2-1aa7-4a47-907f-04d345702653']::uuid[], 1),
  ('e7e70027-9c19-4930-a444-cba522e190f0', 'delegation', 'Delegation', 'Skill in determining what to hand off to AI vs. retain, managing task boundaries effectively.', 'anthropic_4d', ARRAY['a629d5b2-1aa7-4a47-907f-04d345702653']::uuid[], 2),
  ('c170021f-a3c5-4031-b7cf-cfc52bd502f9', 'discernment', 'Discernment', 'Critical evaluation of AI outputs for accuracy, bias, and appropriateness.', 'anthropic_4d', ARRAY['a629d5b2-1aa7-4a47-907f-04d345702653']::uuid[], 3),
  ('84345eeb-a5d9-4ccb-a0fd-93695eeaf22a', 'development', 'Development', 'Continuous learning and adaptation of AI collaboration practices over time.', 'anthropic_4d', ARRAY['a629d5b2-1aa7-4a47-907f-04d345702653']::uuid[], 4),
  ('252e65f0-c841-495f-885e-4f24366174bb', 'ethics_data_responsibility', 'Ethics & Data Responsibility', 'Responsible use of AI including data privacy, consent, bias awareness, and ethical considerations.', 'charlotte_overlay', ARRAY['6e4cecad-121b-42e7-a69e-d5232590ef77','b8944fd9-88d5-4ad4-888f-1e6cb5abe3ab']::uuid[], 5),
  ('e0536651-fff7-4d15-9252-7cc9f4db3a85', 'efficiency_leverage', 'Efficiency & Leverage', 'Maximizing productivity gains through strategic AI tool usage and workflow optimization.', 'charlotte_overlay', ARRAY['23e53983-958c-4c5f-b456-529963dbf49b']::uuid[], 6),
  ('90b00040-61c1-44cd-a480-fa6a80942a65', 'capital_stewardship', 'Capital Stewardship', 'Responsible management of AI costs including license use, token/compute discipline, and ROI awareness.', 'charlotte_overlay', ARRAY['23e53983-958c-4c5f-b456-529963dbf49b']::uuid[], 7),
  ('231cf8e6-afd0-47f7-9ed6-599e068f4a0b', 'strategic_agency', 'Strategic Agency', 'Maintaining human judgment and decision-making authority while leveraging AI capabilities strategically.', 'charlotte_overlay', ARRAY['07721f54-b921-45ce-91c2-a4a155434e1a']::uuid[], 8)
ON CONFLICT DO NOTHING;

-- Fluency analyzer system prompt
INSERT INTO public.system_prompt_templates (template_key, display_name, description, prompt_text, version)
VALUES (
  'fluency_analyzer',
  'Fluency Analyzer',
  'Produces canonical analysis JSON citing FrameworkSources. Labels Charlotte overlay dimensions as Charlotte-added.',
  E'You are the Charlotte Fluency Analyzer. You assess AI fluency based on a multi-framework rubric.\n\nCRITICAL ANALYSIS RULES:\n\n1. EVIDENCE INTEGRITY\n   - Distinguish behaviors DIRECTLY OBSERVED in the transcript vs behaviors CLAIMED elsewhere.\n   - Never treat a request or claim as evidence of practice.\n\n2. SCORING EACH DIMENSION\n   - Score each dimension from DIMENSION_REGISTRY 1-5 (or null if insufficient evidence).\n   - For each dimension provide: score, explanation, evidence_basis (directly_observed|inferred|claimed_not_evidenced|insufficient_evidence), evidence_snippets (1-3 short quotes, [] if none), behaviors_observed (codes), citations (only from FRAMEWORK_SOURCES, never internal Charlotte docs), is_charlotte_added (true if charlotte_overlay).\n\n3. ETHICS & DATA RESPONSIBILITY\n   - Score on POSITIVE signals only. Absence of misuse is NOT a positive signal.\n\n4. CITATIONS — only from FRAMEWORK_SOURCES, never internal docs.\n\n5. CONFIDENCE RATIONALE — provide evidence_points_found, behaviors_triggered, scores_inferred_count, transcript_completeness.\n\nReturn via submit_analysis function with: dimensions[], overall_level (Emerging|Developing|Proficient|Advanced), overall_confidence (0-1), confidence_rationale, summary, privacy_note.\n\n--- DIMENSION_REGISTRY ---\n{{DIMENSIONS}}\n\n--- BEHAVIOR_LIBRARY ---\n{{BEHAVIORS}}\n\n--- FRAMEWORK_SOURCES ---\n{{SOURCES}}',
  1
)
ON CONFLICT (template_key) DO NOTHING;
