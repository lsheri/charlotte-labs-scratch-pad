// Background processor for receipt generation jobs.
//
// Stage state machine (resumable):
//   queued -> building -> analyzing -> synthesizing -> recommendations -> completed
//
// Every stage is a DB checkpoint. If the Worker is killed mid-stage, the
// cron sweeper picks the job back up at exactly the current `stage` +
// `chunks_done` and continues. No work is repeated.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runStagedFluencyAnalysis, classifyBucket } from "@/server/fluency.server";
import { redactPII } from "@/lib/redact";

export interface ProcessReceiptOptions {
  workflowTypeSet?: boolean;
  saveAsTemplate?: boolean;
}

// Per-stage ceilings. None of these should exceed Worker wall-time.
const MAX_ATTEMPTS = 3;
// Outer wall-time cap for the analyzing stage. The single Gemini call inside
// runStagedFluencyAnalysis enforces its own per-call timeout (30s short /
// 75s long). This is just a backstop so a hung call can't pin the Worker.
const FLUENCY_STAGE_TIMEOUT_MS = 95_000;
const RECS_TIMEOUT_MS = 16_000;

async function setJob(jobId: string, patch: Record<string, any>) {
  await supabaseAdmin.from("receipt_jobs").update(patch as any).eq("id", jobId);
}

function etaSecondsFor(bucket: string, _remaining: number): number {
  // Per-bucket Gemini-measured constants. Single-call architecture means
  // there's no chunk math — ETA is just "how long does one Gemini call on
  // this size transcript take".
  switch (bucket) {
    case "small":  return 20;
    case "medium": return 35;
    case "large":  return 55;
    case "xlarge": return 80;
    default:       return 30;
  }
}

