import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { posthog } from "@/lib/posthog";
import { Card, CardContent } from "@/components/ui/card";
import { Info, ArrowUp, ArrowDown, ArrowRight, Minus, X, Sparkles, Lightbulb } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { FluencyRadarChart, type RadarSeries } from "@/components/receipt/FluencyRadarChart";
import { ProvenanceVial } from "@/components/provenance/ProvenanceVial";
import { getMyOverallFluencySnapshot } from "@/serverfn/fluency-profile";

// Brand mint = "now / current truth". Hot pink dashed = "earlier snapshot" —
// matches the pink used elsewhere in receipt views for prior/comparison lines.
// Current always renders on top so the eye lands on the latest measurement.
const MINT_NOW = "#6FFAC6";
const SKY_PRIOR = "#FF2D87";
const SCRUBBER_MIN = 4;




export function OverallFluencyCard() {
  const fetchSnap = useServerFn(getMyOverallFluencySnapshot);
  const { data, isLoading } = useQuery({
    queryKey: ["overall-fluency-snapshot"],
    queryFn: () => fetchSnap(),
    staleTime: 5 * 60 * 1000,
  });

  // -1 = anchor (current only); 0..n = compare against the i-th recent receipt
  const [compareIdx, setCompareIdx] = useState<number>(-1);
  const [scrubIdx, setScrubIdx] = useState<number | null>(null);

  const receipts = data?.receipts ?? [];
  const timeline = data?.timeline ?? [];
  const showScrubber = timeline.length >= SCRUBBER_MIN;
  const sampleSize = data?.sampleSize ?? 0;
  const mix = data?.provenanceMix ?? { lab: 0, personal: 0, total: 0 };
  const hasOverall = (data?.overall ?? []).some((d: any) => typeof d.value === "number");
  const provisionalCount = (data?.overall ?? []).filter((d: any) => d.provisional).length;

  // Anchor = most recent fluency snapshot. receipts[0] is newest.
  const anchor = receipts[0] ?? null;
  const latestAt = data?.latestAt ?? anchor?.createdAt ?? null;
  // Chips render oldest → newest.
  const chips = useMemo(() => [...receipts].reverse(), [receipts]);

  // Per-dimension confidence from the latest snapshot — passed straight to
  // the radar so low-confidence spokes render dashed (auditable, not hidden).
  const confidenceByLabel = useMemo(() => {
    const m: Record<string, number> = {};
    (data?.overall ?? []).forEach((d: any) => {
      if (typeof d.confidence === "number") m[d.label] = d.confidence;
    });
    return m;
  }, [data]);

  const series: RadarSeries[] | undefined = useMemo(() => {
    if (!data?.overall?.length) return undefined;

    if (scrubIdx != null && timeline[scrubIdx]) {
      const point = timeline[scrubIdx];
      return [{
        label: "Your fluency at this point",
        dimensions: point.dimensions.map(d => ({ label: d.label, value: d.value })),
        color: MINT_NOW,
      }];
    }

    if (compareIdx >= 0 && receipts[compareIdx]) {
      const r = receipts[compareIdx];
      // Order matters: prior first (renders behind), current on top.
      return [
        {
          label: `Before · ${format(new Date(r.createdAt), "MMM d")}`,
          dimensions: r.before.map(d => ({ label: d.label, value: d.value })),
          color: SKY_PRIOR,
          dashed: true,
        },
        {
          label: "Now",
          dimensions: data.overall.map((d: any) => ({ label: d.label, value: d.value })),
          color: MINT_NOW,
        },
      ];
    }

    return [{
      label: "Your fluency",
      dimensions: data.overall.map((d: any) => ({ label: d.label, value: d.value })),
      color: MINT_NOW,
    }];
  }, [data, compareIdx, scrubIdx, timeline, receipts]);

  const active = compareIdx >= 0 ? receipts[compareIdx] : null;

  // Numeric deltas are intentionally NOT surfaced to the user — they stay in
  // the backend (participant_fluency_history) for the data science team. The
  // panel now shows qualitative evidence + next-move recommendations instead.


  return (
    <TooltipProvider delayDuration={150}>
      <Card className="h-full">
        <CardContent className="flex h-full flex-col gap-4 py-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-xs uppercase tracking-wider text-muted-foreground">
                <span>Cumulative AI Fluency</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" aria-label="How is this calculated?">
                      <Info className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-sm text-xs leading-relaxed">
                    <p className="font-medium text-foreground">Rolling median of your last 3 confident measurements — per dimension.</p>
                    <p className="mt-1 text-muted-foreground">
                      Each of the 7 dimensions is scored independently from the most
                      recent AI collaboration receipts that actually measured it (confidence ≥ 0.5).
                      One anomalous receipt can't swing the radar; two consistent ones can.
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      Spokes with only one qualifying measurement render dashed —
                      <span className="text-foreground"> provisional until corroborated</span>.
                      Unmeasured dimensions render as gaps, not guesses.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              {hasOverall ? (
                <div className="mt-1 text-sm text-muted-foreground">
                  Built from {sampleSize} AI collaboration receipt{sampleSize === 1 ? "" : "s"}
                  {anchor && (
                    <>
                      <span> · last updated </span>
                      <Link
                        to="/participant/receipts/$receiptId"
                        params={{ receiptId: anchor.receiptId }}
                        className="font-medium text-foreground hover:underline"
                      >
                        {formatDistanceToNow(new Date(latestAt ?? anchor.createdAt), { addSuffix: true })}
                      </Link>
                    </>
                  )}
                </div>
              ) : (
                <div className="mt-1 text-xs text-muted-foreground">
                  Directional · everyone starts at a neutral baseline.
                </div>
              )}
            </div>
            {active && (
              <button
                type="button"
                onClick={() => setCompareIdx(-1)}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" /> Clear comparison
              </button>
            )}
          </div>

          {/* Radar + delta panel — side-by-side at lg, stacked below */}
          <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
            <div className="relative" style={{ minHeight: 420 }}>
              {isLoading ? (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  Loading…
                </div>
              ) : series ? (
                <FluencyRadarChart series={series} confidenceByLabel={confidenceByLabel} hideLegend />
              ) : (
                <EmptyFingerprintCTA />
              )}
              {/* Legend chip when comparing */}
              {active && (
                <div className="absolute left-2 top-2 flex flex-col gap-1 rounded-md border bg-background/85 px-2 py-1.5 text-[10px] backdrop-blur">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2 w-3 rounded-sm" style={{ background: MINT_NOW }} />
                    Now
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block h-0 w-3 border-t-2 border-dashed"
                      style={{ borderColor: SKY_PRIOR }}
                    />
                    Before · {format(new Date(active.createdAt), "MMM d")}
                  </span>
                </div>
              )}
            </div>

            {/* Highlights + Next moves panel — sourced from the selected receipt */}
            {active ? (
              <div className="flex min-w-0 flex-col gap-3 rounded-lg border bg-muted/30 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-[11px] font-medium uppercase tracking-wide">
                    From this receipt
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {format(new Date(active.createdAt), "MMM d")}
                  </div>
                </div>

                {(active as any).evidence?.length > 0 && (
                  <div>
                    <div className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      <Sparkles className="h-3 w-3" /> What you did well
                    </div>
                    <ul className="space-y-1.5">
                      {(active as any).evidence.slice(0, 2).map((e: any, i: number) => (
                        <li key={i} className="text-[11px] leading-snug">
                          <span className="font-medium text-foreground">{e.dimension}:</span>{" "}
                          <span className="text-muted-foreground">“{e.snippet}”</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {(active as any).recommendations?.length > 0 && (
                  <div className="border-t pt-2">
                    <div className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      <Lightbulb className="h-3 w-3" /> Try next time
                    </div>
                    <ul className="space-y-1.5">
                      {(active as any).recommendations.slice(0, 2).map((r: any, i: number) => (
                        <li key={i} className="text-[11px] leading-snug">
                          <span className="font-medium text-foreground">{r.title}.</span>{" "}
                          <span className="text-muted-foreground">{r.body}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {!((active as any).evidence?.length) && !((active as any).recommendations?.length) && (
                  <div className="text-xs text-muted-foreground">
                    No highlights yet for this receipt.
                  </div>
                )}

                <div className="mt-auto pt-2 border-t">
                  <Link
                    to="/participant/receipts/$receiptId"
                    params={{ receiptId: active.receiptId }}
                    className="text-[11px] font-medium text-foreground hover:underline"
                  >
                    Open full receipt →
                  </Link>
                </div>
              </div>
            ) : (
              receipts.length >= 2 && (
                <div className="hidden flex-col items-start justify-center rounded-lg border border-dashed bg-muted/10 p-4 text-xs text-muted-foreground lg:flex">
                  <div className="font-medium text-foreground">Tap a receipt to see highlights</div>
                  <p className="mt-1">
                    Each chip below opens the strongest evidence from that
                    collaboration plus a couple of suggestions for next time.
                  </p>
                </div>
              )
            )}
          </div>

          {/* Empty / single-receipt CTA */}
          {receipts.length === 1 && (
            <div className="border-t pt-3 text-center text-xs text-muted-foreground">
              One more receipt and we can show how your fluency shifted.
            </div>
          )}

          {/* Step chips: oldest → newest */}
          {receipts.length >= 2 && (
            <div className="border-t pt-3">
              <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Last {chips.length} receipts · tap to compare</span>
              </div>
              <div className="flex items-stretch gap-2">
                {chips.map((r, i) => {
                  const origIdx = receipts.length - 1 - i;
                  const isActive = compareIdx === origIdx;
                  const isCurrent = origIdx === 0;
                  const pairs = r.after
                    .map((a, k) => ({ a: a.value, b: r.before[k]?.value ?? null }))
                    .filter(p => typeof p.a === "number" && typeof p.b === "number") as { a: number; b: number }[];
                  const headlineDelta = pairs.length
                    ? pairs.reduce((s, p) => s + (p.a - p.b), 0) / pairs.length
                    : null;
                  return (
                    <button
                      key={r.receiptId}
                      type="button"
                      onClick={() => {
                        setScrubIdx(null);
                        // Tapping "Current" is a no-op for comparison — clear instead.
                        if (isCurrent) { setCompareIdx(-1); return; }
                        setCompareIdx(isActive ? -1 : origIdx);
                      }}
                      className={`group flex-1 min-w-0 rounded-md border px-2.5 py-2 text-left transition ${
                        isActive
                          ? "border-foreground bg-foreground/[0.04]"
                          : isCurrent
                            ? "border-[color:var(--color-primary)]/60 bg-[color:var(--color-primary)]/5"
                            : "border-border hover:border-muted-foreground/40"
                      }`}
                      title={r.label || (r.tool ? `${r.tool} receipt` : "Receipt")}
                      aria-pressed={isActive}
                    >
                      <div className="flex items-center gap-1.5">
                        <ProvenanceVial variant={r.provenance} size="sm" />
                        <span className="truncate text-[12px] font-medium">
                          {isCurrent ? "Now" : r.label || r.tool || "Receipt"}
                        </span>
                        {isCurrent && (
                          <span className="ml-auto rounded-full bg-[color:var(--color-primary)]/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-foreground/80">
                            here
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-1 text-[10px] text-muted-foreground">
                        <span>{format(new Date(r.createdAt), "MMM d")}</span>
                        {!r.hasPrior ? (
                          <span>first run</span>
                        ) : headlineDelta == null ? (
                          <span>—</span>
                        ) : Math.abs(headlineDelta) < 0.05 ? (
                          <span className="inline-flex items-center gap-0.5"><Minus className="h-2.5 w-2.5" /> steady</span>
                        ) : headlineDelta > 0 ? (
                          <span className="inline-flex items-center gap-0.5 text-emerald-600">
                            <ArrowUp className="h-2.5 w-2.5" /> up
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-rose-600">
                            <ArrowDown className="h-2.5 w-2.5" /> down
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Provenance + sample-size disclosure */}
          {sampleSize > 0 && (
            <div className="flex items-center justify-between gap-2 border-t pt-3 text-[10px] text-muted-foreground">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span>Rolling median · last 3 confident measurements per dimension</span>
                {provisionalCount > 0 && (
                  <span className="rounded-full border border-dashed px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-foreground/70">
                    {provisionalCount} provisional
                  </span>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" aria-label="Why this design?">
                      <Info className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-sm text-xs leading-relaxed">
                    <p className="font-medium text-foreground">Why median, not average.</p>
                    <p className="mt-1 text-muted-foreground">
                      One unusually polished — or unusually rushed — receipt can't move
                      the radar on its own. The median of your last three measurements
                      keeps the score honest to your real practice.
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      Dimensions with only one qualifying measurement are flagged
                      <span className="text-foreground"> provisional</span> until a
                      second receipt corroborates them.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              {mix.total > 0 && (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1">
                    <ProvenanceVial variant="lab" size="sm" /> {mix.lab} lab
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <ProvenanceVial variant="personal" size="sm" /> {mix.personal} personal
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Long-history scrubber stays gated to ≥4 snapshots */}
          {showScrubber && (
            <details className="border-t pt-3 text-[11px] text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground">
                Replay all {timeline.length} receipts →
              </summary>
              <div className="mt-2">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span>Fluency over time</span>
                  {scrubIdx != null && (
                    <span>
                      {format(new Date(timeline[scrubIdx].createdAt), "MMM d")} · {scrubIdx + 1}/{timeline.length}
                    </span>
                  )}
                </div>
                <input
                  type="range"
                  min={0}
                  max={timeline.length - 1}
                  step={1}
                  value={scrubIdx ?? timeline.length - 1}
                  onChange={(e) => {
                    setCompareIdx(-1);
                    setScrubIdx(parseInt(e.target.value, 10));
                  }}
                  onDoubleClick={() => setScrubIdx(null)}
                  className="h-1 w-full cursor-pointer appearance-none rounded-full bg-muted accent-[--color-primary]"
                  aria-label="Scrub fluency over time"
                />
                {scrubIdx != null && (
                  <button
                    type="button"
                    className="mt-1 hover:text-foreground"
                    onClick={() => setScrubIdx(null)}
                  >
                    ← back to current
                  </button>
                )}
              </div>
            </details>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

function EmptyFingerprintCTA() {
  const seenRef = useRef(false);
  useEffect(() => {
    if (seenRef.current) return;
    seenRef.current = true;
    posthog.capture("fingerprint_empty_state_viewed");
  }, []);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="text-sm font-semibold text-foreground">
        Your AI Fingerprint starts here
      </div>
      <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
        Generate your first receipt and Charlotte will map how you think and work with AI —
        across 7 dimensions, updated every time you submit.
      </p>
      <Link
        to="/participant/how-it-works"
        onClick={() => posthog.capture("fingerprint_empty_state_cta_clicked", { target: "how_it_works" })}
        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        How it works <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
