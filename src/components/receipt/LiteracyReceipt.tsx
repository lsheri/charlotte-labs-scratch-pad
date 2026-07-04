import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Sparkles, Clipboard } from "lucide-react";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FluencyRadarChart, type RadarSeries } from "./FluencyRadarChart";
import { TurnBlock } from "@/components/conversation/TurnBlock";
import { overallBand, dimensionEvidenceState, evidenceStateStyle, toolBadgeClass } from "@/lib/fluencyMapping";
import { EditableReceiptTitle } from "@/components/receipt/EditableReceiptTitle";
// Local shape stubs (previously imported from AnalysisAuditTrail, removed in prune).
export type AuditData = any;
export type RunMeta = any;
import { PatternsCard } from "./PatternsCard";
import { ReceiptCheckup } from "./ReceiptCheckup";
import { getReceiptCheckup } from "@/serverfn/receipt-checkup";
import { getReceiptChains } from "@/serverfn/chains";
import { ChainTimeline } from "./ChainTimeline";
import { DimensionEvidenceCard } from "./DimensionEvidenceCard";
import { AI_FLUENCY_FOUNDATIONS } from "@/lib/aiFluencyFoundations";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import type { RecommendationsResult } from "@/serverfn/recommendations";

interface Turn { role: string; content: string; idx: number }
export interface ProfileData {
  receipt_count_total?: number | null;
  direction_score_profile: number | null;
  delegation_score_profile: number | null;
  discernment_score_profile: number | null;
  development_score_profile: number | null;
  ethics_score_profile: number | null;
  efficiency_score_profile: number | null;
  strategic_agency_score_profile: number | null;
  direction_confidence: number | null;
  delegation_confidence: number | null;
  discernment_confidence: number | null;
  development_confidence: number | null;
  ethics_confidence: number | null;
  efficiency_confidence: number | null;
  strategic_agency_confidence: number | null;
}
interface Props {
  receipt: { id: string; tool_used: string; created_at: string; prompt_preview?: string | null; metadata?: any };
  audit: AuditData | null;
  runMeta?: RunMeta;
  turns: Turn[];
  tools?: string[];
  recommendations?: RecommendationsResult | null;
  recommendationsLoading?: boolean;
  profile?: ProfileData | null;
  showTranscript?: boolean; // admin debugging only; default false
  /** When true, render numeric scores (admin/researcher view). Default false (participant). */
  adminView?: boolean;
}

function getProfileScore(profile: ProfileData, canonicalName: string): number {
  const key = canonicalName
    .replace('ethics_data_responsibility', 'ethics')
    .replace('efficiency_leverage', 'efficiency')
    + '_score_profile';
  const v = (profile as unknown as Record<string, number | null>)[key];
  return typeof v === 'number' ? v : 3.0;
}

