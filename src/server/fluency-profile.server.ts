// Charlotte Engine V1 — Fluency profile aggregation.
// Maintains the cross-receipt weighted score per participant/session/term,
// powering both the student-facing radar and the researcher term view.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const PROFILE_DIMS = [
  "direction",
  "delegation",
  "discernment",
  "development",
  "ethics",
  "efficiency",
  "strategic_agency",
] as const;
type ProfileDim = (typeof PROFILE_DIMS)[number];
const ALL_DIMS: readonly string[] = [...PROFILE_DIMS, "capital_stewardship"];

interface DimScore {
  score: number;
  weight: number;
}

interface AnalysisDimension {
  canonical_name?: string;
  score?: number;
  evidence_basis?: string | null;
}

interface AnalysisOutput {
  dimensions?: AnalysisDimension[];
}

interface FluencyRunRow {
  analysis_output_json: AnalysisOutput | null;
  receipt_id?: string | null;
}

interface ProfileRow {
  receipt_count_total: number | null;
  [key: string]: number | string | null;
}

// Resolve provenance for a receipt — defaults to 'personal' if unset.
// Stored directly on the history row so the home radar can filter/disclose
// lab vs personal without joining back to receipts.metadata at read time.
async function getReceiptProvenance(receiptId: string): Promise<'lab' | 'personal'> {
  try {
    const { data } = await supabaseAdmin
      .from('receipts')
      .select('metadata')
      .eq('id', receiptId)
      .maybeSingle();
    const p = ((data as any)?.metadata?.provenance) === 'lab' ? 'lab' : 'personal';
    return p;
  } catch {
    return 'personal';
  }
}

function getCurrentTermId(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month <= 5) return `${year}-S1`;
  if (month <= 7) return `${year}-SU`;
  return `${year}-S2`;
}

function evidenceWeight(basis: string | null | undefined): number {
  if (basis === "direct_evidence") return 1.0;
  if (basis === "inferred_evidence") return 0.6;
  return 0.3;
}

