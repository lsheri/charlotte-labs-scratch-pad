// Cron-triggered safety net for receipt generation.
//
// Why this exists:
//   The primary receipt path awaits processReceiptJob inline inside the
//   createReceiptFromThreads server function, so most jobs complete during
//   the originating request. This endpoint is the FAILSAFE: it picks up
//   any job that got stuck because its worker died mid-flight, the user
//   closed the tab during processing, or fluency analysis crashed.
//
// Claim semantics (safe for concurrent cron ticks):
//   - Stuck = status='queued' for >2 min OR status='processing' for >10 min.
//   - We claim by issuing a conditional UPDATE on the (id, updated_at) tuple
//     so two concurrent ticks can't double-process the same row.
//
// Auth:
//   /api/public/* bypasses session auth. We additionally require the
//   Supabase publishable key in the `apikey` header so random internet
//   traffic can't trigger receipt regeneration.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Receipt jobs are processed entirely by this sweeper now (inline await
// was removed — workers terminated mid-flight on Cloudflare). Keep this
// threshold short so newly queued jobs are picked up on the very next tick.
// 0 = pick up freshly-queued jobs on the same tick. The kick from
// createReceiptFromThreads fires immediately after insert, so any positive
// cutoff would force the kick to skip its own job and wait for the next
// kick or the 6-hour cron tick.
const STUCK_QUEUED_MINUTES = 0;
// Workers can still be terminated mid-AI call. Keep the recovery window tight
// enough to avoid multi-minute limbo, but longer than a healthy fast attempt.
const STUCK_ANALYZING_MINUTES = 1;
const STUCK_BUILDING_MINUTES = 1;
const STUCK_PROCESSING_MINUTES = 10;
// 1 job per tick — running multiple jobs concurrently in the same
// Cloudflare Worker request causes them to share one CPU budget and
// kills both. Throughput is still 60/hr which covers 100 users × 4/day
// = 400/day with 10x headroom. Raise only after moving each job to its
// own dedicated worker request.
const MAX_PER_TICK = 1;
// Hard cap on retries. Mirrors MAX_ATTEMPTS in receipt-jobs.server.ts.
// Enforced at claim time because CPU-kills bypass the in-handler catch
// that normally flips status to 'dead_letter'.
const MAX_ATTEMPTS = 3;


