import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { kickReceiptQueue } from "@/server/receipt-queue-kick.server";

const DAILY_WORKFLOW_LIMIT = 7;
const WORKFLOW_LIMIT_EXEMPT_EMAILS = new Set(["liam@charlotte-labs.com"]);

async function isWorkflowLimitExempt(
  supabaseAdmin: {
    auth: {
      admin: {
        getUserById: (
          userId: string,
        ) => Promise<{ data?: { user: { email?: string | null } | null } }>;
      };
    };
  },
  userId: string,
) {
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  const email = data?.user?.email?.toLowerCase();
  return Boolean(email && WORKFLOW_LIMIT_EXEMPT_EMAILS.has(email));
}

export const listMyThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("chat_threads")
      .select(
        "id, tool, title, turn_count, last_captured_at, first_captured_at, session_id, summary, summary_generated_at",
      )
      .eq("participant_id", context.userId)
      .order("last_captured_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    // Backfill stale/missing summaries in the background (cap 10).
    const stale = (data ?? [])
      .filter(
        (t) =>
          !t.summary ||
          !t.summary_generated_at ||
          new Date(t.summary_generated_at) < new Date(t.last_captured_at),
      )
      .slice(0, 10);
    if (stale.length) {
      try {
        const { scheduleSummarize } = await import("@/server/thread-summary.server");
        stale.forEach((t) => scheduleSummarize(t.id));
      } catch {}
    }
    return { threads: data ?? [] };
  });

export const getThread = createServerFn({ method: "GET" })
  .inputValidator(z.object({ threadId: z.string().uuid() }).parse)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: thread, error } = await supabase
      .from("chat_threads")
      .select("*")
      .eq("id", data.threadId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!thread) throw new Error("Thread not found");

    const { data: captures } = await supabase
      .from("ai_conversations")
      .select("id, captured_at, title, url, prompt_text, source")
      .eq("thread_id", data.threadId)
      .order("captured_at", { ascending: false });

    const latest = captures?.[0];
    let turns: { id: string; role: string; content: string; idx: number }[] = [];
    if (latest) {
      const { data: t } = await supabase
        .from("conversation_turns")
        .select("id, role, content, idx")
        .eq("conversation_id", latest.id)
        .order("idx");
      turns = t ?? [];
    }
    return { thread, captures: captures ?? [], turns };
  });

