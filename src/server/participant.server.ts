import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function deleteAllForUser(userId: string) {
  // Order matters: child rows before parents.
  // 1. fluency_receipts via run join
  const { data: runs } = await supabaseAdmin
    .from("fluency_analysis_runs").select("run_id").eq("participant_id", userId);
  const runIds = (runs ?? []).map(r => r.run_id);
  if (runIds.length) {
    await supabaseAdmin.from("fluency_receipts").delete().in("run_id", runIds);
  }
  // 2. fluency_analysis_runs
  await supabaseAdmin.from("fluency_analysis_runs").delete().eq("participant_id", userId);

  // 3. conversation_turns via conversations
  const { data: convs } = await supabaseAdmin
    .from("ai_conversations").select("id").eq("participant_id", userId);
  const convIds = (convs ?? []).map(c => c.id);
  if (convIds.length) {
    await supabaseAdmin.from("conversation_turns").delete().in("conversation_id", convIds);
  }

  // 4. ai_conversations
  await supabaseAdmin.from("ai_conversations").delete().eq("participant_id", userId);
  // 4b. receipts + receipt_threads
  const { data: receiptRows } = await supabaseAdmin
    .from("receipts").select("id").eq("participant_id", userId);
  const recIds = (receiptRows ?? []).map(r => r.id);
  if (recIds.length) {
    await supabaseAdmin.from("receipt_threads").delete().in("receipt_id", recIds);
  }
  await supabaseAdmin.from("receipts").delete().eq("participant_id", userId);
  // 4c. chat_threads
  await supabaseAdmin.from("chat_threads").delete().eq("participant_id", userId);

  // 5. memberships
  await supabaseAdmin.from("session_participants").delete().eq("participant_id", userId);

  // 6. extension tokens
  await supabaseAdmin.from("extension_tokens").delete().eq("participant_id", userId);

  return {
    conversations: convIds.length,
    receipts: (receiptRows ?? []).length,
    fluencyRuns: runIds.length,
  };
}

const PERSONAL_NAME = "Personal Workspace";

function randomJoinCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export async function ensurePersonalSession(userId: string) {
  // Look for existing personal workspace via kind='personal'.
  const { data: existing } = await supabaseAdmin
    .from("research_sessions")
    .select("id, name, join_code, status")
    .eq("researcher_id", userId)
    .eq("kind", "personal")
    .order("created_at", { ascending: false })
    .limit(1).maybeSingle();

  let sessionId = existing?.id;
  let joinCode = existing?.join_code;

  if (!sessionId) {
    let code = randomJoinCode();
    for (let i = 0; i < 5; i++) {
      const { data, error } = await supabaseAdmin.from("research_sessions").insert({
        researcher_id: userId,
        name: PERSONAL_NAME,
        description: "Your personal AI work — not part of any research study.",
        consent_text: "Personal workspace — only you can see this data.",
        status: "active",
        kind: "personal",
        join_code: code,
      }).select("id, join_code").single();
      if (data) { sessionId = data.id; joinCode = data.join_code; break; }
      if (error && /join_code/i.test(error.message)) { code = randomJoinCode(); continue; }
      throw new Error(error?.message ?? "Failed to create personal workspace");
    }
  }

  if (!sessionId) throw new Error("Failed to create personal workspace");

  // Ensure auto-consented membership.
  const { data: mem } = await supabaseAdmin
    .from("session_participants")
    .select("id, consent_accepted_at")
    .eq("session_id", sessionId).eq("participant_id", userId).maybeSingle();

  if (!mem) {
    await supabaseAdmin.from("session_participants").insert({
      session_id: sessionId,
      participant_id: userId,
      consent_accepted_at: new Date().toISOString(),
    });
  } else if (!mem.consent_accepted_at) {
    await supabaseAdmin.from("session_participants")
      .update({ consent_accepted_at: new Date().toISOString() })
      .eq("id", mem.id);
  }

  return { sessionId, joinCode: joinCode!, name: PERSONAL_NAME };
}

/**
 * Returns the workspace where the participant's next capture will land.
 * Default is the user's personal workspace — captures only land in a research
 * workspace when the extension explicitly sends that workspace's joinCode.
 * This guarantees nothing is silently routed to a study the user didn't pick.
 */
export async function getActiveCaptureTarget(userId: string) {
  const personal = await ensurePersonalSession(userId);
  return {
    sessionId: personal.sessionId,
    name: personal.name,
    joinCode: personal.joinCode,
    status: "active",
    isPersonal: true,
  };
}

