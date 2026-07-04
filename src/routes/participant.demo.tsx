import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Sparkles, ChevronLeft, ChevronRight, Loader2, ChevronDown, RefreshCw } from "lucide-react";
import { getDemoReceipt } from "@/serverfn/demo";
import {
  ensureTemplateAnalyses,
  fetchTemplateAnalyses,
  rerunTemplateAnalysis,
} from "@/lib/template-analyses.functions";
import { ClassicFluencyTemplate } from "@/components/receipt/templates/ClassicFluencyTemplate";
import { ThinkingMapTemplate } from "@/components/receipt/templates/ThinkingMapTemplate";
import { ShieldTemplate } from "@/components/receipt/templates/ShieldTemplate";
import { ImpactProofTemplate } from "@/components/receipt/templates/ImpactProofTemplate";
import { ContextMapTemplate } from "@/components/receipt/templates/ContextMapTemplate";
import { StudyGapTemplate } from "@/components/receipt/templates/StudyGapTemplate";

import { TemplateFeedbackStrip } from "@/components/receipt/demo/TemplateFeedbackStrip";
import { TemplateAnalysisPanel } from "@/components/receipt/demo/TemplateAnalysisPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ToolLogo } from "@/components/ToolLogo";

export const Route = createFileRoute("/participant/demo")({
  component: DemoPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">{error.message}</div>
  ),
});

type AnalysisRow = {
  template_key: string;
  analysis_json: unknown;
  prompt_version: number | null;
  model: string | null;
  status: string;
  error_message: string | null;
  updated_at: string;
};

const TEMPLATE_META: Record<string, { name: string; promise: string; valueProp: string }> = {
  classic_fluency: {
    name: "Academic Fluency View",
    promise: "The full literacy audit — scores, signals, and recommendations.",
    valueProp: "Know exactly where your AI fluency stands across every dimension.",
  },
  thinking_map: {
    name: "Thinking Map",
    promise: "Every branch, judgment, and loop as a node graph.",
    valueProp: "See the shape of your thinking — where you pivoted, looped, and decided.",
  },
  context_map: {
    name: "Context Map",
    promise: "Branches, decisions, reframes, and open questions inside a long AI conversation.",
    valueProp: "See the branches, decisions, and turning points inside a long AI conversation.",
  },
  impact_proof: {
    name: "My Impact - Judgement and Originality Trail",
    promise: "Headline, outcome, and the evidence behind every claim — in one card.",
    valueProp: "One shareable card that turns your work into a credible, evidenced result.",
  },
  shield: {
    name: "Verifications & Information Risk Assessment",
    promise: "Verified-before-it-shipped receipt.",
    valueProp: "Show reviewers what you checked, what you verified, and what risk remains.",
  },
  study_gap: {
    name: "Study Gaps from AI Receipts",
    promise: "Turn AI-assisted homework into a personalized test prep plan.",
    valueProp: "See what you still need to learn before the closed-note exam.",
  },
};

const TEMPLATE_ORDER = [
  "classic_fluency",
  "thinking_map",
  "context_map",
  "impact_proof",
  "shield",
  "study_gap",
] as const;

