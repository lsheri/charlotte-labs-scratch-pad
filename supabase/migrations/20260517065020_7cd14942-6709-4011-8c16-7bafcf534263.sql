INSERT INTO public.participant_fluency_history (
  participant_id, session_id, receipt_id, term_id, rubric_version, provenance,
  direction_score_profile, delegation_score_profile, discernment_score_profile,
  development_score_profile, ethics_score_profile, efficiency_score_profile,
  strategic_agency_score_profile,
  direction_confidence, delegation_confidence, discernment_confidence,
  development_confidence, ethics_confidence, efficiency_confidence,
  strategic_agency_confidence,
  receipt_count_total, created_at
)
SELECT
  r.participant_id, r.session_id, r.id,
  COALESCE(p.term_id, '2026-S1'),
  'v1',
  COALESCE(r.metadata->>'provenance', 'personal'),
  COALESCE(p.direction_score_profile, 3.0),
  COALESCE(p.delegation_score_profile, 3.0),
  COALESCE(p.discernment_score_profile, 3.0),
  COALESCE(p.development_score_profile, 3.0),
  COALESCE(p.ethics_score_profile, 3.0),
  COALESCE(p.efficiency_score_profile, 3.0),
  COALESCE(p.strategic_agency_score_profile, 3.0),
  COALESCE(p.direction_confidence, 0.5),
  COALESCE(p.delegation_confidence, 0.5),
  COALESCE(p.discernment_confidence, 0.5),
  COALESCE(p.development_confidence, 0.5),
  COALESCE(p.ethics_confidence, 0.5),
  COALESCE(p.efficiency_confidence, 0.5),
  COALESCE(p.strategic_agency_confidence, 0.5),
  COALESCE(p.receipt_count_total, 1),
  r.created_at
FROM public.receipts r
LEFT JOIN public.participant_fluency_profiles p
  ON p.participant_id = r.participant_id
 AND p.session_id = r.session_id
WHERE r.created_at >= now() - interval '14 days'
  AND NOT EXISTS (
    SELECT 1 FROM public.participant_fluency_history h
    WHERE h.receipt_id = r.id
  );