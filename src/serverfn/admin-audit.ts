// Admin-only auditability for receipts: per-receipt score impact + decisions log.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PROFILE_DIMS = [
  "direction",
  "delegation",
  "discernment",
  "development",
  "ethics",
  "efficiency",
  "strategic_agency",
] as const;
type Dim = (typeof PROFILE_DIMS)[number];

function evidenceWeight(basis: string | null | undefined): number {
  if (basis === "direct_evidence") return 1.0;
  if (basis === "inferred_evidence") return 0.6;
  return 0.3;
}
const PRIOR_COUNT_CAP = 5;

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  if (!(data ?? []).some((r: any) => r.role === "admin")) throw new Error("Forbidden: admin only");
}

/**
 * Reconstructs the EMA inputs and outputs for a single receipt so a data
 * scientist can see exactly how this receipt moved the participant's profile.
 * All math mirrors src/server/fluency-profile.server.ts. Read-only.
 */
export const getReceiptScoreImpact = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ receiptId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: receipt } = await supabaseAdmin
      .from("receipts")
      .select("id, participant_id, session_id, created_at")
      .eq("id", data.receiptId)
      .maybeSingle();
    if (!receipt) throw new Error("Receipt not found");

    // This receipt's history snapshot (post-EMA) — keyed by receipt_id.
    const { data: thisHist } = await supabaseAdmin
      .from("participant_fluency_history")
      .select("*")
      .eq("receipt_id", data.receiptId)
      .maybeSingle();

    // Prior history snapshot for the same participant in this session.
    const { data: priorRows } = await supabaseAdmin
      .from("participant_fluency_history")
      .select("*")
      .eq("participant_id", receipt.participant_id)
      .eq("session_id", receipt.session_id)
      .lt("created_at", thisHist?.created_at ?? receipt.created_at ?? new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);
    const prior = (priorRows ?? [])[0] ?? null;

    // This run's per-dimension scores + evidence basis.
    const { data: run } = await supabaseAdmin
      .from("fluency_analysis_runs")
      .select("run_id, analysis_output_json, created_at")
      .eq("receipt_id", data.receiptId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const rawDims: any[] = Array.isArray((run?.analysis_output_json as any)?.dimensions)
      ? ((run?.analysis_output_json as any).dimensions as any[])
      : [];
    const runDims: Record<string, { score: number; basis: string | null }> = {};
    for (const d of rawDims) {
      if (d?.canonical_name && typeof d.score === "number") {
        runDims[d.canonical_name] = { score: d.score, basis: d.evidence_basis ?? null };
      }
    }

    const priorReceiptCount: number = prior?.receipt_count_total ?? 0;
    const cappedPriorCount = Math.min(priorReceiptCount, PRIOR_COUNT_CAP);

    const rows = PROFILE_DIMS.map((dim) => {
      const priorScore = (prior?.[`${dim}_score_profile`] as number | null) ?? 3.0;
      const priorConf = (prior?.[`${dim}_confidence`] as number | null) ?? 0.0;
      const newScore = (thisHist?.[`${dim}_score_profile`] as number | null);
      const newConf = (thisHist?.[`${dim}_confidence`] as number | null);
      const runDim = runDims[dim];
      const evidenceW = runDim ? evidenceWeight(runDim.basis) : 0;
      const priorWeight = priorConf * cappedPriorCount;
      const computedScore =
        runDim
          ? priorWeight + evidenceW > 0
            ? (priorScore * priorWeight + runDim.score * evidenceW) / (priorWeight + evidenceW)
            : runDim.score
          : priorScore;
      return {
        dimension: dim,
        priorScore,
        priorConfidence: priorConf,
        runScore: runDim?.score ?? null,
        evidenceBasis: runDim?.basis ?? null,
        evidenceWeight: evidenceW,
        priorWeight,
        cappedPriorCount,
        computedNewScore: computedScore,
        storedNewScore: newScore,
        storedNewConfidence: newConf,
        delta: newScore !== null && newScore !== undefined ? newScore - priorScore : null,
        // Mismatch indicates a stale snapshot or formula change since the receipt was processed.
        formulaDriftNote:
          newScore !== null && newScore !== undefined && Math.abs(newScore - computedScore) > 0.01
            ? "stored snapshot diverges from current formula — may have been written by a previous engine version"
            : null,
      };
    });

    return {
      receipt,
      run: run ?? null,
      priorSnapshot: prior,
      thisSnapshot: thisHist ?? null,
      priorReceiptCount,
      cappedPriorCount,
      isReanalysis: !!thisHist && !!prior && thisHist.id !== prior.id && (prior?.receipt_count_total ?? 0) >= (thisHist?.receipt_count_total ?? 0),
      rows,
    };
  });

/**
 * Lists the immutable admin-decision audit trail for one receipt.
 */
export const listReceiptDecisions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ receiptId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("admin_receipt_decisions" as any)
      .select("*")
      .eq("receipt_id", data.receiptId)
      .order("created_at", { ascending: false });
    return { decisions: (rows ?? []) as any[] };
  });

/**
 * Lists the full lifetime profile-history for one user (capped 500 rows).
 * Used by the admin user-detail "Profile history" tab.
 */
export const listUserProfileHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("participant_fluency_history")
      .select("*")
      .eq("participant_id", data.userId)
      .order("created_at", { ascending: true })
      .limit(500);
    return { history: (rows ?? []) as any[] };
  });

/**
 * Counts admin decisions for any receipt belonging to the user. Cheap aggregate
 * for the user-detail header.
 */
export const countUserAdminDecisions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rids } = await supabaseAdmin
      .from("receipts").select("id").eq("participant_id", data.userId);
    const ids = (rids ?? []).map((r: any) => r.id);
    if (ids.length === 0) return { count: 0 };
    const { count } = await supabaseAdmin
      .from("admin_receipt_decisions" as any)
      .select("id", { count: "exact", head: true })
      .in("receipt_id", ids);
    return { count: count ?? 0 };
  });