export const deleteThread = createServerFn({ method: "POST" })
  .inputValidator(z.object({ threadId: z.string().uuid() }).parse)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // Cascade: turns -> captures -> receipt_threads links -> thread
    const { data: caps } = await supabase
      .from("ai_conversations")
      .select("id")
      .eq("thread_id", data.threadId);
    const capIds = (caps ?? []).map((c) => c.id);
    if (capIds.length) {
      await supabase.from("conversation_turns").delete().in("conversation_id", capIds);
      await supabase.from("ai_conversations").delete().in("id", capIds);
    }
    await supabase.from("receipt_threads").delete().eq("thread_id", data.threadId);
    const { error } = await supabase.from("chat_threads").delete().eq("id", data.threadId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createReceiptFromThreads = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      threadIds: z.array(z.string().uuid()).min(1),
      label: z.string().optional(),
      workflowType: z
        .enum([
          "document",
          "presentation",
          "spreadsheet",
          "code",
          "app",
          "communication",
          "brainstorm",
          "research",
          "plan",
          "study",
          "data-analysis",
          "creative",
          "other",
          "custom",
        ])
        .optional(),
      workflowTypeSet: z.boolean().optional(),
      /** Up to 2 secondary types — purely for tagging, do not affect analysis. */
      workflowTypeExtras: z
        .array(
          z.enum([
            "document",
            "presentation",
            "spreadsheet",
            "code",
            "app",
            "communication",
            "brainstorm",
            "research",
            "plan",
            "study",
            "data-analysis",
            "creative",
            "other",
            "custom",
          ]),
        )
        .max(2)
        .optional(),
      /** Free-text label when workflowType === "custom". */
      workflowTypeCustom: z.string().trim().min(1).max(32).optional(),
      purpose: z.enum(["work", "school", "personal", "client", "research", "other"]).optional(),
      tags: z.array(z.string().min(1).max(24)).max(5).optional(),
      saveAsTemplate: z.boolean().optional(),
      provenance: z.enum(["lab", "personal"]).optional(),
      provenanceUserOverride: z.boolean().optional(),
      goal: z.string().max(200).optional(),
    }).parse,
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // processReceiptJob is no longer called inline — the cron sweeper handles it.
    const { normalizeTags, inferProvenanceForCreate } = await import("@/lib/displayNames");
    const userId = context.userId;

    // Validate ownership upfront so we don't enqueue useless work
    const { data: threads } = await supabaseAdmin
      .from("chat_threads")
      .select("id, participant_id, session_id")
      .in("id", data.threadIds);
    const owned = (threads ?? []).filter((t) => t.participant_id === userId);
    if (!owned.length) throw new Error("No accessible threads");

    // Daily submission cap: 4 receipts per rolling 24h window per participant.
    // Counts both completed receipts and queued/processing jobs so users can't
    // burst-submit while jobs are in flight. Multi-workspace splits each count
    // separately because each produces a distinct receipt.
    const isExemptFromDailyLimit = await isWorkflowLimitExempt(supabaseAdmin, userId);
    const DAILY_LIMIT = DAILY_WORKFLOW_LIMIT;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [{ count: receiptCount }, { count: jobCount }] = await Promise.all([
      supabaseAdmin
        .from("receipts")
        .select("id", { count: "exact", head: true })
        .eq("participant_id", userId)
        .gte("created_at", since),
      supabaseAdmin
        .from("receipt_jobs")
        .select("id", { count: "exact", head: true })
        .eq("participant_id", userId)
        .gte("created_at", since)
        .in("status", ["queued", "processing"]),
    ]);
    const used = (receiptCount ?? 0) + (jobCount ?? 0);
    const groupCount = new Set(owned.map((t) => t.session_id ?? "__none__")).size;
    if (!isExemptFromDailyLimit && used + groupCount > DAILY_LIMIT) {
      const remaining = Math.max(0, DAILY_LIMIT - used);
      throw new Error(
        `Daily limit reached — you can submit ${DAILY_LIMIT} receipts per 24 hours. ` +
          `You have ${remaining} remaining and this submission would create ${groupCount}. Try again later.`,
      );
    }

    const cleanTags = normalizeTags(data.tags ?? []);

    // Resolve workspace names so we can disambiguate the labels for
    // multi-workspace selections (e.g. "My label (Personal)" vs
    // "My label (Research: Spring Pilot)").
    const sessionIds = Array.from(
      new Set(owned.map((t) => t.session_id).filter(Boolean) as string[]),
    );
    const sessionMeta = new Map<string, { name: string; kind: string }>();
    if (sessionIds.length) {
      const { data: sess } = await supabaseAdmin
        .from("research_sessions")
        .select("id, name, kind")
        .in("id", sessionIds);
      (sess ?? []).forEach((s) =>
        sessionMeta.set(s.id, { name: s.name, kind: (s as any).kind ?? "research" }),
      );
    }
    const workspaceLabel = (sid: string | null) => {
      if (!sid) return "Unfiled";
      const m = sessionMeta.get(sid);
      if (!m) return "Workspace";
      return m.kind === "personal" ? "Personal" : `Research: ${m.name}`;
    };

    // Group threads by workspace. Cross-workspace selections become N
    // separate receipts (one per workspace) so research data and personal
    // work never get co-mingled in a single receipt.
    const groups = new Map<string, { sessionId: string | null; threadIds: string[] }>();
    for (const t of owned) {
      const key = t.session_id ?? "__none__";
      const g = groups.get(key) ?? { sessionId: t.session_id, threadIds: [] };
      g.threadIds.push(t.id);
      groups.set(key, g);
    }

    const multi = groups.size > 1;
    const baseLabel = data.label ?? null;

    const jobIds: string[] = [];
    for (const [, group] of groups) {
      const inSession = !!group.sessionId;
      const { provenance, provenanceSource } = inferProvenanceForCreate({
        inSession,
        userPicked: data.provenanceUserOverride ? (data.provenance ?? null) : null,
      });
      const suffix = multi ? ` (${workspaceLabel(group.sessionId)})` : "";
      const label = baseLabel
        ? `${baseLabel}${suffix}`
        : multi
          ? workspaceLabel(group.sessionId)
          : null;

      // Dedupe extras: drop primary, dedupe, cap 2
      const extras = (data.workflowTypeExtras ?? [])
        .filter((t) => t !== (data.workflowType ?? "other"))
        .filter((t, i, a) => a.indexOf(t) === i)
        .slice(0, 2);
      const customLabel = data.workflowType === "custom" ? (data.workflowTypeCustom ?? null) : null;

      const { data: job, error } = await supabaseAdmin
        .from("receipt_jobs")
        .insert({
          participant_id: userId,
          thread_ids: group.threadIds,
          label,
          // Default to 'other' so the DB enforcement trigger never blocks a
          // user submission. workflowTypeSet (in receipts.metadata) records
          // whether the user actually picked a type vs accepted the default.
          workflow_type: data.workflowType ?? "other",
          workflow_type_extras: extras,
          workflow_type_custom: customLabel,
          tags: cleanTags,
          purpose: data.purpose ?? null,
          provenance,
          provenance_source: provenanceSource,
          goal: data.goal ?? null,
          status: "queued",
        } as any)
        .select("id")
        .single();
      if (error || !job) {
        const raw = error?.message ?? "";
        // The DB trigger enforce_receipt_job_daily_cap raises with ERRCODE
        // 'check_violation' and a 'Daily workflow generation limit' message.
        // Convert to a clean, user-facing message the toast can show as-is.
        if (/daily workflow generation limit/i.test(raw) || (error as any)?.code === "23514") {
          throw new Error(
            "You've hit today's 4-workflow limit. Quality > quantity — come back in 24 hours and your next one will count more.",
          );
        }
        throw new Error(raw || "Failed to enqueue job");
      }
      jobIds.push(job.id);
    }

    // Fire-and-forget kick — sweeper starts the job in ~1–2s instead of
    // waiting up to 6h for the next cron tick. Errors swallowed; cron is
    // the safety net.
    kickReceiptQueue();

    // Return immediately. The sweeper runs the full pipeline in the
    // background. The client navigates to /participant/receipts where
    // PendingReceiptJobCard polls for status and shows the corner pill
    // until completion.
    return { ok: true, jobId: jobIds[0], jobIds, splitCount: jobIds.length };
  });

