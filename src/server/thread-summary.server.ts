// Generates a short AI summary for a chat thread. Cosmetic only — failures are swallowed.
// Routes through chatCompletion() so it inherits Lovable AI Gateway primary +
// OpenAI fallback and writes a row to ai_provider_events for observability.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { chatCompletion } from "./openai.server";

const MODEL = "google/gemini-2.5-flash-lite";
const MAX_CHARS = 4000;

export async function summarizeThread(threadId: string): Promise<void> {
  try {
    const { data: thread } = await supabaseAdmin
      .from("chat_threads")
      .select("id, last_captured_at, summary_generated_at")
      .eq("id", threadId)
      .maybeSingle();
    if (!thread) return;
    if (
      thread.summary_generated_at &&
      new Date(thread.summary_generated_at) >= new Date(thread.last_captured_at)
    ) {
      return; // up to date
    }

    const { data: cap } = await supabaseAdmin
      .from("ai_conversations")
      .select("id")
      .eq("thread_id", threadId)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!cap) return;

    const { data: turns } = await supabaseAdmin
      .from("conversation_turns")
      .select("role, content, idx")
      .eq("conversation_id", cap.id)
      .order("idx");
    if (!turns?.length) return;

    let transcript = "";
    for (const t of turns) {
      const line = `${t.role.toUpperCase()}: ${t.content}\n`;
      if (transcript.length + line.length > MAX_CHARS) {
        transcript += line.slice(0, MAX_CHARS - transcript.length);
        break;
      }
      transcript += line;
    }

    const result = await chatCompletion({
      label: "thread-summary",
      timeoutMs: 20_000,
      body: {
        model: MODEL,
        messages: [
          {
            role: "system",
            content:
              "You write ultra-short labels for AI chat transcripts. Return ONE sentence, max 110 characters, describing what the conversation is about. No quotes, no preamble, no trailing period if it would push over the limit.",
          },
          { role: "user", content: transcript },
        ],
        max_tokens: 50,
      },
      validate: (data) => Boolean(data?.choices?.[0]?.message?.content?.toString().trim()),
    });
    if (!result.ok || !result.data) return;
    const summary = (result.data?.choices?.[0]?.message?.content ?? "")
      .toString().trim().slice(0, 140);
    if (!summary) return;

    await supabaseAdmin
      .from("chat_threads")
      .update({ summary, summary_generated_at: new Date().toISOString() })
      .eq("id", threadId);
  } catch (e) {
    console.error("[summarizeThread] failed", threadId, e);
  }
}

export async function scheduleSummarize(threadId: string) {
  // Run inline. Cloudflare Workers don't have globalThis.waitUntil here, so
  // fire-and-forget promises get killed when the parent request returns.
  try {
    await summarizeThread(threadId);
  } catch (e) {
    console.error("[scheduleSummarize] failed", threadId, e);
  }
}