export async function processReceiptJob(jobId: string, opts: ProcessReceiptOptions = {}) {
  const { data: pre } = await supabaseAdmin
    .from("receipt_jobs")
    .select("id, status, stage, participant_id, thread_ids, label, workflow_type, workflow_type_extras, workflow_type_custom, tags, purpose, provenance, provenance_source, goal, receipt_id, attempts, bucket, chunks_total, chunks_done")
    .eq("id", jobId).single();
  if (!pre) throw new Error("Job not found");
  if ((pre as any).status === "completed") return;

  const attempts = ((pre as any).attempts ?? 0) + 1;
  let stage: string = (pre as any).stage || "queued";

  try {
    await setJob(jobId, { status: "processing", attempts });

    // -------- STAGE 1: BUILD --------
    // Create the receipt row + receipt_threads if not already present.
    let receiptId: string | null = (pre as any).receipt_id ?? null;
    let allTurns: { role: "user" | "assistant"; content: string; id?: string }[] = [];
    let sessionId: string;
    let firstTool: string;
    let owned: any[];

    {
      await setJob(jobId, {
        stage: "building",
        progress_label: "Assembling your conversation threads…",
      });

      const { data: threads } = await supabaseAdmin
        .from("chat_threads")
        .select("id, participant_id, session_id, tool, title")
        .in("id", (pre as any).thread_ids);
      owned = (threads ?? []).filter(t => t.participant_id === (pre as any).participant_id);
      if (!owned.length) throw new Error("No accessible threads");

      // Preserve the order the user selected threads in (job.thread_ids).
      const orderMap = new Map<string, number>(
        ((pre as any).thread_ids as string[]).map((id, i) => [id, i]),
      );
      owned.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));

      const turnsAccum: { role: "user" | "assistant"; content: string; id?: string }[] = [];
      const toolsSet = new Set<string>();
      const isMulti = owned.length > 1;
      let threadIdx = 0;
      for (const t of owned) {
        toolsSet.add(t.tool);
        const { data: cap } = await supabaseAdmin
          .from("ai_conversations").select("id")
          .eq("thread_id", t.id).order("captured_at", { ascending: false }).limit(1).maybeSingle();
        if (!cap) continue;
        const { data: turns } = await supabaseAdmin
          .from("conversation_turns").select("id, role, content, idx")
          .eq("conversation_id", cap.id).order("idx");
        const list = turns ?? [];
        if (!list.length) continue;
        // For multi-thread receipts, prepend a boundary marker to the first
        // turn so the model can tell where each source conversation begins.
        // Piggybacks on existing content — no schema change needed.
        threadIdx += 1;
        if (isMulti) {
          const header = `[--- Thread ${threadIdx} of ${owned.length} · tool: ${t.tool}${(t as any).title ? ` · "${(t as any).title}"` : ""} ---]\n\n`;
          list[0] = { ...list[0], content: header + (list[0].content ?? "") } as any;
        }
        list.forEach(x => turnsAccum.push({ role: x.role as any, content: x.content, id: (x as any).id }));
      }
      allTurns = turnsAccum;
      sessionId = owned[0].session_id;
      firstTool = owned[0].tool;

      // Token-overflow guard. Gemini 2.5 Pro has a 1M token context window;
      // we cap input at ~800K tokens (~3.2M chars at ~4 chars/token) to
      // leave headroom for the system prompt + output. Fail fast with a
      // user-actionable error instead of letting Gemini 400 silently.
      const totalChars = allTurns.reduce((n, x) => n + (x.content?.length ?? 0), 0);
      const CHAR_CAP = 3_200_000;
      if (totalChars > CHAR_CAP) {
        throw new Error(
          `Combined transcript is too large (${Math.round(totalChars / 1000)}K characters, ~${Math.round(totalChars / 4000)}K tokens). ` +
            `Maximum per receipt is ~${Math.round(CHAR_CAP / 1000)}K characters. Split your selection into smaller groups of threads.`,
        );
      }

      // Single-call architecture: always 1 logical chunk from the worker's POV.
      const bucket = classifyBucket(allTurns.length);
      const chunksTotal = 1;

      if (!receiptId) {
        const firstUser = allTurns.find(t => t.role === "user");
        const firstAssistant = allTurns.find(t => t.role === "assistant");
        const tools = Array.from(toolsSet);
        const tags = Array.isArray((pre as any).tags) ? (pre as any).tags as string[] : [];
        const purpose = (pre as any).purpose ?? null;
        const provenance = ((pre as any).provenance === "lab" || (pre as any).provenance === "personal")
          ? (pre as any).provenance : "personal";
        const provenanceSource = (pre as any).provenance_source ?? "auto_session";

        const { data: inserted, error: rErr } = await supabaseAdmin
          .from("receipts")
          .insert({
            session_id: sessionId,
            participant_id: (pre as any).participant_id,
            tool_used: firstTool,
            conversation_json: allTurns as any,
            prompt_preview: redactPII((firstUser?.content ?? (pre as any).label ?? "").slice(0, 500)),
            response_preview: redactPII((firstAssistant?.content ?? "").slice(0, 500)),
            metadata: {
              label: (pre as any).label,
              workflowType: ((pre as any).workflow_type as string) || "other",
              workflowTypeSet: !!opts.workflowTypeSet,
              workflowTypeExtras: Array.isArray((pre as any).workflow_type_extras)
                ? ((pre as any).workflow_type_extras as string[]) : [],
              workflowTypeCustom: (pre as any).workflow_type_custom ?? null,
              tags, purpose, provenance, provenanceSource,
              threadIds: owned.map(t => t.id),
              tools,
              goal: redactPII((pre as any).goal ?? null),
            },
          })
          .select("id").single();
        if (rErr || !inserted) throw new Error(rErr?.message ?? "Failed to create receipt");
        receiptId = inserted.id;

        // Persist receipt_id on the job IMMEDIATELY so a worker restart between
        // here and the end of the build stage doesn't create an orphan receipt
        // on retry.
        await setJob(jobId, { receipt_id: receiptId });

        // Idempotent: PK is (receipt_id, thread_id). On retry we no-op
        // existing rows instead of duplicate-key crashing.
        await supabaseAdmin
          .from("receipt_threads")
          .upsert(
            owned.map((t, i) => ({ receipt_id: receiptId as string, thread_id: t.id, position: i })),
            { onConflict: "receipt_id,thread_id", ignoreDuplicates: true },
          );

        if (opts.saveAsTemplate) {
          try {
            await supabaseAdmin.from("workflow_templates").insert({
              owner_id: (pre as any).participant_id,
              source_receipt_id: receiptId,
              name: (pre as any).label || "Untitled template",
              workflow_type: (pre as any).workflow_type ?? "other",
              tool_sequence: tools,
              tags, purpose, provenance,
              is_shared: false,
            } as any);
          } catch (e) {
            console.error("template save failed", e);
          }
        }
      }

      await setJob(jobId, {
        receipt_id: receiptId,
        bucket,
        chunks_total: chunksTotal,
        eta_seconds: etaSecondsFor(bucket, chunksTotal),
      });
    }

    // -------- STAGE 2: ANALYZE (single Gemini call, 1M context) --------
    // Check if fluency run already exists (re-entry after synthesis crash).
    const { data: existingRun } = await supabaseAdmin
      .from("fluency_analysis_runs")
      .select("run_id").eq("receipt_id", receiptId!).limit(1).maybeSingle();

    let fluencyError: string | null = null;

    if (!existingRun) {
      await setJob(jobId, {
        stage: "analyzing",
        progress_label: allTurns.length > 80
          ? `Analyzing your ${allTurns.length}-turn conversation…`
          : "Analyzing your AI fluency…",
        chunks_done: 0,
      });

      const stagedPromise = runStagedFluencyAnalysis({
        jobId,
        sessionId: sessionId!,
        participantId: (pre as any).participant_id,
        receiptId: receiptId!,
        toolUsed: firstTool!,
        turns: allTurns,
        goal: (pre as any).goal ?? null,
        onProgress: async ({ chunksDone, chunksTotal, bucket }) => {
          await setJob(jobId, {
            chunks_done: chunksDone,
            chunks_total: chunksTotal,
            progress_label: "Analyzing your AI fluency…",
            eta_seconds: etaSecondsFor(bucket, 1),
          });
        },
      });


      const fluencyResult: any = await Promise.race([
        stagedPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`fluency stage timed out after ${FLUENCY_STAGE_TIMEOUT_MS}ms`)), FLUENCY_STAGE_TIMEOUT_MS),
        ),
      ]).catch(e => ({ runId: null, error: e?.message ?? "fluency failed" }));

      if (!fluencyResult?.runId) {
        // Stage didn't complete. Mark as failed/dead but DO NOT proceed.
        // The cron sweeper will resume from here (chunks already persisted).
        throw new Error(fluencyResult?.error ?? "Fluency stage did not produce a run");
      }
      fluencyError = null;
    }

    // -------- STAGE 3: SYNTHESIZE (engine v1 ancillary tasks) --------
    await setJob(jobId, {
      stage: "synthesizing",
      progress_label: "Finalizing your fluency profile…",
    });

    // Non-blocking auxiliary jobs — never fail the receipt.
    try {
      const { detectChains, computeConstructSignals } = await import("@/server/prompt-telemetry.server");
      await Promise.all([
        detectChains(receiptId!, (pre as any).participant_id, sessionId!, owned![0]?.id ?? null, firstTool! ?? null),
        computeConstructSignals(receiptId!, (pre as any).participant_id, sessionId!, firstTool! ?? null),
      ]);
    } catch (e) { console.error("[engine-v1] chain/signal aggregation failed", e); }
    try {
      const { updateFluencyProfile, ensureReceiptHistorySnapshot } = await import("@/server/fluency-profile.server");
      await updateFluencyProfile(receiptId!, (pre as any).participant_id, sessionId!);
      await ensureReceiptHistorySnapshot(receiptId!, (pre as any).participant_id, sessionId!);
    } catch (e) { console.error("[engine-v1] profile/history failed", e); }

    // -------- STAGE 4: RECOMMENDATIONS --------
    await setJob(jobId, {
      stage: "recommendations",
      progress_label: "Generating personalized recommendations…",
      recommendations_status: "generating",
      eta_seconds: 15,
    } as any);

    try {
      const { generateRecommendationsForReceipt } = await import("@/server/recommendations.server");
      const recs: any = await Promise.race([
        generateRecommendationsForReceipt({ supabase: supabaseAdmin, receiptId: receiptId! }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`recommendations timed out after ${RECS_TIMEOUT_MS}ms`)), RECS_TIMEOUT_MS),
        ),
      ]);
      await setJob(jobId, { recommendations_status: recs?.status === "personalized" ? "completed" : "failed" } as any);
    } catch (e) {
      console.error("[receipt-job] recommendations failed (non-fatal)", e);
      await setJob(jobId, { recommendations_status: "failed" } as any);
    }

    // -------- DONE --------
    await setJob(jobId, {
      status: "completed",
      stage: "completed",
      progress_label: "Done",
      error: fluencyError,
      eta_seconds: 0,
    });
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    const isRateLimited = /\b429\b|rate[_\s-]?limit|too many requests|quota/i.test(msg);
    if (isRateLimited) {
      const jitterMs = (45 + Math.random() * 30) * 60_000;
      const retryAfter = new Date(Date.now() + jitterMs).toISOString();
      console.warn("[receipt-job] rate-limited, parking until", retryAfter);
      await setJob(jobId, {
        status: "rate_limited",
        progress_label: `AI provider is busy — auto-retry around ${new Date(retryAfter).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`,
        error: msg,
        retry_after: retryAfter,
        attempts: attempts - 1,
      } as any);
      return;
    }
    console.error("[receipt-job] failed", err, "attempt", attempts, "stage", stage);
    const isDead = attempts >= MAX_ATTEMPTS;
    await setJob(jobId, {
      status: isDead ? "dead_letter" : "failed",
      progress_label: isDead
        ? "Permanently failed after multiple attempts"
        : "Analysis could not complete (will retry)",
      error: msg,
    });
  }
}