export const getReceiptJob = createServerFn({ method: "GET" })
  .inputValidator(z.object({ jobId: z.string().uuid() }).parse)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: job, error } = await supabase
      .from("receipt_jobs")
      .select("id, status, stage, bucket, chunks_total, chunks_done, eta_seconds, progress_label, receipt_id, error, created_at, updated_at, recommendations_status")
      .eq("id", data.jobId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!job) throw new Error("Job not found");
    return { job };
  });

const ALLOWED_TOOLS = [
  "chatgpt",
  "claude",
  "gemini",
  "copilot",
  "perplexity",
  "grok",
  "deepseek",
  "lovable",
  "bolt",
  "other",
] as const;

export const createManualThread = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      title: z.string().trim().min(1).max(200),
      tool: z.enum(ALLOWED_TOOLS),
      transcript: z.string().trim().min(1).max(200_000),
      turns: z
        .array(
          z.object({
            role: z.enum(["user", "assistant"]),
            content: z
              .string()
              .transform((s) => s.trim())
              .pipe(z.string().min(1).max(200_000)),
          }),
        )
        .min(1)
        .max(2000),
      sourceFilename: z.string().max(200).optional(),
    }).parse,
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { createHash } = await import("crypto");
    const userId = context.userId;

    // Resolve active consented session — exclude withdrawn memberships.
    const { data: mem } = await supabaseAdmin
      .from("session_participants")
      .select("session_id, joined_at, consent_accepted_at, withdrawn_at")
      .eq("participant_id", userId)
      .not("consent_accepted_at", "is", null)
      .is("withdrawn_at", null)
      .order("joined_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const sessionId = mem?.session_id ?? null;
    if (!sessionId) throw new Error("Join a research session before uploading conversations.");

    const now = new Date().toISOString();
    const turnsJoined = data.turns.map((t) => `${t.role}:${t.content}`).join("\n---\n");
    const transcriptHash = createHash("sha256").update(turnsJoined).digest("hex");
    // Use parsed-turns hash for thread_key too — re-uploading the same file with
    // role flips will then produce a *different* thread, preserving corrections.
    const threadKey = "manual:" + transcriptHash.slice(0, 32);

    const { data: existingThread } = await supabaseAdmin
      .from("chat_threads")
      .select("id")
      .eq("participant_id", userId)
      .eq("thread_key", threadKey)
      .maybeSingle();
    if (existingThread) return { ok: true, threadId: existingThread.id, deduped: true };

    const { data: thread, error: tErr } = await supabaseAdmin
      .from("chat_threads")
      .insert({
        participant_id: userId,
        session_id: sessionId,
        tool: data.tool,
        thread_key: threadKey,
        title: data.title,
        first_captured_at: now,
        last_captured_at: now,
        turn_count: data.turns.length,
      })
      .select("id")
      .single();
    if (tErr || !thread) throw new Error(tErr?.message ?? "Failed to create thread");

    const firstUser = data.turns.find((t) => t.role === "user")?.content ?? data.turns[0].content;
    const { data: conv, error: cErr } = await supabaseAdmin
      .from("ai_conversations")
      .insert({
        session_id: sessionId,
        participant_id: userId,
        thread_id: thread.id,
        transcript_hash: transcriptHash,
        tool: data.tool,
        title: data.title,
        prompt_text: firstUser.slice(0, 8000),
        captured_at: now,
        source: "manual",
        raw_payload: {
          manualUpload: true,
          filename: data.sourceFilename ?? null,
          detectedTool: data.tool,
          turnCount: data.turns.length,
        },
      })
      .select("id")
      .single();
    if (cErr || !conv) {
      // Roll back the thread to avoid an orphan with turn_count but no turns.
      await supabaseAdmin.from("chat_threads").delete().eq("id", thread.id);
      throw new Error(cErr?.message ?? "Failed to store conversation");
    }

    const { error: turnsErr } = await supabaseAdmin.from("conversation_turns").insert(
      data.turns.map((t, idx) => ({
        conversation_id: conv.id,
        role: t.role,
        content: t.content,
        idx,
      })),
    );
    if (turnsErr) {
      await supabaseAdmin.from("ai_conversations").delete().eq("id", conv.id);
      await supabaseAdmin.from("chat_threads").delete().eq("id", thread.id);
      throw new Error(turnsErr.message);
    }

    try {
      const { scheduleSummarize } = await import("@/server/thread-summary.server");
      scheduleSummarize(thread.id);
    } catch {}

    return { ok: true, threadId: thread.id, deduped: false };
  });

