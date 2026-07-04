// Cron-triggered sweeper for thread background work.
//
// Mirrors process-receipt-jobs but for the `thread_jobs` queue:
//   - kind='summarize' → regenerate the chat_threads.summary label (debounced
//     at enqueue time in capture-conversation.ts).
//   - kind='extract_features' → run extractPromptFeatures for the captured
//     conversation (per-prompt behavioral signals).
//
// Capture handler stays fast (only DB writes + enqueue). All gateway-bound
// work happens here and tolerates rate limits via retry_after.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// 0 = pick up freshly-queued jobs on the same tick. Kick from
// capture-conversation fires right after insert; cron is just a 6-hour
// safety net.
const STUCK_QUEUED_MINUTES = 0;
const STUCK_PROCESSING_MINUTES = 10;
const MAX_PER_TICK = 10;
const MAX_ATTEMPTS = 5;
const RATE_LIMIT_BACKOFF_MIN = 5;

function unauthorized() {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401, headers: { "Content-Type": "application/json" },
  });
}

async function runSummarize(job: {
  id: string;
  thread_id: string;
}): Promise<{ ok: boolean; rateLimited?: boolean; error?: string }> {
  const { summarizeThread } = await import("@/server/thread-summary.server");

  // Snapshot turn_count before summarizing so we can advance the high-water
  // mark even if more turns land mid-summary.
  const { data: pre } = await supabaseAdmin
    .from("chat_threads")
    .select("turn_count, summary_refresh_count_today, summary_refresh_day, summary")
    .eq("id", job.thread_id)
    .maybeSingle();
  if (!pre) return { ok: true }; // thread gone — treat as completed

  const beforeSummary = pre.summary ?? null;
  await summarizeThread(job.thread_id);

  // Verify summary actually advanced (gateway may have failed silently).
  const { data: post } = await supabaseAdmin
    .from("chat_threads")
    .select("summary, summary_generated_at")
    .eq("id", job.thread_id)
    .maybeSingle();
  if (!post?.summary || post.summary === beforeSummary) {
    return { ok: false, error: "summary not updated" };
  }

  // Roll daily counter
  const today = new Date().toISOString().slice(0, 10);
  const sameDay = pre.summary_refresh_day === today;
  const newCount = (sameDay ? (pre.summary_refresh_count_today ?? 0) : 0) + 1;

  await supabaseAdmin
    .from("chat_threads")
    .update({
      last_summarized_turn_count: pre.turn_count ?? 0,
      summary_refresh_count_today: newCount,
      summary_refresh_day: today,
    })
    .eq("id", job.thread_id);

  return { ok: true };
}

async function runExtractFeatures(job: {
  id: string;
  conversation_id: string | null;
  participant_id: string;
  session_id: string | null;
  thread_id: string;
}): Promise<{ ok: boolean; rateLimited?: boolean; error?: string }> {
  if (!job.conversation_id) return { ok: true };
  const { extractPromptFeatures } = await import("@/server/prompt-telemetry.server");

  // Look up tool from the conversation row.
  const { data: conv } = await supabaseAdmin
    .from("ai_conversations")
    .select("tool")
    .eq("id", job.conversation_id)
    .maybeSingle();
  if (!conv) return { ok: true };

  await extractPromptFeatures({
    conversationId: job.conversation_id,
    participantId: job.participant_id,
    sessionId: job.session_id ?? "",
    threadId: job.thread_id,
    tool: conv.tool as any,
  });
  return { ok: true };
}

export const Route = createFileRoute("/api/public/hooks/process-thread-jobs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
        if (!expected || apiKey !== expected) return unauthorized();

        const now = new Date().toISOString();
        const queuedCutoff = new Date(Date.now() - STUCK_QUEUED_MINUTES * 60_000).toISOString();
        const processingCutoff = new Date(Date.now() - STUCK_PROCESSING_MINUTES * 60_000).toISOString();

        const { data: candidates, error } = await supabaseAdmin
          .from("thread_jobs")
          .select("id, kind, status, updated_at, thread_id, conversation_id, participant_id, session_id, attempts")
          .or(
            `and(status.eq.queued,updated_at.lt.${queuedCutoff}),` +
            `and(status.eq.processing,updated_at.lt.${processingCutoff}),` +
            `and(status.eq.rate_limited,retry_after.lt.${now})`
          )
          .order("updated_at", { ascending: true })
          .limit(MAX_PER_TICK);

        if (error) {
          console.error("[process-thread-jobs] query failed", error);
          return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }

        const claimed: string[] = [];
        const failed: { jobId: string; error: string }[] = [];
        const completed: string[] = [];

        for (const job of candidates ?? []) {
          // Conditional claim by (id, updated_at) — concurrent ticks won't double-process.
          const { data: claim } = await supabaseAdmin
            .from("thread_jobs")
            .update({ status: "processing", attempts: (job.attempts ?? 0) + 1 })
            .eq("id", job.id)
            .eq("updated_at", job.updated_at)
            .select("id")
            .maybeSingle();
          if (!claim) continue;
          claimed.push(job.id);

          try {
            const result =
              job.kind === "summarize"
                ? await runSummarize({ id: job.id, thread_id: job.thread_id })
                : await runExtractFeatures({
                    id: job.id,
                    conversation_id: job.conversation_id,
                    participant_id: job.participant_id,
                    session_id: job.session_id,
                    thread_id: job.thread_id,
                  });

            if (result.ok) {
              await supabaseAdmin
                .from("thread_jobs")
                .update({ status: "completed", last_error: null, retry_after: null })
                .eq("id", job.id);
              completed.push(job.id);
            } else if (result.rateLimited) {
              await supabaseAdmin
                .from("thread_jobs")
                .update({
                  status: "rate_limited",
                  last_error: result.error ?? "rate limited",
                  retry_after: new Date(Date.now() + RATE_LIMIT_BACKOFF_MIN * 60_000).toISOString(),
                })
                .eq("id", job.id);
            } else {
              const dead = (job.attempts ?? 0) + 1 >= MAX_ATTEMPTS;
              await supabaseAdmin
                .from("thread_jobs")
                .update({
                  status: dead ? "dead_letter" : "failed",
                  last_error: result.error ?? "unknown error",
                })
                .eq("id", job.id);
              failed.push({ jobId: job.id, error: result.error ?? "unknown" });
            }
          } catch (e: any) {
            const dead = (job.attempts ?? 0) + 1 >= MAX_ATTEMPTS;
            await supabaseAdmin
              .from("thread_jobs")
              .update({
                status: dead ? "dead_letter" : "failed",
                last_error: e?.message ?? String(e),
              })
              .eq("id", job.id);
            failed.push({ jobId: job.id, error: e?.message ?? String(e) });
            console.error("[process-thread-jobs] processing failed", job.id, e);
          }
        }

        const payload = {
          scanned: candidates?.length ?? 0,
          claimed: claimed.length,
          completed: completed.length,
          failed: failed.length,
          failedSample: failed.slice(0, 3),
        };
        try {
          await supabaseAdmin.from("cron_heartbeats").upsert(
            {
              job_name: "process-thread-jobs",
              last_run_at: new Date().toISOString(),
              last_status: failed.length ? "partial" : "ok",
              last_payload: payload as any,
            } as any,
            { onConflict: "job_name" }
          );
        } catch (e) {
          console.error("[process-thread-jobs] heartbeat write failed", e);
        }

        return new Response(JSON.stringify({ ok: true, ...payload, failed }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
