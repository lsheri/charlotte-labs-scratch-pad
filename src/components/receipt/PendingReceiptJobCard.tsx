import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { X } from "lucide-react";
import charlotteMascot from "@/assets/charlotte-mascot.png";
import { getReceiptJob } from "@/serverfn/threads";
import { posthog } from "@/lib/posthog";
import {
  clearPendingReceiptJob,
  getPendingReceiptJob,
} from "@/lib/pendingReceiptJob";

interface Props {
  onCompleted?: (receiptId: string) => void;
}

// UX timing constants for the polling card.
// Poll lightly so users get the "Receipt ready" action without refreshing,
// while the background sweeper still owns the heavy processing.
const POLL_INTERVAL_MS = 5000;
const SLOW_AFTER_MS = 45_000;       // "still starting" hint
const STALL_AFTER_MS = 3 * 60_000;  // give up actively polling, point to list

export function PendingReceiptJobCard({ onCompleted }: Props) {
  const jobFn = useServerFn(getReceiptJob);
  const navigate = useNavigate();
  const [active, setActive] = useState<{ jobId: string; startedAt: number } | null>(null);
  const [statusLabel, setStatusLabel] = useState("Waiting to start…");
  const [hidden, setHidden] = useState(false);
  const [stalled, setStalled] = useState(false);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    const pending = getPendingReceiptJob();
    if (pending?.jobId) {
      setActive({ jobId: pending.jobId, startedAt: pending.startedAt ?? Date.now() });
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    const tick = async () => {
      try {
        const { job: j } = await jobFn({ data: { jobId: active.jobId } });
        const elapsed = Date.now() - active.startedAt;

        // Friendly progress label, with two timed fallbacks.
        let label =
          (j as any).progress_label ??
          (j.status === "queued" ? "Waiting to start…" : `${j.status}…`);
        if (j.status === "queued" && elapsed > SLOW_AFTER_MS) {
          label = "Still starting — background worker will pick this up shortly.";
        }
        setStatusLabel(label);

        if (j.status === "completed" && j.receipt_id) {
          if (pollRef.current) window.clearInterval(pollRef.current);
          clearPendingReceiptJob();
          setActive(null);
          posthog.capture("receipt_completed", {
            job_id: active.jobId,
            receipt_id: j.receipt_id,
            duration_ms: elapsed,
          });
          // Fire once-per-user activation event
          try {
            if (typeof window !== "undefined" && !window.localStorage.getItem("ph_first_receipt_fired")) {
              window.localStorage.setItem("ph_first_receipt_fired", "1");
              posthog.capture("first_receipt_generated", {
                receipt_id: j.receipt_id,
                duration_ms: elapsed,
              });
              posthog.people?.set?.({ first_receipt_at: new Date().toISOString() });
            }
          } catch {}
          toast.success("Receipt ready", {
            description: "Your AI collaboration receipt is ready to view.",
            action: {
              label: "Open",
              onClick: () =>
                navigate({
                  to: "/participant/receipts/$receiptId",
                  params: { receiptId: j.receipt_id! },
                }),
            },
          });
          onCompleted?.(j.receipt_id);
          return;
        }

        if (j.status === "failed" || j.status === "dead_letter") {
          if (pollRef.current) window.clearInterval(pollRef.current);
          clearPendingReceiptJob();
          setActive(null);
          posthog.capture("receipt_failed", {
            job_id: active.jobId,
            status: j.status,
            error: (j as any).error ?? null,
            duration_ms: elapsed,
          });
          toast.error(j.error ?? "Receipt generation failed");
          return;
        }

        if (j.status === "rate_limited") {
          if (pollRef.current) window.clearInterval(pollRef.current);
          clearPendingReceiptJob();
          setActive(null);
          posthog.capture("receipt_rate_limited", {
            job_id: active.jobId,
            duration_ms: elapsed,
          });
          toast.info("AI provider is busy — we'll retry automatically", {
            description: "Your receipt is parked and will run again within the hour. You can also retry manually from the Receipts page.",
            action: {
              label: "View receipts",
              onClick: () => navigate({ to: "/participant/receipts" }),
            },
          });
          return;
        }

        // Stop polling after STALL_AFTER_MS and let the user move on.
        // The cron worker will still finish the job; we just don't pin
        // them to this toast forever.
        if (elapsed > STALL_AFTER_MS && !stalled) {
          setStalled(true);
          if (pollRef.current) window.clearInterval(pollRef.current);
          posthog.capture("receipt_polling_stalled", {
            job_id: active.jobId,
            last_status: j.status,
            duration_ms: elapsed,
          });
          toast.info("Generation is taking longer than expected", {
            description: "It will finish in the background. Check your Receipts list in a minute.",
            action: {
              label: "View receipts",
              onClick: () => navigate({ to: "/participant/receipts" }),
            },
          });
        }
      } catch {}
    };
    tick();
    pollRef.current = window.setInterval(tick, POLL_INTERVAL_MS) as unknown as number;
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [active, jobFn, navigate, onCompleted, stalled]);

  if (!active || hidden || stalled) return null;

  return (
    <Card className="fixed bottom-4 right-4 z-40 w-[320px] shadow-lg border-brand-mint/40">
      <CardContent className="flex items-center gap-3 py-3 pr-2">
        <img
          src={charlotteMascot}
          alt="Charlotte"
          className="h-10 w-10 shrink-0"
          style={{ animation: "spin 2.4s linear infinite" }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">Generating your receipt…</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{statusLabel}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground"
          onClick={() => setHidden(true)}
          aria-label="Hide"
        >
          <X className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
