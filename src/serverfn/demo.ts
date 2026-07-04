// Public demo of the receipt + template system.
// Loads a single hardcoded receipt regardless of ownership so every
// signed-in user can explore the templates. Sensitive fields
// (participant_id) are stripped before returning to the client.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const DEMO_RECEIPT_ID = "b3d04504-ee3e-4800-a91e-0de198d64b1a";

export const getDemoReceipt = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    // Lazy server-only imports keep this file out of client bundles
    // (src/server/* is blocked from the client by the template guards).
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { generateRecommendationsForReceipt } = await import(
      "@/server/recommendations.server"
    );

    const { data: receiptRaw, error: rErr } = await supabaseAdmin
      .from("receipts")
      .select(
        "id, tool_used, prompt_preview, response_preview, created_at, conversation_id, session_id, conversation_json, metadata",
      )
      .eq("id", DEMO_RECEIPT_ID)
      .single();
    if (rErr || !receiptRaw) {
      throw new Error(rErr?.message || "Demo receipt not found");
    }
    const receipt = receiptRaw as any;

    const { data: run } = await supabaseAdmin
      .from("fluency_analysis_runs")
      .select(
        "run_id, analysis_output_json, transcript_hash, created_at, input_type, subject_type, receipt_profile, tool_metadata, overall_confidence",
      )
      .eq("receipt_id", receipt.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: rt } = await supabaseAdmin
      .from("receipt_threads")
      .select("thread_id, position")
      .eq("receipt_id", receipt.id)
      .order("position");
    const threadIds = (rt ?? []).map((r) => r.thread_id);

    let threads: Array<{
      id: string;
      title: string | null;
      tool: string | null;
      position: number;
    }> = [];
    let tools: string[] = [];
    if (threadIds.length) {
      const { data: chs } = await supabaseAdmin
        .from("chat_threads")
        .select("id, title, tool, summary")
        .in("id", threadIds);
      const order = new Map(threadIds.map((id, i) => [id, i]));
      const sorted = (chs ?? []).slice().sort(
        (a: any, b: any) =>
          (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
      );
      threads = sorted.map((c: any, i: number) => ({
        id: c.id,
        // Use the AI-generated summary as the canonical title when present.
        title: (c.summary as string | null) ?? c.title ?? null,
        tool: c.tool ?? null,
        position: i,
      }));
      tools = sorted.map((c: any) => c.tool).filter(Boolean);
    }
    if (!tools.length && receipt.tool_used) tools = [receipt.tool_used];

    // Pick the primary thread (first one — there's only one for the
    // Dempsey demo receipt, but this keeps it robust).
    const primaryThreadId = threads[0]?.id ?? null;
    const primaryThreadTitle = threads[0]?.title ?? null;

    const { data: job } = await supabaseAdmin
      .from("receipt_jobs")
      .select(
        "id, status, stage, bucket, chunks_total, chunks_done, eta_seconds, progress_label, error, attempts, retry_after, updated_at, created_at, recommendations_status",
      )
      .eq("receipt_id", receipt.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let turns: Array<{
      id?: string | null;
      role: string;
      content: string;
      idx: number;
      thread_id?: string | null;
    }> = [];
    if (receipt.conversation_id) {
      const { data: t } = await supabaseAdmin
        .from("conversation_turns")
        .select("id, role, content, idx")
        .eq("conversation_id", receipt.conversation_id)
        .order("idx");
      turns = (t ?? []).map((row: any) => ({
        ...row,
        thread_id: primaryThreadId,
      }));
    }
    if (!turns.length && Array.isArray(receipt.conversation_json)) {
      turns = (receipt.conversation_json as any[]).map((t, i) => ({
        role: t.role,
        content: t.content,
        idx: i,
        id: t.id ?? null,
        thread_id: t.thread_id ?? primaryThreadId,
      }));
    }

    // Recommendations baked in so the route doesn't need a separate call.
    let recommendations: any = null;
    try {
      recommendations = await generateRecommendationsForReceipt({
        supabase: supabaseAdmin,
        receiptId: receipt.id,
      });
    } catch (e) {
      console.error("[demo] recommendations failed", e);
    }

    // Strip sensitive fields
    delete receipt.conversation_json;

    return {
      receipt,
      run,
      turns,
      tools,
      job,
      threads,
      primaryThreadId,
      primaryThreadTitle,
      recommendations,
    };
  });

export const getDemoImpactStatementData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        startDate: z.string(),
        endDate: z.string(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const start = new Date(data.startDate).toISOString();
    const end = new Date(data.endDate).toISOString();

    const { data: demoReceipt } = await supabaseAdmin
      .from("receipts")
      .select("participant_id")
      .eq("id", DEMO_RECEIPT_ID)
      .single();
    const participantId = (demoReceipt as any)?.participant_id;
    if (!participantId) {
      return {
        receipts: 0,
        judgmentMoments: 0,
        verifications: 0,
        loopSessions: 0,
        topTools: [] as string[],
        claims: [] as string[],
        growthEdge: "",
        dateRange: { start: data.startDate, end: data.endDate },
      };
    }

    const { data: receipts } = await supabaseAdmin
      .from("receipts")
      .select("id, tool_used, created_at")
      .eq("participant_id", participantId)
      .gte("created_at", start)
      .lte("created_at", end);

    const receiptIds = (receipts ?? []).map((r: any) => r.id);
    let totalJudgmentMoments = 0;
    let totalVerifications = 0;
    let loopSessionCount = 0;

    if (receiptIds.length > 0) {
      const [sigRes, featRes, chainRes] = await Promise.all([
        supabaseAdmin
          .from("receipt_construct_signals")
          .select("receipt_id, c5_challenge_count")
          .in("receipt_id", receiptIds),
        supabaseAdmin
          .from("prompt_features")
          .select("receipt_id, c14_attribution_detected")
          .in("receipt_id", receiptIds)
          .eq("c14_attribution_detected", true),
        supabaseAdmin
          .from("prompt_chains")
          .select("receipt_id, chain_type")
          .in("receipt_id", receiptIds)
          .eq("chain_type", "loop"),
      ]);
      totalJudgmentMoments = (sigRes.data ?? []).reduce(
        (a: number, s: any) => a + (s.c5_challenge_count ?? 0),
        0,
      );
      totalVerifications = (featRes.data ?? []).length;
      const loopReceipts = new Set<string>();
      for (const c of chainRes.data ?? []) {
        if ((c as any).receipt_id) loopReceipts.add((c as any).receipt_id);
      }
      loopSessionCount = loopReceipts.size;
    }

    const toolCounts = new Map<string, number>();
    for (const r of receipts ?? []) {
      const t = (r as any).tool_used;
      if (!t) continue;
      toolCounts.set(t, (toolCounts.get(t) ?? 0) + 1);
    }
    const topTools = Array.from(toolCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([t]) => t);

    return {
      receipts: receiptIds.length,
      judgmentMoments: totalJudgmentMoments,
      verifications: totalVerifications,
      loopSessions: loopSessionCount,
      topTools,
      claims: [
        "Shipped a competition-grade business plan with verifiable judgment calls along the way.",
        "Pressure-tested AI suggestions before committing them to the final document.",
        "Iterated on structure and argument rather than accepting first drafts.",
      ],
      growthEdge:
        "Capture more attribution moments when borrowing AI phrasing.",
      dateRange: { start: data.startDate, end: data.endDate },
    };
  });