function termRange(termId: string): { start: Date; end: Date } {
  const year = parseInt(termId.slice(0, 4), 10);
  if (termId.endsWith("S1")) {
    return { start: new Date(year, 0, 1), end: new Date(year, 5, 1) };
  }
  if (termId.endsWith("SU")) {
    return { start: new Date(year, 5, 1), end: new Date(year, 7, 1) };
  }
  return { start: new Date(year, 7, 1), end: new Date(year + 1, 0, 1) };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Updates participant_fluency_profiles after a new receipt is analyzed.
 * Applies weighted update formula to both per-term scores (researcher view)
 * and cross-term profile scores (student view).
 * capital_stewardship updates score_term only — never score_profile.
 * Upserts — safe to re-run; never reinitializes an existing profile to 3.0.
 * Called by: processReceiptJob() after computeConstructSignals() completes
 * Constructs served: all 8 dimensions (profile layer)
 */
export async function updateFluencyProfile(
  receiptId: string,
  participantId: string,
  sessionId: string,
): Promise<void> {
  try {
    // Step 1 — load fluency run for this receipt
    const { data: runData, error: runErr } = await supabaseAdmin
      .from("fluency_analysis_runs")
      .select("analysis_output_json, created_at")
      .eq("receipt_id", receiptId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (runErr) {
      console.error("[fluency-profile] load run failed", runErr);
      return;
    }
    const run = runData as unknown as FluencyRunRow | null;
    if (!run?.analysis_output_json) return;

    // Step 2 — extract per-dimension scores from this run
    const rawDims: AnalysisDimension[] = Array.isArray(
      run.analysis_output_json.dimensions,
    )
      ? run.analysis_output_json.dimensions
      : [];
    const dims: Record<string, DimScore> = {};
    for (const d of rawDims) {
      if (d?.canonical_name && typeof d.score === "number") {
        dims[d.canonical_name] = {
          score: d.score,
          weight: evidenceWeight(d.evidence_basis),
        };
      }
    }
    if (Object.keys(dims).length === 0) return;

    // Step 3 — load all term runs for this participant/session
    const termId = getCurrentTermId();
    const { start: termStart, end: termEnd } = termRange(termId);
    const { data: termRunsData } = await supabaseAdmin
      .from("fluency_analysis_runs")
      .select("analysis_output_json, receipt_id")
      .eq("participant_id", participantId)
      .eq("session_id", sessionId)
      .gte("created_at", termStart.toISOString())
      .lt("created_at", termEnd.toISOString());
    const termRuns = (termRunsData ?? []) as unknown as FluencyRunRow[];

    // Step 4 — per-term weighted mean per dimension
    const termScores: Record<string, number | null> = {};
    for (const dim of ALL_DIMS) {
      const allScores: DimScore[] = [];
      for (const tr of termRuns) {
        const tdims: AnalysisDimension[] = Array.isArray(
          tr.analysis_output_json?.dimensions,
        )
          ? (tr.analysis_output_json!.dimensions as AnalysisDimension[])
          : [];
        const match = tdims.find(d => d?.canonical_name === dim);
        if (match && typeof match.score === "number") {
          allScores.push({
            score: match.score,
            weight: evidenceWeight(match.evidence_basis),
          });
        }
      }
      if (allScores.length === 0) {
        termScores[dim] = null;
      } else {
        const totalWeight = allScores.reduce((s, d) => s + d.weight, 0);
        termScores[dim] = totalWeight > 0
          ? allScores.reduce((s, d) => s + d.score * d.weight, 0) / totalWeight
          : null;
      }
    }

    // Step 5 — load existing profile row (if any)
    const { data: existingData } = await supabaseAdmin
      .from("participant_fluency_profiles")
      .select("*")
      .eq("participant_id", participantId)
      .eq("session_id", sessionId)
      .eq("term_id", termId)
      .maybeSingle();
    const prior = (existingData ?? null) as unknown as ProfileRow | null;
    const priorReceiptCount = prior?.receipt_count_total ?? 0;

    // Idempotency: if this receipt already contributed to the profile (history row
    // exists), this is a re-analysis. Don't double-count toward receipt_count_total
    // — that counter weights the EMA in Step 6 and gates the "3 receipts" UI.
    const { data: existingHistory } = await supabaseAdmin
      .from("participant_fluency_history")
      .select("id")
      .eq("receipt_id", receiptId)
      .maybeSingle();
    const isReanalysis = !!existingHistory;
    const nextReceiptCount = isReanalysis ? priorReceiptCount : priorReceiptCount + 1;

    // Step 6 — compute new profile scores + confidence per dim
    const newProfileScores: Record<ProfileDim, number> = {} as Record<
      ProfileDim,
      number
    >;
    const newConfidence: Record<ProfileDim, number> = {} as Record<
      ProfileDim,
      number
    >;

    for (const dim of PROFILE_DIMS) {
      const priorScoreRaw = prior?.[`${dim}_score_profile`];
      const priorConfRaw = prior?.[`${dim}_confidence`];
      const priorScore =
        typeof priorScoreRaw === "number" ? priorScoreRaw : 3.0;
      const priorConf =
        typeof priorConfRaw === "number" ? priorConfRaw : 0.0;
      const thisRunDim = dims[dim];

      if (!thisRunDim) {
        newProfileScores[dim] = priorScore;
        newConfidence[dim] = priorConf;
        continue;
      }

      // Cap effective receipt count in the EMA so the profile stays responsive
      // to behavior change after many submissions. Stored receipt_count_total
      // is unaffected — only the weighting denominator is capped. Without this,
      // a user with 20+ receipts can never meaningfully shift their profile
      // because new evidence is drowned by accumulated prior weight.
      const PRIOR_COUNT_CAP = 5;
      const cappedPriorCount = Math.min(priorReceiptCount, PRIOR_COUNT_CAP);
      const priorWeight = priorConf * cappedPriorCount;
      const evidenceW = thisRunDim.weight;
      // Use this run's score directly (not the term mean) so a sustained
      // improver actually moves their profile. The term mean drags new
      // evidence back toward historical receipts and prevents adaptation.
      // termScores still feed the per-term researcher columns below.
      const evidenceScore = thisRunDim.score;

      newProfileScores[dim] =
        priorWeight + evidenceW > 0
          ? (priorScore * priorWeight + evidenceScore * evidenceW) /
            (priorWeight + evidenceW)
          : evidenceScore;

      newConfidence[dim] = Math.min(1.0, priorConf + evidenceW * 0.15);
    }

    // Step 7 — upsert profile row
    const { error: upErr } = await supabaseAdmin
      .from("participant_fluency_profiles")
      .upsert(
        {
          participant_id: participantId,
          session_id: sessionId,
          term_id: termId,

          // Per-term scores (researcher view)
          direction_score_term: termScores["direction"],
          delegation_score_term: termScores["delegation"],
          discernment_score_term: termScores["discernment"],
          development_score_term: termScores["development"],
          ethics_score_term: termScores["ethics"],
          efficiency_score_term: termScores["efficiency"],
          strategic_agency_score_term: termScores["strategic_agency"],
          capital_stewardship_score_term: termScores["capital_stewardship"],

          // Cross-term profile scores (student view) — capital_stewardship intentionally excluded
          direction_score_profile: newProfileScores.direction,
          delegation_score_profile: newProfileScores.delegation,
          discernment_score_profile: newProfileScores.discernment,
          development_score_profile: newProfileScores.development,
          ethics_score_profile: newProfileScores.ethics,
          efficiency_score_profile: newProfileScores.efficiency,
          strategic_agency_score_profile: newProfileScores.strategic_agency,

          // Confidence
          direction_confidence: newConfidence.direction,
          delegation_confidence: newConfidence.delegation,
          discernment_confidence: newConfidence.discernment,
          development_confidence: newConfidence.development,
          ethics_confidence: newConfidence.ethics,
          efficiency_confidence: newConfidence.efficiency,
          strategic_agency_confidence: newConfidence.strategic_agency,

          receipt_count_term: termRuns.length,
          receipt_count_total: nextReceiptCount,
          last_receipt_id: receiptId,
          last_updated_at: new Date().toISOString(),
        },
        { onConflict: "participant_id,session_id,term_id" },
      );
    if (upErr) {
      console.error("[fluency-profile] upsert failed", upErr);
    }

    // Append-only snapshot for the longitudinal radar (history scrubber + per-receipt overlay).
    // Idempotent on receipt_id (UNIQUE constraint) — re-running an analysis won't duplicate.
    try {
      const provenance = await getReceiptProvenance(receiptId);
      const { error: histErr } = await supabaseAdmin
        .from("participant_fluency_history")
        .upsert(
          {
            participant_id: participantId,
            session_id: sessionId,
            receipt_id: receiptId,
            term_id: termId,
            rubric_version: "v1",
            provenance,
            direction_score_profile: newProfileScores.direction,
            delegation_score_profile: newProfileScores.delegation,
            discernment_score_profile: newProfileScores.discernment,
            development_score_profile: newProfileScores.development,
            ethics_score_profile: newProfileScores.ethics,
            efficiency_score_profile: newProfileScores.efficiency,
            strategic_agency_score_profile: newProfileScores.strategic_agency,
            direction_confidence: newConfidence.direction,
            delegation_confidence: newConfidence.delegation,
            discernment_confidence: newConfidence.discernment,
            development_confidence: newConfidence.development,
            ethics_confidence: newConfidence.ethics,
            efficiency_confidence: newConfidence.efficiency,
            strategic_agency_confidence: newConfidence.strategic_agency,
            receipt_count_total: nextReceiptCount,
          } as any,
          { onConflict: "receipt_id" },
        );
      if (histErr) console.error("[fluency-profile] history append failed", histErr);
    } catch (e) {
      console.error("[fluency-profile] history append crashed", e);
    }
  } catch (e) {
    console.error("[fluency-profile] updateFluencyProfile crashed", e);
  }
}

/**
 * Forward-only auditability guarantee: every receipt MUST have at least one
 * participant_fluency_history row so the admin Score Impact Panel can always
 * reconstruct what the engine did. If updateFluencyProfile didn't write one
 * (no fluency run, no dims, or it crashed), this writes a carry-forward
 * snapshot using the participant's current profile so the receipt is never
 * orphaned from the audit trail. Idempotent on receipt_id.
 */
export async function ensureReceiptHistorySnapshot(
  receiptId: string,
  participantId: string,
  sessionId: string,
): Promise<void> {
  try {
    const { data: existing } = await supabaseAdmin
      .from("participant_fluency_history")
      .select("id")
      .eq("receipt_id", receiptId)
      .maybeSingle();
    if (existing) return;

    const termId = getCurrentTermId();
    const { data: profile } = await supabaseAdmin
      .from("participant_fluency_profiles")
      .select("*")
      .eq("participant_id", participantId)
      .eq("session_id", sessionId)
      .eq("term_id", termId)
      .maybeSingle();

    const p = (profile ?? {}) as Record<string, number | null>;
    const num = (k: string, fallback: number) =>
      typeof p[k] === "number" ? (p[k] as number) : fallback;

    const provenance = await getReceiptProvenance(receiptId);
    const { error } = await supabaseAdmin
      .from("participant_fluency_history")
      .upsert(
        {
          participant_id: participantId,
          session_id: sessionId,
          receipt_id: receiptId,
          term_id: termId,
          rubric_version: "v1",
          provenance,
          direction_score_profile: num("direction_score_profile", 3.0),
          delegation_score_profile: num("delegation_score_profile", 3.0),
          discernment_score_profile: num("discernment_score_profile", 3.0),
          development_score_profile: num("development_score_profile", 3.0),
          ethics_score_profile: num("ethics_score_profile", 3.0),
          efficiency_score_profile: num("efficiency_score_profile", 3.0),
          strategic_agency_score_profile: num("strategic_agency_score_profile", 3.0),
          direction_confidence: num("direction_confidence", 0.0),
          delegation_confidence: num("delegation_confidence", 0.0),
          discernment_confidence: num("discernment_confidence", 0.0),
          development_confidence: num("development_confidence", 0.0),
          ethics_confidence: num("ethics_confidence", 0.0),
          efficiency_confidence: num("efficiency_confidence", 0.0),
          strategic_agency_confidence: num("strategic_agency_confidence", 0.0),
          receipt_count_total: typeof p["receipt_count_total"] === "number"
            ? (p["receipt_count_total"] as number) : 0,
        } as any,
        { onConflict: "receipt_id" },
      );
    if (error) console.error("[fluency-profile] ensureReceiptHistorySnapshot upsert failed", error);
  } catch (e) {
    console.error("[fluency-profile] ensureReceiptHistorySnapshot crashed", e);
  }
}

/**
 * Returns the current fluency profile for a participant in a session.
 * Includes both profile scores (student view) and term scores (researcher view).
 * Returns null if no profile exists yet.
 * Called by: student dashboard, receipt page
 * Constructs served: all dimensions (read path)
 */
export async function getParticipantFluencyProfile(
  participantId: string,
  sessionId: string,
  termId?: string,
) {
  const tid = termId ?? getCurrentTermId();
  const { data } = await supabaseAdmin
    .from("participant_fluency_profiles")
    .select("*")
    .eq("participant_id", participantId)
    .eq("session_id", sessionId)
    .eq("term_id", tid)
    .maybeSingle();
  return data ?? null;
}
