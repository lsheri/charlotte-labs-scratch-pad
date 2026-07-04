import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, Loader2, RotateCw, Skull, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { posthog } from "@/lib/posthog";
import { anonymousLabel } from "@/lib/displayNames";
import {
  adminListReceiptJobs,
  adminRetryReceiptJob,
  adminDismissReceiptJob,
} from "@/serverfn/threads";

interface Job {
  id: string;
  status: string;
  progress_label: string | null;
  error: string | null;
  created_at: string;
  label: string | null;
  attempts: number | null;
  retry_after: string | null;
  participant_id: string;
  receipt_id: string | null;
}

const ACTIVE = new Set(["queued", "processing", "building", "analyzing"]);

export function AdminReceiptJobsPanel() {
  const listFn = useServerFn(adminListReceiptJobs);
  const retryFn = useServerFn(adminRetryReceiptJob);
  const dismissFn = useServerFn(adminDismissReceiptJob);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { jobs } = await listFn({});
      setJobs(jobs as Job[]);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [listFn]);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 10_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const handleRetry = async (jobId: string) => {
    setBusy(jobId);
    try {
      await retryFn({ data: { jobId } });
      posthog.capture("receipt_retry_clicked", { job_id: jobId, scope: "admin" });
      toast.success("Retry started");
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Retry failed");
    } finally {
      setBusy(null);
    }
  };

  const handleDismiss = async (jobId: string) => {
    setBusy(jobId);
    try {
      await dismissFn({ data: { jobId } });
      posthog.capture("receipt_dismiss_clicked", { job_id: jobId, scope: "admin" });
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not dismiss");
    } finally {
      setBusy(null);
    }
  };

  const counts = {
    inflight: jobs.filter((j) => ACTIVE.has(j.status)).length,
    rateLimited: jobs.filter((j) => j.status === "rate_limited").length,
    failed: jobs.filter((j) => j.status === "failed").length,
    dead: jobs.filter((j) => j.status === "dead_letter").length,
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Receipt jobs needing attention</CardTitle>
            <CardDescription>
              All in-flight, rate-limited, failed, and dead-lettered jobs across users.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary">In-flight {counts.inflight}</Badge>
            <Badge variant="secondary">Rate-limited {counts.rateLimited}</Badge>
            <Badge variant={counts.failed ? "destructive" : "outline"}>Failed {counts.failed}</Badge>
            <Badge variant={counts.dead ? "destructive" : "outline"}>Dead {counts.dead}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No jobs needing attention. ✅</p>
        ) : (
          <ul className="space-y-2">
            {jobs.map((j) => {
              const active = ACTIVE.has(j.status);
              const dead = j.status === "dead_letter";
              const limited = j.status === "rate_limited";
              const failed = j.status === "failed";
              const retryAt = j.retry_after ? new Date(j.retry_after) : null;
              const subline = limited
                ? `Rate-limited — auto-retry around ${retryAt?.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) ?? "soon"}`
                : (j.progress_label ?? j.error ?? "Waiting…");
              const Icon = dead ? Skull : limited ? Clock : active ? Loader2 : AlertTriangle;
              return (
                <li
                  key={j.id}
                  className="flex items-center gap-3 rounded-md border bg-background px-3 py-2"
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      active ? "animate-spin text-muted-foreground"
                      : limited ? "text-blue-600"
                      : dead ? "text-destructive"
                      : "text-amber-600"
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="truncate text-sm font-medium">
                        {j.label || "Untitled receipt"}
                      </span>
                      <Badge
                        variant={dead ? "destructive" : limited ? "secondary" : active ? "secondary" : "outline"}
                        className="capitalize"
                      >
                        {(j.status ?? "unknown").replace("_", " ")}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {anonymousLabel(j.participant_id)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        · started {formatDistanceToNow(new Date(j.created_at), { addSuffix: true })}
                      </span>
                      {(j.attempts ?? 0) > 0 && (
                        <span className="text-xs text-muted-foreground">
                          · {j.attempts} attempt{j.attempts === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{subline}</p>
                  </div>
                  {(failed || dead || limited) && (
                    <Button
                      size="sm"
                      variant={dead ? "default" : "outline"}
                      disabled={busy === j.id}
                      onClick={() => handleRetry(j.id)}
                      title={dead && j.receipt_id ? "Receipt exists — will resume at fluency step without duplicating it." : undefined}
                    >
                      <RotateCw className="mr-1 h-3.5 w-3.5" />
                      {dead ? (j.receipt_id ? "Force re-queue" : "Retry (dead)") : "Retry"}
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground"
                    disabled={busy === j.id}
                    onClick={() => handleDismiss(j.id)}
                    aria-label="Dismiss"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
