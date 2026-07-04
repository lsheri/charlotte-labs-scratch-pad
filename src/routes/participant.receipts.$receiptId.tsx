import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { getReceiptWithFluency } from "@/serverfn/receipts";
import { analyzeReceipt } from "@/serverfn/fluency";
import { getFluencyRecommendations } from "@/serverfn/recommendations";
import { getMyFluencyProfile } from "@/serverfn/fluency-profile";
import { LiteracyReceipt } from "@/components/receipt/LiteracyReceipt";
import { ReceiptBuildingState } from "@/components/receipt/ReceiptBuildingState";
import { TemplateTabs } from "@/components/receipt/TemplateTabs";
import { StudyGapTemplate } from "@/components/receipt/templates/StudyGapTemplate";
import { VerificationRiskTemplate } from "@/components/receipt/templates/VerificationRiskTemplate";
import { runStudyTemplate } from "@/serverfn/study-analyses";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ChevronLeft, AlertTriangle, Loader2 } from "lucide-react";
import { posthog } from "@/lib/posthog";

const receiptSearchSchema = z.object({
  template: fallback(z.string().optional(), undefined),
});

export const Route = createFileRoute("/participant/receipts/$receiptId")({
  validateSearch: zodValidator(receiptSearchSchema),
  loader: ({ params }) => getReceiptWithFluency({ data: { receiptId: params.receiptId } }),
  component: ReceiptPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-6">
        <p className="text-sm text-destructive mb-3">{error.message}</p>
        <Button onClick={() => { router.invalidate(); reset(); }}>Retry</Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6 text-sm">Receipt not found.</div>,
});