export const listIncompleteReceiptJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    // Surface ANY non-completed job (with or without receipt_id). Previously
    // we filtered `.is(receipt_id, null)`, which hid jobs whose receipt row
    // existed but whose pipeline had stalled mid-fluency/recommendations —
    // the UI then sat on an empty "loading" state forever.
    const { data, error } = await supabase
      .from("receipt_jobs")
      .select(
        "id, status, progress_label, error, created_at, updated_at, label, attempts, retry_after, receipt_id, recommendations_status",
      )
      .eq("participant_id", context.userId)
      .neq("status", "completed")
      .in("status", [
        "queued",
        "processing",
        "building",
        "analyzing",
        "failed",
        "dead_letter",
        "rate_limited",
      ])
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return { jobs: data ?? [] };
  });

export const retryReceiptJob = createServerFn({ method: "POST" })
  .inputValidator(z.object({ jobId: z.string().uuid() }).parse)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { processReceiptJob } = await import("@/server/receipt-jobs.server");
    const { data: job } = await supabaseAdmin
      .from("receipt_jobs")
      .select("id, participant_id, receipt_id")
      .eq("id", data.jobId)
      .maybeSingle();
    if (!job || job.participant_id !== context.userId) throw new Error("Not found");
    if (job.receipt_id) return { ok: true, receiptId: job.receipt_id };
    await supabaseAdmin
      .from("receipt_jobs")
      .update({
        status: "queued",
        error: null,
        progress_label: null,
        attempts: 0,
        retry_after: null,
      } as any)
      .eq("id", data.jobId);
    try {
      await processReceiptJob(data.jobId, {});
    } catch (e) {
      console.error("retry inline failed", e);
    }
    return { ok: true };
  });

