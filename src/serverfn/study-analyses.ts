import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STUDY_TEMPLATE_KEYS = ["verification_risk", "study_gaps"] as const;
type StudyTemplateKey = (typeof STUDY_TEMPLATE_KEYS)[number];

/**
 * Ensures the caller owns the receipt (either the participant on the receipt,
 * or an owner of the session the receipt belongs to). Throws on failure.
 */
async function assertReceiptAccess(
  supabase: any,
  userId: string,
  receiptId: string,
) {
  const { data, error } = await supabase
    .from("receipts")
    .select("id, participant_id, session_id")
    .eq("id", receiptId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Receipt not found");
  if (data.participant_id !== userId) {
    // Allow session owner (RLS-safe check via research_sessions read policy).
    const { data: sess } = await supabase
      .from("research_sessions")
      .select("id")
      .eq("id", data.session_id)
      .eq("researcher_id", userId)
      .maybeSingle();
    if (!sess) throw new Error("Not authorized for this receipt");
  }
  return data;
}

/** Kick off (or reuse) a study-focused template analysis for a receipt. */
export const runStudyTemplate = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      receiptId: z.string().uuid(),
      templateKey: z.enum(STUDY_TEMPLATE_KEYS),
      force: z.boolean().optional(),
    }).parse,
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertReceiptAccess(context.supabase, context.userId, data.receiptId);
    const { runStudyAnalysis } = await import("@/server/study-analyzers.server");
    const result = await runStudyAnalysis({
      receiptId: data.receiptId,
      templateKey: data.templateKey as StudyTemplateKey,
      force: data.force,
    });
    return {
      templateKey: result.templateKey,
      ok: result.ok,
      analysis: (result.analysis ?? null) as Record<string, unknown> | null,
      error: result.error ?? null,
      latencyMs: result.latencyMs,
    };
  });

/** Fetch the current analysis row for a receipt + template. */
export const getStudyAnalysis = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      receiptId: z.string().uuid(),
      templateKey: z.enum(STUDY_TEMPLATE_KEYS),
    }).parse,
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertReceiptAccess(context.supabase, context.userId, data.receiptId);
    const { data: row, error } = await context.supabase
      .from("template_analyses")
      .select("analysis_json, status, error_message, updated_at")
      .eq("receipt_id", data.receiptId)
      .eq("template_key", data.templateKey)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { row: row ?? null };
  });

// ------------ Verification checklist state ------------

const CHECKLIST_STATUS = ["open", "verified", "dismissed"] as const;

/** List checklist items for a receipt (Verification & Risk state). */
export const listChecklistItems = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ receiptId: z.string().uuid() }).parse,
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertReceiptAccess(context.supabase, context.userId, data.receiptId);
    const { data: rows, error } = await context.supabase
      .from("receipt_checklist_items" as any)
      .select("*")
      .eq("receipt_id", data.receiptId);
    if (error) throw new Error(error.message);
    return { items: (rows ?? []) as any[] };
  });

/** Upsert a checklist item's status (open/verified/dismissed) + optional note. */
export const setChecklistItem = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      receiptId: z.string().uuid(),
      templateKey: z.string(),
      itemKey: z.string(),
      status: z.enum(CHECKLIST_STATUS),
      note: z.string().nullable().optional(),
    }).parse,
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertReceiptAccess(context.supabase, context.userId, data.receiptId);
    const resolvedAt = data.status === "open" ? null : new Date().toISOString();
    const { error } = await context.supabase
      .from("receipt_checklist_items" as any)
      .upsert(
        {
          receipt_id: data.receiptId,
          template_key: data.templateKey,
          item_key: data.itemKey,
          status: data.status,
          resolved_at: resolvedAt,
          note: data.note ?? null,
        } as any,
        { onConflict: "receipt_id,template_key,item_key" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ------------ Aggregations for Home ------------

/** Open verification & risk items across the user's recent receipts. */
export const getOpenVerificationItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Pull recent receipts and their verification_risk analysis + checklist state.
    const { data: receipts } = await context.supabase
      .from("receipts")
      .select("id, created_at, response_preview")
      .eq("participant_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(20);
    const ids = (receipts ?? []).map((r: any) => r.id);
    if (!ids.length) return { items: [] };

    const [{ data: analyses }, { data: checklist }] = await Promise.all([
      context.supabase
        .from("template_analyses")
        .select("receipt_id, analysis_json")
        .in("receipt_id", ids)
        .eq("template_key", "verification_risk")
        .eq("status", "ok"),
      context.supabase
        .from("receipt_checklist_items" as any)
        .select("receipt_id, template_key, item_key, status")
        .in("receipt_id", ids)
        .eq("template_key", "verification_risk"),
    ]);

    const statusMap = new Map<string, string>();
    for (const c of (checklist ?? []) as any[]) {
      statusMap.set(`${c.receipt_id}:${c.item_key}`, c.status);
    }

    const items: Array<{
      receiptId: string;
      itemKey: string;
      title: string;
      kind: "unverified_claim" | "risk_item";
      severity?: string;
    }> = [];
    for (const a of (analyses ?? []) as any[]) {
      const json = a.analysis_json ?? {};
      for (const c of json.unverified_claims ?? []) {
        const status = statusMap.get(`${a.receipt_id}:${c.item_key}`) ?? "open";
        if (status === "open") {
          items.push({
            receiptId: a.receipt_id,
            itemKey: c.item_key,
            title: c.title,
            kind: "unverified_claim",
          });
        }
      }
      for (const r of json.risk_items ?? []) {
        const status = statusMap.get(`${a.receipt_id}:${r.item_key}`) ?? "open";
        if (status === "open") {
          items.push({
            receiptId: a.receipt_id,
            itemKey: r.item_key,
            title: r.title,
            kind: "risk_item",
            severity: r.severity,
          });
        }
      }
    }
    return { items };
  });