function ReceiptPage() {
  const initial = Route.useLoaderData();
  const router = useRouter();
  const retryAnalyze = useServerFn(analyzeReceipt);
  const fetchRecs = useServerFn(getFluencyRecommendations);
  const fetchProfile = useServerFn(getMyFluencyProfile);
  const fetchReceipt = useServerFn(getReceiptWithFluency);
  const [retrying, setRetrying] = useState(false);
  const [retryFailed, setRetryFailed] = useState(false);

  const receiptId = (initial.receipt as any)?.id;

  // Active = anything that is still running through the pipeline.
  const ACTIVE = new Set(["queued", "processing", "building", "analyzing", "synthesizing", "recommendations"]);
  const liveQuery = useQuery({
    queryKey: ["receipt-with-fluency", receiptId],
    queryFn: () => fetchReceipt({ data: { receiptId } }),
    initialData: initial as any,
    enabled: Boolean(receiptId),
    refetchInterval: (q) => {
      const d: any = q.state.data;
      // Keep polling while the job is active OR while the run isn't yet present.
      if (!d?.run && d?.job && ACTIVE.has(d.job.status)) return 3000;
      if (!d?.run && d?.job && d.job.status !== "completed") return 3000;
      // Even after status=completed, poll briefly until run arrives (race).
      if (!d?.run && d?.job?.status === "completed") return 2000;
      return false;
    },
  });

  const { receipt, run, turns, tools, job, templatePickerEnabled } = (liveQuery.data ?? initial) as any;
  const sessionId = (receipt as any)?.session_id as string | undefined;
  const { template: activeTemplate } = Route.useSearch();

  // Renderings list — drives "last run" chips on the picker and the tab bar.
  const renderingsQuery = useQuery({
    queryKey: ["receipt-renderings", receiptId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("renderings" as any)
        .select("template_key, created_at")
        .eq("receipt_id", receiptId)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return ((data ?? []) as unknown) as Array<{ template_key: string; created_at: string }>;
    },
    enabled: Boolean(receiptId) && Boolean(templatePickerEnabled) && Boolean(run),
    staleTime: 60_000,
  });
  const existingRenderings = renderingsQuery.data ?? [];

  // Three study templates always available; renderings drive nothing here now.
  const tabKeys = useMemo(
    () => ["classic_fluency", "verification_risk", "study_gaps"],
    [],
  );
  void existingRenderings;

  const profileQuery = useQuery({
    queryKey: ["fluency-profile", sessionId],
    queryFn: () => fetchProfile({ data: { sessionId: sessionId! } }),
    enabled: Boolean(sessionId) && Boolean(run),
    staleTime: 5 * 60 * 1000,
  });

  const recsQuery = useQuery({
    queryKey: ["receipt-recs", receiptId],
    queryFn: () => fetchRecs({ data: { receiptId } }),
    enabled: Boolean(receiptId) && Boolean(run),
    staleTime: 5 * 60 * 1000,
    refetchInterval: (q) => {
      const d: any = q.state.data;
      if (!d || d.status === "pending") return 5000;
      return false;
    },
  });

  useEffect(() => {
    if (!receiptId) return;
    const createdAt = (receipt as any)?.created_at;
    const ageMsAtView = createdAt ? Date.now() - new Date(createdAt).getTime() : null;
    posthog.capture("receipt_viewed", {
      receipt_id: receiptId,
      has_fluency_run: Boolean(run),
      job_status: job?.status ?? null,
      age_ms_at_view: ageMsAtView,
    });
  }, [receiptId, run, receipt, job?.status]);

  const audit = (run?.analysis_output_json as any) ?? null;
  const runMeta = run ? {
    transcript_hash: run.transcript_hash, created_at: run.created_at,
    input_type: run.input_type, subject_type: run.subject_type,
    receipt_profile: run.receipt_profile, tool_metadata: run.tool_metadata,
  } : undefined;

  // ---- Three rendering states ----
  // 1. job active OR job completed-but-run-missing → BUILDING STATE (hide receipt entirely).
  // 2. job dead_letter/failed OR no job + age>60s → RETRY CTA.
  // 3. run present AND job completed → render receipt.
  const jobActive = job && ACTIVE.has(job.status);
  const jobRateLimited = job?.status === "rate_limited";
  const jobDead = job?.status === "dead_letter";
  const jobFailed = job?.status === "failed";
  const ageMs = Date.now() - new Date((receipt as any).created_at).getTime();

  // Show building when:
  //   - job is active, OR
  //   - job is rate-limited, OR
  //   - status=completed but run hasn't synced yet (brief race after worker finish)
  const showBuilding = !run && (jobActive || jobRateLimited || job?.status === "completed");
  const showRetry = !run && !showBuilding && (jobDead || jobFailed || (!job && ageMs > 60_000));
  const showReceipt = Boolean(run);

  const onRetry = async () => {
    setRetrying(true);
    setRetryFailed(false);
    try {
      await retryAnalyze({ data: { receiptId: (receipt as any).id } });
      await router.invalidate();
      await liveQuery.refetch();
    } catch (e) {
      console.error("retry analysis failed", e);
      setRetryFailed(true);
    } finally {
      setRetrying(false);
    }
  };

  // When the run lands while polling, invalidate the loader so downstream
  // queries (profile / recs) kick off cleanly.
  useEffect(() => {
    if (run) router.invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(run)]);

  const retryAt = job?.retry_after ? new Date(job.retry_after) : null;
  const retryAtLabel = retryAt
    ? retryAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <div className="space-y-4">
      <Link to="/participant"><Button variant="ghost" size="sm"><ChevronLeft className="h-4 w-4 mr-1" />Back</Button></Link>

      {showBuilding && (
        <ReceiptBuildingState
          stage={job?.stage ?? null}
          status={job?.status ?? null}
          bucket={job?.bucket ?? null}
          chunksDone={job?.chunks_done ?? null}
          chunksTotal={job?.chunks_total ?? null}
          etaSeconds={job?.eta_seconds ?? null}
          progressLabel={job?.progress_label ?? null}
          rateLimited={jobRateLimited}
          retryAtLabel={retryAtLabel}
        />
      )}

      {showRetry && (
        <div className="rounded-md border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900 space-y-3">
          {retrying ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Analyzing your AI fluency…</span>
            </div>
          ) : retryFailed ? (
            <p>We weren't able to analyze this receipt right now. Your conversation is saved — try again later or contact support.</p>
          ) : (
            <>
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <p>
                  {jobDead
                    ? "This analysis failed after several automatic retries. You can try again now."
                    : "Your fluency analysis didn't complete. Tap below to retry — it usually takes under 30 seconds."}
                </p>
              </div>
              <Button size="sm" onClick={onRetry}>Retry Analysis</Button>
            </>
          )}
        </div>
      )}

      {showReceipt && (() => {
        const currentTab = activeTemplate ?? "classic_fluency";
        return (
          <div className="space-y-4">
            <TemplateTabs
              receiptId={receiptId}
              activeKey={currentTab}
              templateKeys={tabKeys}
            />
            {currentTab === "classic_fluency" && (
              <LiteracyReceipt
                receipt={receipt as any}
                audit={audit}
                runMeta={runMeta}
                turns={turns as any}
                tools={tools as any}
                recommendations={recsQuery.data ?? null}
                recommendationsLoading={recsQuery.isLoading}
                profile={profileQuery.data?.profile ?? null}
              />
            )}
            {currentTab === "verification_risk" && (
              <VerificationRiskTemplate receiptId={receiptId} />
            )}
            {currentTab === "study_gaps" && (
              <StudyGapTemplate receiptId={receiptId} />
            )}
          </div>
        );
      })()}
    </div>
  );
}