export const dismissReceiptJob = createServerFn({ method: "POST" })
  .inputValidator(z.object({ jobId: z.string().uuid() }).parse)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: job } = await supabaseAdmin
      .from("receipt_jobs")
      .select("id, participant_id, status, receipt_id")
      .eq("id", data.jobId)
      .maybeSingle();
    if (!job || job.participant_id !== context.userId) throw new Error("Not found");
    // Allow dismissing failed/dead_letter/rate_limited jobs even if a
    // receipt_id was attached (partial pipelines often leave an orphan).
    // For still-active jobs, require no receipt_id to avoid orphaning a
    // real receipt.
    const terminal = new Set(["failed", "dead_letter", "rate_limited"]);
    if (!terminal.has(job.status) && job.receipt_id) {
      throw new Error("Cannot dismiss a completed receipt job");
    }
    const { error } = await supabaseAdmin
      .from("receipt_jobs")
      .delete()
      .eq("id", data.jobId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Admin-scoped receipt job management
// ---------------------------------------------------------------------------

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  if (!(data ?? []).some((r: any) => r.role === "admin")) {
    throw new Error("Forbidden: admin only");
  }
}

export const adminListReceiptJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("receipt_jobs")
      .select(
        "id, status, progress_label, error, created_at, updated_at, label, attempts, retry_after, participant_id, receipt_id",
      )
      .in("status", [
        "queued",
        "processing",
        "building",
        "analyzing",
        "failed",
        "dead_letter",
        "rate_limited",
      ])
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { jobs: data ?? [] };
  });

export const adminRetryReceiptJob = createServerFn({ method: "POST" })
  .inputValidator(z.object({ jobId: z.string().uuid() }).parse)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { processReceiptJob } = await import("@/server/receipt-jobs.server");
    const { data: job } = await supabaseAdmin
      .from("receipt_jobs")
      .select("id, status, receipt_id")
      .eq("id", data.jobId)
      .maybeSingle();
    if (!job) throw new Error("Not found");

    // If the job already completed cleanly, there's nothing to retry.
    if (job.status === "completed") {
      return { ok: true, receiptId: job.receipt_id ?? null, alreadyDone: true };
    }

    // Force re-queue: reset attempts/error/retry_after so the worker (or the
    // inline call below) will pick it up again. processReceiptJob handles the
    // resume case correctly when receipt_id is already set — it will pick up
    // at the fluency step instead of duplicating the receipt.
    await supabaseAdmin
      .from("receipt_jobs")
      .update({
        status: "queued",
        error: null,
        progress_label: "Re-queued by admin…",
        attempts: 0,
        retry_after: null,
      } as any)
      .eq("id", data.jobId);

    // Kick it off inline so the admin sees movement immediately. The cron
    // sweeper is a safety net if this throws.
    try {
      await processReceiptJob(data.jobId, {});
    } catch (e) {
      console.error("[admin retry] inline failed", e);
    }
    return { ok: true, receiptId: job.receipt_id ?? null };
  });

