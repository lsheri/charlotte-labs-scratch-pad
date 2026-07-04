-- Backfill participant_fluency_history from fluency_analysis_runs using REAL
-- per-dimension engine scores. Previously we only had carry-forward defaults
-- which collapsed the rolling-median radar to a single distinct value.
-- This pulls dimension scores out of analysis_output_json.dimensions[] and
-- inserts one history row per (receipt_id, run) pair that doesn't already
-- have one.

WITH dims AS (
  SELECT
    far.receipt_id,
    far.participant_id,
    far.session_id,
    far.created_at,
    far.overall_confidence,
    d->>'canonical_name' AS canonical,
    (d->>'score')::numeric AS score
  FROM public.fluency_analysis_runs far
  CROSS JOIN LATERAL jsonb_array_elements(far.analysis_output_json->'dimensions') d
  WHERE far.receipt_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.participant_fluency_history h
      WHERE h.receipt_id = far.receipt_id
    )
),
pivoted AS (
  SELECT
    receipt_id, participant_id, session_id, created_at,
    COALESCE(overall_confidence, 0.5) AS conf,
    MAX(score) FILTER (WHERE canonical='direction') AS direction,
    MAX(score) FILTER (WHERE canonical='delegation') AS delegation,
    MAX(score) FILTER (WHERE canonical='discernment') AS discernment,
    MAX(score) FILTER (WHERE canonical='development') AS development,
    MAX(score) FILTER (WHERE canonical='ethics_data_responsibility') AS ethics,
    MAX(score) FILTER (WHERE canonical='efficiency_leverage') AS efficiency,
    MAX(score) FILTER (WHERE canonical='strategic_agency') AS strategic_agency
  FROM dims
  GROUP BY receipt_id, participant_id, session_id, created_at, overall_confidence
)
INSERT INTO public.participant_fluency_history (
  participant_id, session_id, receipt_id, term_id, rubric_version, provenance, created_at,
  direction_score_profile, delegation_score_profile, discernment_score_profile,
  development_score_profile, ethics_score_profile, efficiency_score_profile,
  strategic_agency_score_profile,
  direction_confidence, delegation_confidence, discernment_confidence,
  development_confidence, ethics_confidence, efficiency_confidence,
  strategic_agency_confidence,
  receipt_count_total
)
SELECT
  p.participant_id, p.session_id, p.receipt_id,
  to_char(p.created_at, 'YYYY-"T"Q') AS term_id,
  'v1',
  COALESCE(r.metadata->>'provenance', 'personal') AS provenance,
  p.created_at,
  p.direction, p.delegation, p.discernment, p.development,
  p.ethics, p.efficiency, p.strategic_agency,
  p.conf, p.conf, p.conf, p.conf, p.conf, p.conf, p.conf,
  0
FROM pivoted p
JOIN public.receipts r ON r.id = p.receipt_id
WHERE p.direction IS NOT NULL OR p.delegation IS NOT NULL OR p.discernment IS NOT NULL
   OR p.development IS NOT NULL OR p.ethics IS NOT NULL OR p.efficiency IS NOT NULL
   OR p.strategic_agency IS NOT NULL;
