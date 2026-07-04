// Client-safe entrypoints for per-template AI analyses.
// Real work lives in src/server/template-analyses.server.ts (lazy-imported
// inside .handler() so server-only code never reaches client bundles).

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const TEMPLATE_KEYS = [
  "thinking_map",
  "ledger",
  "still_yours",
  "proof_card",
  "shield",
  "impact_statement",
  "impact_proof",
  "context_map",
] as const;

export const fetchTemplateAnalyses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ receiptId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("template_analyses")
      .select(
        "template_key, analysis_json, prompt_version, model, status, error_message, updated_at",
      )
      .eq("receipt_id", data.receiptId);
    if (error) throw new Error(error.message);
    const byKey: Record<string, any> = {};
    for (const r of (rows ?? []) as any[]) {
      byKey[r.template_key] = r;
    }
    return byKey;
  });

export const ensureTemplateAnalyses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        receiptId: z.string().uuid(),
        force: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { runAllTemplateAnalyses } = await import(
      "@/server/template-analyses.server"
    );
    const results = await runAllTemplateAnalyses({
      receiptId: data.receiptId,
      force: data.force ?? false,
    });
    return {
      results: results.map((r) => ({
        templateKey: r.templateKey,
        ok: r.ok,
        error: r.error ?? null,
        promptVersion: r.promptVersion ?? null,
        model: r.model ?? null,
        latencyMs: r.latencyMs,
      })),
    };
  });

export const rerunTemplateAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        receiptId: z.string().uuid(),
        templateKey: z.enum(TEMPLATE_KEYS),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { runSingleTemplateAnalysis } = await import(
      "@/server/template-analyses.server"
    );
    const r = await runSingleTemplateAnalysis({
      receiptId: data.receiptId,
      templateKey: data.templateKey,
    });
    return {
      templateKey: r.templateKey,
      ok: r.ok,
      error: r.error ?? null,
      promptVersion: r.promptVersion ?? null,
      model: r.model ?? null,
      latencyMs: r.latencyMs,
      analysis: r.analysis ?? null,
    };
  });
