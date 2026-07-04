import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getReceiptWithFluency = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ receiptId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: receipt, error: rErr } = await supabase
      .from("receipts")
      .select("id, tool_used, prompt_preview, response_preview, created_at, conversation_id, session_id, participant_id, conversation_json, metadata")
      .eq("id", data.receiptId).single();
    if (rErr || !receipt) throw new Error(rErr?.message || "Receipt not found");

    const { data: run } = await supabase
      .from("fluency_analysis_runs")
      .select("run_id, analysis_output_json, transcript_hash, created_at, input_type, subject_type, receipt_profile, tool_metadata, overall_confidence")
      .eq("receipt_id", receipt.id)
      .order("created_at", { ascending: false })
      .limit(1).maybeSingle();

    // Resolve workflow stack tools via receipt_threads → chat_threads
    let tools: string[] = [];
    const { data: rt } = await supabase
      .from("receipt_threads")
      .select("thread_id, position")
      .eq("receipt_id", receipt.id)
      .order("position");
    const threadIds = (rt ?? []).map(r => r.thread_id);
    if (threadIds.length) {
      const { data: chs } = await supabase
        .from("chat_threads").select("id, tool").in("id", threadIds);
      const order = new Map(threadIds.map((id, i) => [id, i]));
      tools = (chs ?? [])
        .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
        .map(c => c.tool);
    }
    if (!tools.length && receipt.tool_used) tools = [receipt.tool_used];

    // Latest receipt_job for this receipt — drives the in-flight / dead-letter
    // banner on the receipt page so we never show "Retry Analysis" while a
    // worker is still running the fluency pass.
    const { data: job } = await supabase
      .from("receipt_jobs")
      .select("id, status, stage, bucket, chunks_total, chunks_done, eta_seconds, progress_label, error, attempts, retry_after, updated_at, created_at, recommendations_status")
      .eq("receipt_id", receipt.id)
      .order("created_at", { ascending: false })
      .limit(1).maybeSingle();

    let turns: Array<{ id?: string; role: string; content: string; idx: number }> = [];
    if (receipt.conversation_id) {
      const { data: t } = await supabase
        .from("conversation_turns")
        .select("id, role, content, idx")
        .eq("conversation_id", receipt.conversation_id)
        .order("idx");
      turns = t ?? [];
    }
    // Fallback: hydrate from conversation_json (multi-thread receipts have no single conversation row)
    if (!turns.length && Array.isArray(receipt.conversation_json)) {
      turns = (receipt.conversation_json as any[]).map((t, i) => ({
        role: t.role, content: t.content, idx: i, id: t.id ?? null,
      }));
    }

    const { data: prof } = await supabase
      .from("profiles")
      .select("template_picker_enabled")
      .eq("id", context.userId)
      .maybeSingle();
    const templatePickerEnabled = !!(prof as any)?.template_picker_enabled;

    return { receipt, run, turns, tools, job, templatePickerEnabled };
  });

/**
 * Rename a receipt. Writes metadata.label so `getReceiptDisplayName`
 * picks it up everywhere (participant + admin views).
 * RLS on `receipts` already scopes updates to the owning participant.
 * Pass an empty/whitespace string to clear the label and fall back to
 * the auto-generated name.
 */
export const renameReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({
      receiptId: z.string().uuid(),
      label: z.string().max(80),
    }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const trimmed = data.label.trim();

    const { data: current, error: readErr } = await supabase
      .from("receipts")
      .select("metadata, participant_id")
      .eq("id", data.receiptId)
      .single();
    if (readErr || !current) throw new Error(readErr?.message || "Receipt not found");
    if (current.participant_id !== userId) throw new Error("Not allowed");

    const meta = { ...((current.metadata ?? {}) as Record<string, unknown>) };
    if (trimmed) meta.label = trimmed;
    else delete meta.label;

    const { error: upErr } = await supabase
      .from("receipts")
      .update({ metadata: meta as any })
      .eq("id", data.receiptId);
    if (upErr) throw new Error(upErr.message);

    return { ok: true, label: trimmed || null };
  });