export function LiteracyReceipt({ receipt, audit, runMeta, turns, tools, recommendations, recommendationsLoading = false, profile, showTranscript = false, adminView = false }: Props) {
  const band = audit ? overallBand(audit.overall_level) : null;
  const receiptDims = audit?.dimensions?.map(d => ({ label: d.display_name, value: d.score ?? 0 })) ?? [];
  const profileReceiptCount = profile?.receipt_count_total ?? 0;
  const profileReady = !!profile && profileReceiptCount >= 3;
  const radarSeries: RadarSeries[] | undefined = (() => {
    if (!profileReady || !audit?.dimensions?.length) return undefined;
    const dims = audit.dimensions.filter(d => d.canonical_name !== 'capital_stewardship');
    const profileDims = dims.map(d => ({ label: d.display_name, value: getProfileScore(profile!, d.canonical_name) }));
    const receiptOverlay = dims.map(d => ({ label: d.display_name, value: d.score ?? 0 }));
    return [
      { label: 'Your profile', dimensions: profileDims },
      { label: 'This receipt', dimensions: receiptOverlay, color: '#D94F88' },
    ];
  })();
  const confidenceByLabel: Record<string, number> | undefined = (() => {
    if (!profileReady || !audit?.dimensions) return {};
    const map: Record<string, number> = {};
    for (const d of audit.dimensions) {
      if (d.canonical_name === 'capital_stewardship') continue;
      const confKey = d.canonical_name
        .replace('ethics_data_responsibility', 'ethics')
        .replace('efficiency_leverage', 'efficiency')
        + '_confidence';
      const v = (profile as unknown as Record<string, number | null>)[confKey];
      if (typeof v === 'number') map[d.display_name] = v;
    }
    return map;
  })();
  const stack = tools && tools.length ? tools : [receipt.tool_used];

  // Weak-data gate: every dim has no usable evidence OR transcript is tiny.
  const userWords = turns.filter(t => t.role === "user").reduce((n, t) => n + (t.content?.split(/\s+/).length ?? 0), 0);
  const allWeak = !audit?.dimensions?.length || audit.dimensions.every((d: any) =>
    d.evidence_basis === "insufficient_evidence" ||
    d.evidence_basis === "not_enough" ||
    d.score == null ||
    (d.score ?? 0) < 1
  );
  const transcriptTooShort = turns.length < 3 && userWords < 30;
  const useFoundationsFallback = !!audit && (allWeak || transcriptTooShort);

  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const handleSnippetClick = (_idx: number) => { if (showTranscript) setTranscriptOpen(true); };
  const visibleDims = (audit?.dimensions ?? []).filter((d: any) => d.canonical_name !== 'capital_stewardship');

  const [tourOpen, setTourOpen] = useState(false);
  const fetchCheckup = useServerFn(getReceiptCheckup);
  const { data: checkup, isLoading: checkupLoading } = useQuery({
    queryKey: ["receipt-checkup", receipt.id],
    queryFn: () => fetchCheckup({ data: { receiptId: receipt.id } }),
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const fetchChains = useServerFn(getReceiptChains);
  const { data: chainsData } = useQuery({
    queryKey: ["receipt-chains", receipt.id],
    queryFn: () => fetchChains({ data: { receiptId: receipt.id } }),
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          size="sm" variant="outline"
          onClick={() => setTourOpen(true)}
          disabled={checkupLoading || !checkup?.stops?.length}
          className="gap-1.5"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Charlotte's Tour
          <span className="text-[9px] uppercase tracking-wider px-1 py-0.5 rounded bg-[#6FFAC6] text-[#0c2340]">Beta</span>
        </Button>
      </div>
      <Card>
        <CardHeader className="space-y-3">
          <div className="space-y-1">
            <CardTitle className="text-lg flex items-center gap-2 min-w-0">
              <EditableReceiptTitle receipt={receipt as any} readOnly={adminView} />
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={toolBadgeClass(receipt.tool_used)}>{receipt.tool_used}</Badge>
              <span className="text-xs text-muted-foreground">{format(new Date(receipt.created_at), "PPP 'at' p")}</span>
              {band && <Badge variant="outline" className={`border ${band.className}`}>Overall: <span className="font-bold ml-1">{band.label}</span></Badge>}
            </div>
          </div>
        </CardHeader>
        {audit?.summary && (
          <CardContent className="pt-0"><p className="text-sm leading-relaxed">{audit.summary}</p></CardContent>
        )}
      </Card>

      {useFoundationsFallback ? (
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">Build your AI Fluency foundations</CardTitle>
            <p className="text-xs text-muted-foreground">
              This session was too short for a confident reading. Practice these 4 fundamentals — they apply to every AI tool and every workflow.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {AI_FLUENCY_FOUNDATIONS.map((f, i) => (
              <div key={i} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{f.dimension}</span>
                </div>
                <div className="text-sm font-semibold leading-snug">{f.title}</div>
                <p className="text-xs leading-relaxed text-muted-foreground">{f.body}</p>
                <div className="rounded-md bg-secondary/50 border border-border/60 p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Try this prompt</div>
                    <button
                      type="button"
                      aria-label="Copy prompt template"
                      onClick={() => navigator.clipboard?.writeText(f.prompt_template)}
                      className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                    >
                      <Clipboard className="h-3 w-3" />
                      Copy
                    </button>
                  </div>
                  <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground">
{f.prompt_template}
                  </pre>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : recommendationsLoading || recommendations?.status === "pending" ? (
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">Things to try</CardTitle>
            <p className="text-xs text-muted-foreground">Generating personalized recommendations…</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : recommendations && recommendations.recommendations.length > 0 && (
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-base">Things to try</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recommendations.recommendations.map((rec, i) => {
              const urgencyMeta =
                rec.urgency === "habit"
                  ? { label: "Recurring pattern", className: "bg-amber-100 text-amber-900 border-amber-300" }
                  : rec.urgency === "unlock"
                    ? { label: "New move", className: "bg-emerald-100 text-emerald-900 border-emerald-300" }
                    : { label: "Try this session", className: "bg-blue-100 text-blue-900 border-blue-300" };
              return (
                <div key={i} className="rounded-md border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Badge variant="outline" className={`text-[10px] ${urgencyMeta.className}`}>
                      {urgencyMeta.label}
                    </Badge>
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{rec.dimension}</span>
                  </div>
                  <div className="text-sm font-semibold leading-snug">{rec.title}</div>
                  <p className="text-sm leading-relaxed text-muted-foreground">{rec.body}</p>
                  {rec.prompt_template && (
                    <div className="rounded-md bg-secondary/50 border border-border/60 p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Prompt template</div>
                        <button
                          type="button"
                          aria-label="Copy prompt template"
                          onClick={() => {
                            navigator.clipboard?.writeText(rec.prompt_template ?? "");
                          }}
                          className="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                        >
                          <Clipboard className="h-3 w-3" />
                          Copy
                        </button>
                      </div>
                      <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground">
{rec.prompt_template}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {audit && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-sm">8-Dimension Fluency</CardTitle></CardHeader>
            <CardContent className="h-[clamp(360px,44vw,510px)]"><FluencyRadarChart series={radarSeries} dimensions={radarSeries ? undefined : receiptDims} confidenceByLabel={confidenceByLabel} /></CardContent>
            {!profileReady && (
              <div className="px-6 pb-4 -mt-2 text-xs text-muted-foreground leading-relaxed">
                Your fluency profile is <span className="font-medium text-foreground">directional</span> — it takes a few receipts before scores stabilize and start shifting your overall fluency. ({Math.max(profileReceiptCount, 1)} of 3 submitted)
              </div>
            )}
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm">Skill Evidence</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {visibleDims.map(d => {
                const state = dimensionEvidenceState(d.score);
                return (
                  <div key={d.canonical_name} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-28 shrink-0">{d.display_name}</span>
                    <div className="flex-1 h-1.5 bg-muted rounded">
                      <div className="h-full rounded bg-primary" style={{ width: `${((d.score ?? 0) / 5) * 100}%` }} />
                    </div>
                    <Badge variant="outline" className={`text-[10px] border ${evidenceStateStyle(state)}`}>{state}</Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}

      {chainsData?.chains?.length ? (
        <Card>
          <CardContent className="pt-4">
            <ChainTimeline chains={chainsData.chains} />
          </CardContent>
        </Card>
      ) : null}

      {audit && visibleDims.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Dimension evidence</CardTitle>
            <p className="text-xs text-muted-foreground">
              Why each dimension scored where it did, with quotes from your transcript.
              {showTranscript && turns.length > 0 && " Tap a quote to jump to that moment."}
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {visibleDims.map((d: any) => (
              <DimensionEvidenceCard
                key={d.canonical_name}
                dim={d}
                turns={showTranscript ? turns : []}
                onSnippetClick={handleSnippetClick}
                showNumericScore={adminView}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {showTranscript && turns.length > 0 && (
        <Card>
          <Collapsible open={transcriptOpen} onOpenChange={setTranscriptOpen}>
            <CollapsibleTrigger asChild>
              <div className="flex cursor-pointer items-center justify-between gap-3 p-4 hover:bg-accent/30 transition-colors">
                <div className="text-sm">
                  <div className="font-medium">View raw transcript</div>
                  <div className="text-xs text-muted-foreground">{turns.length} turns · admin only</div>
                </div>
                <ChevronDown className="h-4 w-4" />
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="border-t p-4 space-y-3 max-h-[600px] overflow-y-auto">
                {turns.map((t, i) => (
                  <div key={i} id={`receipt-turn-${t.idx}`} className="rounded-md transition-shadow">
                    <TurnBlock role={t.role} content={t.content} showCopy />
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}
    </div>
  );
}

