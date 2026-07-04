import { Card, CardContent } from "@/components/ui/card";
import { Check, Loader2 } from "lucide-react";
import charlotteMascot from "@/assets/charlotte-mascot.png";
import { cn } from "@/lib/utils";

type Stage = "queued" | "building" | "analyzing" | "synthesizing" | "recommendations" | "completed";

interface Props {
  stage?: string | null;
  status?: string | null;
  bucket?: string | null;
  chunksDone?: number | null;
  chunksTotal?: number | null;
  etaSeconds?: number | null;
  progressLabel?: string | null;
  rateLimited?: boolean;
  retryAtLabel?: string | null;
}

const STEPS: { id: Stage; label: string }[] = [
  { id: "building", label: "Assembling" },
  { id: "analyzing", label: "Analyzing" },
  { id: "synthesizing", label: "Synthesizing" },
  { id: "recommendations", label: "Recommending" },
];

function stageIndex(stage?: string | null): number {
  if (!stage) return 0;
  const i = STEPS.findIndex(s => s.id === stage);
  if (i < 0) return stage === "queued" ? 0 : stage === "completed" ? STEPS.length : 0;
  return i;
}

function formatEta(seconds?: number | null): string | null {
  if (seconds == null || seconds <= 0) return null;
  if (seconds < 60) return `~${seconds}s`;
  const mins = Math.round(seconds / 60);
  return mins === 1 ? "~1 min" : `~${mins} min`;
}

export function ReceiptBuildingState({
  stage,
  status,
  bucket,
  etaSeconds,
  progressLabel,
  rateLimited,
  retryAtLabel,
}: Props) {
  const currentIdx = stageIndex(stage);
  const isLong = bucket === "large" || bucket === "xlarge";

  return (
    <Card className="border-brand-mint/40">
      <CardContent className="p-6 space-y-5">
        <div className="flex items-start gap-4">
          <img
            src={charlotteMascot}
            alt="Charlotte"
            className="h-14 w-14 shrink-0"
            style={{ animation: "spin 2.4s linear infinite" }}
          />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold leading-tight">
              {rateLimited ? "AI provider is busy" : "Building your receipt…"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {rateLimited
                ? `We'll automatically retry around ${retryAtLabel ?? "soon"}. Your conversation is safe.`
                : (progressLabel || "Hang tight — this usually takes under a minute.")}
            </p>
            {!rateLimited && formatEta(etaSeconds) && (
              <p className="mt-1 text-xs text-muted-foreground/80">
                Estimated time remaining: {formatEta(etaSeconds)}
              </p>
            )}
            {!rateLimited && isLong && stage === "analyzing" && (
              <p className="mt-1 text-xs text-muted-foreground/80">
                Long conversation detected — reading the whole transcript in one pass for accuracy.
              </p>
            )}
          </div>
        </div>

        {/* Stage stepper */}
        <div className="flex items-center justify-between gap-2">
          {STEPS.map((step, i) => {
            const done = i < currentIdx || status === "completed";
            const active = i === currentIdx && status !== "completed";
            return (
              <div key={step.id} className="flex flex-1 items-center gap-2 min-w-0">
                <div
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                    done && "border-brand-mint bg-brand-mint text-foreground",
                    active && "border-primary bg-primary/10 text-primary",
                    !done && !active && "border-muted-foreground/30 text-muted-foreground",
                  )}
                >
                  {done ? <Check className="h-4 w-4" /> : active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : i + 1}
                </div>
                <span
                  className={cn(
                    "truncate text-xs",
                    active ? "font-semibold text-foreground" : "text-muted-foreground",
                  )}
                >
                  {step.label}
                </span>
                {i < STEPS.length - 1 && (
                  <div className={cn("h-px flex-1", done ? "bg-brand-mint" : "bg-muted-foreground/20")} />
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