export const adminDismissReceiptJob = createServerFn({ method: "POST" })
  .inputValidator(z.object({ jobId: z.string().uuid() }).parse)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Admin dismiss removes the job row regardless of whether a receipt was
    // already created. The receipt itself (if any) is left intact — only the
    // queue entry is cleared so the panel stops showing it.
    const { error } = await supabaseAdmin.from("receipt_jobs").delete().eq("id", data.jobId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getCronHeartbeat = createServerFn({ method: "GET" })
  .inputValidator(z.object({ jobName: z.string() }).parse)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("cron_heartbeats")
      .select("*")
      .eq("job_name", data.jobName)
      .maybeSingle();
    return { heartbeat: row ?? null };
  });

export const getDailyWorkflowUsage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const isExemptFromDailyLimit = await isWorkflowLimitExempt(supabaseAdmin, context.userId);
    const DAILY_LIMIT = DAILY_WORKFLOW_LIMIT;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [{ count: receiptCount }, { count: jobCount }] = await Promise.all([
      supabaseAdmin
        .from("receipts")
        .select("id", { count: "exact", head: true })
        .eq("participant_id", context.userId)
        .gte("created_at", since),
      supabaseAdmin
        .from("receipt_jobs")
        .select("id", { count: "exact", head: true })
        .eq("participant_id", context.userId)
        .gte("created_at", since)
        .in("status", ["queued", "processing"]),
    ]);
    const used = (receiptCount ?? 0) + (jobCount ?? 0);
    return {
      used,
      limit: DAILY_LIMIT,
      remaining: Math.max(0, DAILY_LIMIT - used),
      exempt: isExemptFromDailyLimit,
    };
  });

// ---------------------------------------------------------------------------
// Receipt run diagnostics (admin, read-only)
// Returns recent receipt_jobs across ALL statuses (including completed) joined
// with their correlated ai_provider_events. Purely observational — does not
// touch the queue, the worker, or any generation step.
// ---------------------------------------------------------------------------
export const adminListReceiptRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: jobs, error } = await supabaseAdmin
      .from("receipt_jobs")
      .select(
        "id, status, stage, progress_label, error, created_at, updated_at, label, attempts, retry_after, participant_id, receipt_id, workflow_type, thread_ids, bucket, chunks_total, chunks_done, recommendations_status",
      )
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);

    const receiptIds = (jobs ?? [])
      .map((j: any) => j.receipt_id)
      .filter((x: string | null): x is string => !!x);

    // Pull provider events for these receipts (last 24h window is enough since
    // any older job would not be actively troubleshooted anyway).
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: events } = receiptIds.length
      ? await supabaseAdmin
          .from("ai_provider_events" as any)
          .select(
            "id, created_at, label, provider, model, status, http_status, latency_ms, error_message, receipt_id",
          )
          .in("receipt_id", receiptIds)
          .gte("created_at", dayAgo)
          .order("created_at", { ascending: true })
      : { data: [] as any[] };

    const eventsByReceipt = new Map<string, any[]>();
    for (const e of (events ?? []) as any[]) {
      if (!e.receipt_id) continue;
      const arr = eventsByReceipt.get(e.receipt_id) ?? [];
      arr.push(e);
      eventsByReceipt.set(e.receipt_id, arr);
    }

    return {
      jobs: (jobs ?? []).map((j: any) => ({
        ...j,
        events: j.receipt_id ? (eventsByReceipt.get(j.receipt_id) ?? []) : [],
      })),
    };
  });