function unauthorized() {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401, headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/hooks/process-receipt-jobs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey") ?? "";
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
        if (!expected || apiKey !== expected) return unauthorized();

        const now = new Date().toISOString();
        const queuedCutoff = new Date(Date.now() - STUCK_QUEUED_MINUTES * 60_000).toISOString();
        const processingCutoff = new Date(Date.now() - STUCK_PROCESSING_MINUTES * 60_000).toISOString();
        const analyzingCutoff = new Date(Date.now() - STUCK_ANALYZING_MINUTES * 60_000).toISOString();
        const buildingCutoff = new Date(Date.now() - STUCK_BUILDING_MINUTES * 60_000).toISOString();

        const [qStuckQueued, qStuckProcessing, qStuckBuilding, qStuckAnalyzing, qStuckFailed, qRateReady] = await Promise.all([
          supabaseAdmin.from("receipt_jobs").select("id, status, updated_at, attempts")
            .eq("status", "queued").lt("updated_at", queuedCutoff)
            .order("updated_at", { ascending: true }).limit(MAX_PER_TICK),
          supabaseAdmin.from("receipt_jobs").select("id, status, updated_at, attempts")
            .eq("status", "processing").lt("updated_at", processingCutoff)
            .order("updated_at", { ascending: true }).limit(MAX_PER_TICK),
          supabaseAdmin.from("receipt_jobs").select("id, status, updated_at, attempts")
            .eq("status", "building").lt("updated_at", buildingCutoff)
            .order("updated_at", { ascending: true }).limit(MAX_PER_TICK),
          supabaseAdmin.from("receipt_jobs").select("id, status, updated_at, attempts")
            .eq("status", "processing").eq("stage", "analyzing").lt("updated_at", analyzingCutoff)
            .order("updated_at", { ascending: true }).limit(MAX_PER_TICK),
          supabaseAdmin.from("receipt_jobs").select("id, status, updated_at, attempts")
            .eq("status", "failed").lt("updated_at", queuedCutoff)
            .order("updated_at", { ascending: true }).limit(MAX_PER_TICK),
          supabaseAdmin.from("receipt_jobs").select("id, status, updated_at, attempts")
            .eq("status", "rate_limited").lt("retry_after", now)
            .order("updated_at", { ascending: true }).limit(MAX_PER_TICK),
        ]);


        const firstErr = [qStuckQueued, qStuckProcessing, qStuckBuilding, qStuckAnalyzing, qStuckFailed, qRateReady].find(r => r.error)?.error;
        if (firstErr) {
          console.error("[process-receipt-jobs] query failed", firstErr);
          return new Response(JSON.stringify({ error: firstErr.message }), { status: 500 });
        }

        // Merge + de-dup + global cap. Oldest first so the most stuck job wins.
        const merged = [
          ...(qStuckQueued.data ?? []),
          ...(qStuckProcessing.data ?? []),
          ...(qStuckBuilding.data ?? []),
          ...(qStuckAnalyzing.data ?? []),
          ...(qStuckFailed.data ?? []),
          ...(qRateReady.data ?? []),
        ];
        const seen = new Set<string>();
        const candidates = merged
          .filter(r => (seen.has(r.id) ? false : (seen.add(r.id), true)))
          .sort((a, b) => (a.updated_at < b.updated_at ? -1 : 1))
          .slice(0, MAX_PER_TICK);

        const { processReceiptJob } = await import("@/server/receipt-jobs.server");
        const claimed: string[] = [];

        // Phase 1: claim rows serially (cheap DB updates, race-safe).
        // Dead-letter at claim time if attempts already maxed — CPU-kills
        // bypass the catch in processReceiptJob, so attempts can grow
        // unbounded without this guard (we've seen attempts=7 in the wild).
        const toRun: string[] = [];
        const deadLettered: string[] = [];
        for (const job of candidates ?? []) {
          if (((job as any).attempts ?? 0) >= MAX_ATTEMPTS) {
            const { data: dl } = await supabaseAdmin
              .from("receipt_jobs")
              .update({
                status: "dead_letter",
                progress_label: "Permanently failed after multiple attempts",
                error: "Exceeded MAX_ATTEMPTS (likely repeated CPU-kill)",
              })
              .eq("id", job.id)
              .eq("updated_at", job.updated_at)
              .select("id")
              .maybeSingle();
            if (dl) deadLettered.push(job.id);
            continue;
          }
          const { data: claim, error: claimErr } = await supabaseAdmin
            .from("receipt_jobs")
            .update({
              status: "processing",
              progress_label: "Resumed by background worker",
            })
            .eq("id", job.id)
            .eq("updated_at", job.updated_at)
            .select("id")
            .maybeSingle();
          if (claimErr || !claim) continue; // lost the race or row gone
          claimed.push(job.id);
          toRun.push(job.id);
        }

        // Phase 2: run claimed jobs in the BACKGROUND via waitUntil.
        //
        // Why: when we awaited processReceiptJob inline, the request's CPU
        // clock kept ticking while we waited on Gemini. On large transcripts
        // the Worker exceeded its per-request CPU budget and Cloudflare
        // killed the isolate mid-call (logs show "→ 0" with no response).
        // By returning 200 immediately and registering the work with
        // waitUntil, the actual Gemini call runs on the Worker's background
        // budget, not the request's — fetch I/O wait doesn't count toward
        // CPU time, only active JS does. The job updates its own row at
        // every stage so progress is still observable.
        const backgroundWork = Promise.allSettled(
          toRun.map(jobId =>
            processReceiptJob(jobId, {}).catch(err => {
              console.error("[process-receipt-jobs] background job failed", jobId, err);
              throw err;
            }),
          ),
        );

        // Hand the promise to Cloudflare so the isolate stays alive. Dynamic
        // import so local dev / tests (no cloudflare:workers module) still work.
        void (async () => {
          try {
            const modName = "cloudflare:workers";
            const mod: any = await import(/* @vite-ignore */ modName);
            mod.waitUntil(backgroundWork);
          } catch {
            // Not on Cloudflare — promise still runs to completion in dev.
          }
        })();

        // Heartbeat — write a row even on empty ticks so admins can detect a
        // dead cron. We log the CLAIM result (not processing result) because
        // processing is now async; the row will be updated again by each job.
        const payload = {
          scanned: candidates?.length ?? 0,
          claimed: claimed.length,
          deadLettered: deadLettered.length,
          dispatched: toRun.length,
        };
        let heartbeatError: string | null = null;
        const { error: hbErr } = await supabaseAdmin.from("cron_heartbeats").upsert(
          {
            job_name: "process-receipt-jobs",
            last_run_at: new Date().toISOString(),
            last_status: "ok",
            last_payload: payload as any,
          } as any,
          { onConflict: "job_name" }
        );
        if (hbErr) {
          heartbeatError = hbErr.message;
          console.error("[process-receipt-jobs] heartbeat write failed", hbErr);
        }

        return new Response(
          JSON.stringify({ ok: true, ...payload, heartbeatError }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      },
    },
  },
});
