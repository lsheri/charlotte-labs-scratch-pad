import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { chatCompletion } from "@/server/openai.server";

const Input = z.object({
  startDate: z.string().refine(
    (s) => !isNaN(Date.parse(s)),
    "startDate must be a valid date string"
  ),
  endDate: z.string().refine(
    (s) => !isNaN(Date.parse(s)),
    "endDate must be a valid date string"
  ),
});

export interface ImpactStatementData {
  receipts: number;
  judgmentMoments: number;
  verifications: number;
  loopSessions: number;
  topTools: string[];
  claims: string[];
  growthEdge: string;
  dateRange: { start: string; end: string };
}

export const getImpactStatementData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => Input.parse(data))
  .handler(async ({ data, context }): Promise<ImpactStatementData> => {
    const { supabase, userId } = context;
    const start = new Date(data.startDate).toISOString();
    const end = new Date(data.endDate).toISOString();

    // 1. Receipts in range for this user.
    const { data: receipts, error: rErr } = await supabase
      .from("receipts")
      .select("id, tool_used, created_at")
      .eq("participant_id", userId)
      .gte("created_at", start)
      .lte("created_at", end);
    if (rErr) throw rErr;

    const receiptIds = (receipts ?? []).map((r) => r.id);
    const totalReceipts = receiptIds.length;

    let totalJudgmentMoments = 0;
    let totalVerifications = 0;
    let loopSessionCount = 0;

    if (receiptIds.length > 0) {
      const [sigRes, featRes, chainRes] = await Promise.all([
        supabase
          .from("receipt_construct_signals")
          .select("receipt_id, c5_challenge_count")
          .in("receipt_id", receiptIds),
        supabase
          .from("prompt_features")
          .select("receipt_id, c14_attribution_detected")
          .in("receipt_id", receiptIds)
          .eq("c14_attribution_detected", true),
        supabase
          .from("prompt_chains")
          .select("receipt_id, chain_type")
          .in("receipt_id", receiptIds)
          .eq("chain_type", "loop"),
      ]);
      if (sigRes.error) throw sigRes.error;
      if (featRes.error) throw featRes.error;
      if (chainRes.error) throw chainRes.error;

      totalJudgmentMoments = (sigRes.data ?? []).reduce(
        (a: number, s: any) => a + (s.c5_challenge_count ?? 0),
        0
      );
      totalVerifications = (featRes.data ?? []).length;
      const loopReceipts = new Set<string>();
      for (const c of chainRes.data ?? []) {
        if ((c as any).receipt_id) loopReceipts.add((c as any).receipt_id);
      }
      loopSessionCount = loopReceipts.size;
    }

    // Top 2 tools by receipt count.
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

    // 2. LLM pass — capped.
    let claims: string[] = [];
    let growthEdge = "";

    if (totalReceipts > 0) {
      const system =
        "You write one-sentence performance-review impact claims. " +
        "Write in first person. Each claim cites the evidence number provided. " +
        "No em dashes. No AI-sounding language. Sentence case. " +
        'Return strict JSON: {"claims": string[], "growthEdge": string}. ' +
        "claims must have exactly 3 entries.";
      const user =
        `Evidence: ${totalReceipts} receipts, ${totalJudgmentMoments} judgment moments, ` +
        `${totalVerifications} verifications, tools: ${topTools.join(", ") || "none"}. ` +
        "Write 3 impact claims and 1 growth edge (what to improve).";

      const res = await chatCompletion({
        label: "impact-statement",
        body: {
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          max_completion_tokens: 400,
          response_format: { type: "json_object" },
        },
      });

      if (res.ok && res.data) {
        const content: string =
          res.data?.choices?.[0]?.message?.content ?? "";
        try {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed.claims)) {
            claims = parsed.claims
              .filter((c: unknown) => typeof c === "string")
              .slice(0, 3);
          }
          if (typeof parsed.growthEdge === "string") {
            growthEdge = parsed.growthEdge;
          }
        } catch (e) {
          console.error("[impact-statement] failed to parse LLM JSON", e);
        }
      } else {
        console.error("[impact-statement] LLM call failed", res.errorMessage);
      }
    }

    return {
      receipts: totalReceipts,
      judgmentMoments: totalJudgmentMoments,
      verifications: totalVerifications,
      loopSessions: loopSessionCount,
      topTools,
      claims,
      growthEdge,
      dateRange: { start: data.startDate, end: data.endDate },
    };
  });
