import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, Loader2, RotateCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { posthog } from "@/lib/posthog";
import {
  listIncompleteReceiptJobs,
  retryReceiptJob,
  dismissReceiptJob,
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
}

const ACTIVE = new Set(["queued", "processing", "building", "analyzing"]);

export function IncompleteJobsPanel({ onChange }: { onChange?: () => void }) {
  const listFn = useServerFn(listIncompleteReceiptJobs);
  const retryFn = useServerFn(retryReceiptJob);
  const dismissFn = useServerFn(dismissReceiptJob);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { jobs } = await listFn({});
      setJobs(jobs as Job[]);
    } catch {}
  }, [listFn]);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 8000);
    return () => window.clearInterval(id);
  }, [refresh]);

  if (!jobs.length) return null;

  const handleRetry = async (jobId: string) => {
    setBusy(jobId);
    try {
      await retryFn({ data: { jobId } });
      posthog.capture("receipt_retry_clicked", { job_id: jobId, scope: "participant" });
      toast.success("Retry started");
      await refresh();
      onChange?.();
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
      posthog.capture("receipt_dismiss_clicked", { job_id: jobId, scope: "participant" });
      await refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not dismiss");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/10">
      <CardContent className="space-y-3 py-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <h2 className="text-sm font-semibold">Receipts in progress or needing attention</h2>
        </div>
        <ul className="space-y-2">
          {jobs.map((j) => {
            const active = ACTIVE.has(j.status);
            const dead = j.status === "dead_letter";
            const limited = j.status === "rate_limited";
            const retryAt = j.retry_after ? new Date(j.retry_after) : null;
            const retryLabel = retryAt
              ? retryAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
              : null;
            const subline = limited
              ? `AI provider was busy — auto-retry around ${retryLabel ?? "soon"}. You can also retry now.`
              : (j.progress_label ?? j.error ?? "Waiting…");
            const Icon = limited ? Clock : active ? Loader2 : AlertTriangle;
            return (
              <li
                key={j.id}
                className="flex items-center gap-3 rounded-md border bg-background px-3 py-2"
              >
                <Icon
                  className={`h-4 w-4 shrink-0 ${
                    active ? "animate-spin text-muted-foreground"
                    : limited ? "text-blue-600"
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
                      {limited ? "Rate-limited" : (j.status ?? "unknown").replace("_", " ")}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      started {formatDistanceToNow(new Date(j.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{subline}</p>
                </div>
                {(!active || limited) && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === j.id}
                    onClick={() => handleRetry(j.id)}
                  >
                    <RotateCw className="mr-1 h-3.5 w-3.5" />
                    {limited ? "Retry now" : "Retry"}
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
      </CardContent>
    </Card>
  );
}