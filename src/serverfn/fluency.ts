import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ConversationTurn } from "../server/fluency.server";

const AnalyzeSchema = z.object({
  receiptId: z.string().uuid(),
});

export const analyzeReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AnalyzeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { runFluencyAnalysis } = await import("../server/fluency.server");
    const { userId } = context;
    const { data: receipt, error } = await supabaseAdmin
      .from("receipts").select("*").eq("id", data.receiptId).single();
    if (error || !receipt) throw new Error("Receipt not found");
    const { data: callerRoles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
    const isAdmin = (callerRoles ?? []).some((r: any) => r.role === "admin");
    if (receipt.participant_id !== userId && !isAdmin) throw new Error("Forbidden");

    const turns = (receipt.conversation_json as unknown as ConversationTurn[]) ?? [];
    const content = turns.map(t => `${t.role.toUpperCase()}: ${t.content}`).join("\n\n");
    const result = await runFluencyAnalysis({
      sessionId: receipt.session_id,
      participantId: receipt.participant_id,
      receiptId: receipt.id,
      toolUsed: receipt.tool_used,
      conversationContent: content,
    });
    if (result.error) throw new Error(result.error);
    return { runId: result.runId, analysis: result.analysis };
  });

const SummarizeSchema = z.object({ conversationId: z.string().uuid() });

export const summarizeConversationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SummarizeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { summarizeConversation } = await import("../server/fluency.server");
    const { userId } = context;
    const { data: conv } = await supabaseAdmin
      .from("ai_conversations").select("*").eq("id", data.conversationId).single();
    if (!conv || conv.participant_id !== userId) throw new Error("Forbidden");
    const { data: turnsData } = await supabaseAdmin
      .from("conversation_turns").select("role, content").eq("conversation_id", data.conversationId).order("idx");
    const summary = await summarizeConversation((turnsData ?? []) as ConversationTurn[], conv.tool ?? undefined);
    if (summary) {
      await supabaseAdmin.from("ai_conversations").update({ ai_summary: summary }).eq("id", data.conversationId);
    }
    return { summary };
  });