function DemoPage() {
  const fetchDemo = useServerFn(getDemoReceipt);
  const ensureFn = useServerFn(ensureTemplateAnalyses);
  const fetchAnalyses = useServerFn(fetchTemplateAnalyses);
  const demoQuery = useQuery({
    queryKey: ["demo-receipt"],
    queryFn: () => fetchDemo(),
    staleTime: 5 * 60 * 1000,
  });

  const data = demoQuery.data;
  const receiptId = data?.receipt?.id as string | undefined;
  const threadTurns = data?.turns ?? [];

  const [analyses, setAnalyses] = useState<Record<string, AnalysisRow>>({});
  const [ensuring, setEnsuring] = useState(false);

  useEffect(() => {
    if (!receiptId) return;
    let cancelled = false;
    (async () => {
      // First pull whatever's already stored so the panels render fast.
      try {
        const rows = (await fetchAnalyses({ data: { receiptId } })) as Record<
          string,
          AnalysisRow
        >;
        if (!cancelled) setAnalyses(rows);
        const have = Object.keys(rows ?? {});
        const needed = [
          "thinking_map",
          "shield",
          "impact_proof",
          "context_map",
        ];
        if (needed.every((k) => have.includes(k))) return;
      } catch (e) {
        console.error("[demo] fetchTemplateAnalyses failed", e);
      }
      // Trigger the missing ones, then refetch.
      try {
        setEnsuring(true);
        await ensureFn({ data: { receiptId } });
        const rows = (await fetchAnalyses({ data: { receiptId } })) as Record<
          string,
          AnalysisRow
        >;
        if (!cancelled) setAnalyses(rows);
      } catch (e) {
        console.error("[demo] ensureTemplateAnalyses failed", e);
      } finally {
        if (!cancelled) setEnsuring(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [receiptId, ensureFn, fetchAnalyses]);

  return (
    <div className="space-y-4">
      <Link to="/participant">
        <Button variant="ghost" size="sm">
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
      </Link>

      <header className="rounded-xl border bg-card p-5 flex items-start gap-4">
        <div className="rounded-full bg-[#0A2848] text-white p-2.5 shrink-0">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs">
              DEMO
            </Badge>
            <h1 className="text-lg font-semibold tracking-tight text-[#0A2848] truncate">
              Business Plan Document — Dempsey Competition — Final
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Every Charlotte template, generated from one real captured session.
            Scroll through, leave a thumbs up/down + a quick note on the ones
            that work (or don't). Your feedback shapes what we ship.
          </p>
          {data && (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {data.primaryThreadTitle && (
                <span>
                  Thread:{" "}
                  <span className="font-medium text-foreground">
                    {data.primaryThreadTitle}
                  </span>
                </span>
              )}
              {data.tools.length > 0 && (
                <span className="flex items-center gap-1.5">
                  Tools:
                  {data.tools.map((t) => (
                    <ToolLogo key={t} tool={t} className="h-4 w-4" />
                  ))}
                </span>
              )}
              <span>{threadTurns.length} turns</span>
            </div>
          )}
        </div>
      </header>

      {demoQuery.isLoading && (
        <div className="rounded-xl border bg-card p-12 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
          Loading demo receipt…
        </div>
      )}
      {demoQuery.isError && (
        <div className="rounded-xl border bg-destructive/10 p-4 text-sm text-destructive">
          Could not load demo receipt:{" "}
          {(demoQuery.error as Error).message}
        </div>
      )}

      {ensuring && (
        <div className="rounded-md border border-dashed bg-muted/40 px-4 py-2 text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Running per-template AI analyses for the first time… this may take
          30–60s. Panels will populate as results arrive.
        </div>
      )}

      {data && receiptId && (
        <Collapsible className="rounded-xl border bg-card">
          <CollapsibleTrigger className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-[#0A2848]">
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Show original transcript ({threadTurns.length} turns)
            </span>
            <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t max-h-[480px] overflow-auto bg-muted/20 p-4 space-y-3">
              {threadTurns.map((t: any, i: number) => (
                <div key={i} className="rounded border bg-white p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="rounded bg-[#0A2848] text-white text-[10px] font-mono px-1.5 py-0.5">
                      T{(typeof t.idx === "number" ? t.idx : i) + 1}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
                      {String(t.role)}
                    </span>
                  </div>
                  <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground">
{String(t.content ?? "")}
                  </pre>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {data && receiptId && (
        <DemoCarousel
          receiptId={receiptId}
          analyses={analyses}
          setAnalyses={setAnalyses}
          data={data}
          threadTurns={threadTurns}
        />
      )}
    </div>
  );
}

function DemoCarousel({
  receiptId,
  analyses,
  setAnalyses,
  data,
  threadTurns,
}: {
  receiptId: string;
  analyses: Record<string, AnalysisRow>;
  setAnalyses: (rows: Record<string, AnalysisRow>) => void;
  data: any;
  threadTurns: any[];
}) {
  const [index, setIndex] = useState(0);
  const total = TEMPLATE_ORDER.length;
  const templateKey = TEMPLATE_ORDER[index];
  const meta = TEMPLATE_META[templateKey];

  const go = (dir: -1 | 1) => setIndex((i) => (i + dir + total) % total);

  const renderTemplate = () => {
    switch (templateKey) {
      case "classic_fluency":
        return (
          <ClassicFluencyTemplate
            receiptId={receiptId}
            receipt={data.receipt}
            run={data.run}
            turns={threadTurns as any}
            tools={data.tools}
            job={data.job}
            profile={null}
            recommendations={data.recommendations}
          />
        );
      case "thinking_map":
        return (
          <ThinkingMapTemplate
            receiptId={receiptId}
            analysis={(analyses.thinking_map?.analysis_json ?? null) as any}
            turns={threadTurns as any}
          />
        );
      case "impact_proof":
        return (
          <ImpactProofTemplate
            receiptId={receiptId}
            analysis={(analyses.impact_proof?.analysis_json ?? null) as any}
          />
        );
      case "context_map":
        return (
          <ContextMapTemplate
            receiptId={receiptId}
            analysis={(analyses.context_map?.analysis_json ?? null) as any}
          />
        );
      case "shield":
        return (
          <ShieldTemplate
            receiptId={receiptId}
            analysis={(analyses.shield?.analysis_json ?? null) as any}
          />
        );
      case "study_gap":
        return <StudyGapTemplate />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-3">
      {/* Carousel controls */}
      <div className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => go(-1)}
          aria-label="Previous template"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0 text-center">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Receipt {index + 1} of {total}
          </div>
          <div className="text-base font-semibold tracking-tight text-[#0A2848] truncate">
            {meta.name}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {meta.valueProp}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => go(1)}
          aria-label="Next template"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Dots */}
      <div className="flex items-center justify-center gap-1.5">
        {TEMPLATE_ORDER.map((k, i) => (
          <button
            key={k}
            onClick={() => setIndex(i)}
            aria-label={`Go to ${TEMPLATE_META[k].name}`}
            className={
              "h-1.5 rounded-full transition-all " +
              (i === index
                ? "w-6 bg-[#0A2848]"
                : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60")
            }
          />
        ))}
      </div>

      <TemplateCard
        key={templateKey}
        templateKey={templateKey}
        receiptId={receiptId}
        analyses={analyses}
        onRefetched={setAnalyses}
      >
        {renderTemplate()}
      </TemplateCard>
    </div>
  );
}

function TemplateCard({
  templateKey,
  receiptId,
  analyses,
  onRefetched,
  children,
}: {
  templateKey: string;
  receiptId: string;
  analyses: Record<string, AnalysisRow>;
  onRefetched: (rows: Record<string, AnalysisRow>) => void;
  children: ReactNode;
}) {
  const meta = TEMPLATE_META[templateKey];
  const rerun = useServerFn(rerunTemplateAnalysis);
  const refetch = useServerFn(fetchTemplateAnalyses);
  const hasAnalysisKey =
    templateKey !== "classic_fluency" && templateKey !== "study_gap";

  const mutation = useMutation({
    mutationFn: async () =>
      rerun({
        data: {
          receiptId,
          templateKey: templateKey as
            | "thinking_map"
            | "proof_card"
            | "shield"
            | "impact_statement"
            | "impact_proof"
            | "context_map",
        },
      }),
    onSuccess: async () => {
      const rows = await refetch({ data: { receiptId } });
      onRefetched(rows as Record<string, AnalysisRow>);
    },
  });

  return (
    <section className="rounded-xl border bg-card overflow-hidden">
      <header className="border-b bg-muted/20 px-5 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h2 className="text-base font-semibold tracking-tight text-[#0A2848]">
              {meta.name}
            </h2>
            <p className="text-xs text-muted-foreground">{meta.promise}</p>
          </div>
          {hasAnalysisKey && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="h-7 text-xs"
            >
              {mutation.isPending ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-3 w-3" />
              )}
              Re-run analysis
            </Button>
          )}
        </div>
        {mutation.isError && (
          <div className="mt-2 text-[11px] text-red-700">
            {(mutation.error as Error)?.message ?? "Re-run failed"}
          </div>
        )}
      </header>
      <div className="p-5">
        <div className="min-w-0">{children}</div>
        {hasAnalysisKey && (
          <TemplateAnalysisPanel
            templateKey={templateKey}
            receiptId={receiptId}
            analysis={analyses[templateKey] ?? null}
            onRefetched={onRefetched}
          />
        )}
        <TemplateFeedbackStrip
          templateKey={templateKey}
          templateName={meta.name}
          receiptId={receiptId}
        />
      </div>
    </section>
  );
}


