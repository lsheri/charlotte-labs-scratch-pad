import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { kickThreadQueue } from "@/server/thread-queue-kick.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const PayloadSchema = z.object({
  tool: z.string().min(1),
  url: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  prompt: z.string().min(1),
  response: z.string().optional().default(""),
  turns: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
  })).optional(),
  capturedAt: z.string().optional(),
  joinCode: z.string().optional(),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function normalizeThreadKey(url: string | null | undefined, prompt: string): string {
  if (url) {
    const stripped = url.replace(/\?.*$/, "").toLowerCase();
    if (stripped) return stripped;
  }
  return "hash:" + createHash("sha256").update(prompt.slice(0, 500)).digest("hex").slice(0, 32);
}

function hashTranscript(turns: { role: string; content: string }[]): string {
  const joined = turns.map(t => `${t.role}:${t.content}`).join("\n---\n");
  return createHash("sha256").update(joined).digest("hex");
}

export const Route = createFileRoute("/api/public/capture-conversation")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.replace(/^Bearer\s+/i, "").trim();
        if (!token) return json({ error: "Missing bearer token" }, 401);

        const tokenHash = createHash("sha256").update(token).digest("hex");
        const { data: tokenRow } = await supabaseAdmin
          .from("extension_tokens")
          .select("participant_id, expires_at, revoked")
          .eq("token", tokenHash)
          .maybeSingle();
        if (!tokenRow || tokenRow.revoked || new Date(tokenRow.expires_at) < new Date()) {
          return json({ error: "Invalid or expired token" }, 401);
        }
        const participantId = tokenRow.participant_id;

        let body: z.infer<typeof PayloadSchema>;
        try { body = PayloadSchema.parse(await request.json()); }
        catch (e: any) { return json({ error: "Invalid payload", detail: e.message }, 400); }

        // Resolve session
        let sessionId: string | null = null;
        if (body.joinCode) {
          const { data: s } = await supabaseAdmin
            .from("research_sessions").select("id").eq("join_code", body.joinCode).maybeSingle();
          if (s) {
            const { data: m } = await supabaseAdmin
              .from("session_participants")
              .select("consent_accepted_at")
              .eq("session_id", s.id).eq("participant_id", participantId).maybeSingle();
            if (m?.consent_accepted_at) sessionId = s.id;
          }
        }
        if (!sessionId) {
          // Unified resolver: most-recent research workspace, else personal workspace
          // (auto-created on demand). Captures NEVER get dropped silently.
          const { getActiveCaptureTarget } = await import("@/server/participant.server");
          const target = await getActiveCaptureTarget(participantId);
          sessionId = target?.sessionId ?? null;
        }
        if (!sessionId) return json({ error: "Could not resolve a workspace for this capture" }, 500);

        const turns = body.turns?.length
          ? body.turns
          : [
              { role: "user" as const, content: body.prompt },
              ...(body.response ? [{ role: "assistant" as const, content: body.response }] : []),
            ];

        const threadKey = normalizeThreadKey(body.url, body.prompt);
        const transcriptHash = hashTranscript(turns);
        const capturedAt = body.capturedAt ?? new Date().toISOString();

        // Upsert thread
        const { data: existingThread } = await supabaseAdmin
          .from("chat_threads")
          .select("id")
          .eq("participant_id", participantId)
          .eq("tool", body.tool)
          .eq("thread_key", threadKey)
          .maybeSingle();

        let threadId = existingThread?.id;
        if (!threadId) {
          const { data: newThread, error: tErr } = await supabaseAdmin
            .from("chat_threads")
            .insert({
              participant_id: participantId,
              session_id: sessionId,
              tool: body.tool,
              thread_key: threadKey,
              title: body.title ?? body.prompt.slice(0, 80),
              last_url: body.url ?? null,
              first_captured_at: capturedAt,
              last_captured_at: capturedAt,
              turn_count: turns.length,
            })
            .select("id").single();
          if (tErr || !newThread) return json({ error: "Failed to create thread", detail: tErr?.message }, 500);
          threadId = newThread.id;
        } else {
          await supabaseAdmin
            .from("chat_threads")
            .update({
              last_captured_at: capturedAt,
              turn_count: turns.length,
              title: body.title ?? undefined,
              last_url: body.url ?? undefined,
              session_id: sessionId,
            })
            .eq("id", threadId);
        }

        // Dedupe: skip if same transcript_hash already exists for this thread
        const { data: dup } = await supabaseAdmin
          .from("ai_conversations")
          .select("id")
          .eq("thread_id", threadId)
          .eq("transcript_hash", transcriptHash)
          .maybeSingle();
        if (dup) {
          return json({ ok: true, threadId, captureId: dup.id, deduped: true });
        }

        const { data: conv, error: convErr } = await supabaseAdmin
          .from("ai_conversations")
          .insert({
            session_id: sessionId,
            participant_id: participantId,
            thread_id: threadId,
            transcript_hash: transcriptHash,
            tool: body.tool,
            url: body.url ?? null,
            title: body.title ?? null,
            prompt_text: body.prompt.slice(0, 8000),
            captured_at: capturedAt,
            source: "extension",
            raw_payload: { tool: body.tool, url: body.url ?? null, capturedAt: body.capturedAt ?? null, turnCount: turns.length },
          })
          .select("id").single();
        if (convErr || !conv) return json({ error: "Failed to store capture", detail: convErr?.message }, 500);

        if (turns.length) {
          await supabaseAdmin.from("conversation_turns").insert(
            turns.map((t, idx) => ({ conversation_id: conv.id, role: t.role, content: t.content, idx }))
          );
        }

        // Enqueue background work via thread_jobs queue.
        // Capture stays fast and stateless — the cron sweeper drains the
        // queue with retries and rate-limit awareness. See
        // src/routes/api/public/hooks/process-thread-jobs.ts.
        try {
          // 1) extract_features: cheap per-turn signal extraction. Always enqueue.
          await supabaseAdmin
            .from("thread_jobs")
            .insert({
              thread_id: threadId,
              conversation_id: conv.id,
              participant_id: participantId,
              session_id: sessionId,
              kind: "extract_features",
              status: "queued",
            } as any);

          // 2) summarize: debounced — only enqueue if the thread has changed
          //    enough to warrant a new gateway call.
          //      • >=5 new user turns since last summary, OR summary is null
          //      • last summary >=30 min old (or never)
          //      • <3 refreshes already today (rolling daily cap)
          const { data: t } = await supabaseAdmin
            .from("chat_threads")
            .select("turn_count, last_summarized_turn_count, summary, summary_generated_at, summary_refresh_count_today, summary_refresh_day")
            .eq("id", threadId)
            .maybeSingle();
          if (t) {
            const today = new Date().toISOString().slice(0, 10);
            const sameDay = t.summary_refresh_day === today;
            const refreshesToday = sameDay ? (t.summary_refresh_count_today ?? 0) : 0;
            const turnDelta = (t.turn_count ?? 0) - (t.last_summarized_turn_count ?? 0);
            const ageMs = t.summary_generated_at
              ? Date.now() - new Date(t.summary_generated_at).getTime()
              : Number.POSITIVE_INFINITY;
            const turnGate = !t.summary || turnDelta >= 5;
            const ageGate = !t.summary_generated_at || ageMs >= 30 * 60_000;
            const capGate = refreshesToday < 3;
            if (turnGate && ageGate && capGate) {
              await supabaseAdmin
                .from("thread_jobs")
                .insert({
                  thread_id: threadId,
                  participant_id: participantId,
                  session_id: sessionId,
                  kind: "summarize",
                  status: "queued",
                } as any);
            }
          }
        } catch (e) {
          // Partial unique index conflict (active job already exists) is expected;
          // anything else logs but never fails the capture.
          console.warn("[capture] enqueue thread_jobs", (e as any)?.message ?? e);
        }

        // Fire-and-forget kick — sweeper starts work in ~1–2s instead of
        // waiting up to 6h for the next cron tick.
        kickThreadQueue();

        // Inline: tool history is a single fast write, no gateway involved.
        try {
          const { updateParticipantToolHistory } =
            await import("@/server/prompt-telemetry.server");
          void updateParticipantToolHistory(participantId, body.tool, capturedAt)
            .catch((e) => console.error("[prompt-telemetry] updateParticipantToolHistory failed", e));
        } catch (e) {
          console.error("[prompt-telemetry] import failed", e);
        }

        return json({ ok: true, threadId, captureId: conv.id, deduped: false });
      },
    },
  },
});
