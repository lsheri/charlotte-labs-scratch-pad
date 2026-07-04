// Context Map — mind-map hero + supporting summary sections.
import {
  Compass,
  HelpCircle,
  GitBranch,
  User,
  PauseCircle,
  CircleDashed,
  Flag,
  Sparkles,
  Lightbulb,
  Bookmark,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { StackedLanes } from "./context-map/StackedLanes";
import { MindMapCanvas } from "./context-map/MindMapCanvas";
import {
  hasMindMapShape,
  hasSwimlaneShape,
  type ContextMapAnalysis,
} from "./context-map/types";

interface Props {
  receiptId: string;
  analysis?: ContextMapAnalysis | null;
}

const REVISIT_LABEL: Record<"low" | "medium" | "high", string> = {
  low: "Low revisit",
  medium: "Maybe revisit",
  high: "Worth revisiting",
};

const REVISIT_STYLE: Record<"low" | "medium" | "high", string> = {
  low: "bg-slate-100 text-slate-700 border-slate-200",
  medium: "bg-amber-100 text-amber-900 border-amber-200",
  high: "bg-emerald-100 text-emerald-900 border-emerald-200",
};

export function ContextMapTemplate({ analysis }: Props) {
  const isMobile = useIsMobile();

  if (!analysis) {
    return (
      <p className="text-sm text-muted-foreground">
        Building your mind map… Charlotte is tracing every prompt back to the
        original question.
      </p>
    );
  }
  if (analysis.null_reason) {
    return (
      <p className="text-sm text-muted-foreground">
        Charlotte could not reliably map this conversation. Try again or use a
        shorter thread. ({analysis.null_reason})
      </p>
    );
  }

  const mindMapReady = hasMindMapShape(analysis);
  const swimlaneReady = hasSwimlaneShape(analysis);
  const nodes = [...(analysis.nodes ?? [])].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0),
  );
  const branches = analysis.branches ?? [];
  const pickUpHere = analysis.pickUpHere ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border bg-gradient-to-br from-[#0A2848] to-[#163E73] text-white p-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider opacity-80">
          <Compass className="h-3.5 w-3.5" />
          Context Map
        </div>
        <h2 className="text-xl font-semibold mt-1">
          {analysis.conversationTitle || analysis.title || "Context Map"}
        </h2>
        {analysis.mapSummary && (
          <p className="text-sm opacity-90 mt-2 leading-relaxed">
            {analysis.mapSummary}
          </p>
        )}
        {analysis.receiptInsight && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-white/15 bg-white/5 p-3">
            <Sparkles className="h-4 w-4 mt-0.5 shrink-0 text-amber-200" />
            <p className="text-sm leading-relaxed">
              {analysis.receiptInsight}
            </p>
          </div>
        )}
      </div>

      {/* MAP HERO */}
      <Section title="Trains of thought" Icon={GitBranch}>
        <p className="text-xs text-muted-foreground mb-2">
          Every prompt becomes a node. Branches show where you forked new lines
          of thinking. Click any node to inspect the verbatim prompt and what
          changed after.
        </p>
        {mindMapReady ? (
          isMobile ? (
            <StackedLanes branches={branches} nodes={nodes} />
          ) : (
            <MindMapCanvas
              nodes={nodes}
              rootQuestion={analysis.startingPoint?.originalQuestion}
            />
          )
        ) : swimlaneReady ? (
          <div>
            <div className="rounded-lg border bg-yellow-50/50 border-yellow-200 p-3 text-xs text-yellow-900 mb-3">
              Legacy timeline shape. Re-run the Context Map to generate the new
              mind-map view.
            </div>
            <StackedLanes branches={branches} nodes={nodes} />
          </div>
        ) : (
          <div className="rounded-lg border bg-yellow-50/50 border-yellow-200 p-3 text-xs text-yellow-900">
            Legacy analysis. Re-run the Context Map to generate the mind map.
          </div>
        )}
      </Section>

      {/* Two-column supporting summary */}
      <div className="grid gap-6 lg:grid-cols-2">
        {analysis.startingPoint && (
          <Section title="Starting point" Icon={HelpCircle}>
            <div className="rounded-lg border bg-sky-50/50 p-4 space-y-2">
              {analysis.startingPoint.originalQuestion && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Original question
                  </div>
                  <div className="text-sm text-foreground mt-0.5">
                    {analysis.startingPoint.originalQuestion}
                  </div>
                </div>
              )}
              {analysis.startingPoint.intendedOutcome && (
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Intended outcome
                  </div>
                  <div className="text-sm text-foreground mt-0.5">
                    {analysis.startingPoint.intendedOutcome}
                  </div>
                </div>
              )}
            </div>
          </Section>
        )}

        {analysis.humanJudgmentMoments && analysis.humanJudgmentMoments.length > 0 && (
          <Section title="Where the human changed the work" Icon={User}>
            <div className="space-y-2">
              {analysis.humanJudgmentMoments.slice(0, 3).map((m, i) => (
                <div
                  key={i}
                  className="rounded-lg border-l-4 border-emerald-500 bg-emerald-50/60 p-3"
                >
                  <div className="font-semibold text-sm text-[#0A2848]">
                    {m.title}
                  </div>
                  {m.humanMove && (
                    <p className="text-xs text-foreground/80 mt-1">
                      <span className="uppercase tracking-wide text-emerald-900 mr-1">
                        Human moved:
                      </span>
                      {m.humanMove}
                    </p>
                  )}
                  {m.impact && (
                    <p className="text-xs text-emerald-900 mt-1 italic">
                      Impact: {m.impact}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>

      {analysis.memoryHighlights && analysis.memoryHighlights.length > 0 && (
        <Section title="What you might have forgotten" Icon={Bookmark}>
          <div className="grid gap-3 md:grid-cols-3">
            {analysis.memoryHighlights.slice(0, 3).map((m, i) => (
              <div
                key={i}
                className="rounded-lg border-l-4 border-amber-400 bg-amber-50/70 p-3"
              >
                <div className="font-semibold text-sm text-[#0A2848]">
                  {m.title}
                </div>
                {m.detail && (
                  <p className="text-xs text-foreground/80 mt-1">{m.detail}</p>
                )}
                {m.whyItMattersNow && (
                  <p className="text-[11px] text-amber-900 mt-2 italic">
                    Why it matters now: {m.whyItMattersNow}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {analysis.rejectedOrPausedPaths && analysis.rejectedOrPausedPaths.length > 0 && (
        <Section title="Paused or rejected ideas" Icon={PauseCircle}>
          <div className="space-y-2">
            {analysis.rejectedOrPausedPaths.map((p, i) => (
              <div key={i} className="rounded-lg border bg-card p-3">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="font-semibold text-sm text-[#0A2848]">
                    {p.title}
                  </div>
                  <span
                    className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${REVISIT_STYLE[p.revisitPotential]}`}
                  >
                    {REVISIT_LABEL[p.revisitPotential]}
                  </span>
                </div>
                <p className="text-sm text-foreground/80 mt-1">
                  {p.whyPausedOrRejected}
                </p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {analysis.openQuestions && analysis.openQuestions.length > 0 && (
        <Section title="Open loops" Icon={CircleDashed}>
          <ul className="space-y-2">
            {analysis.openQuestions.map((q, i) => (
              <li
                key={i}
                className="rounded-lg border bg-yellow-50/50 border-yellow-200 p-3"
              >
                <div className="font-medium text-sm text-[#0A2848]">
                  {q.question}
                </div>
                {q.whyItMatters && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {q.whyItMatters}
                  </p>
                )}
                {q.suggestedNextStep && (
                  <p className="text-xs text-[#0A2848] mt-2">
                    <span className="uppercase tracking-wide text-muted-foreground mr-1">
                      Next step:
                    </span>
                    {q.suggestedNextStep}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {pickUpHere.length > 0 && (
        <Section title="Pick up here" Icon={Flag}>
          <div className="space-y-2">
            {pickUpHere.map((p, i) => (
              <div
                key={i}
                className="rounded-lg border-l-4 border-[#0A2848] bg-slate-50 p-3"
              >
                <div className="flex items-start gap-2">
                  <Lightbulb className="h-4 w-4 text-[#0A2848] mt-0.5 shrink-0" />
                  <div className="font-semibold text-sm text-[#0A2848]">
                    {p.action}
                  </div>
                </div>
                {p.continuationPrompt && (
                  <div className="mt-2 ml-6 rounded-md border border-slate-200 bg-white p-2 text-xs text-foreground/80 italic">
                    “{p.continuationPrompt}”
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  Icon,
  children,
}: {
  title: string;
  Icon: typeof Compass;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[#0A2848] uppercase tracking-wide">
          <Icon className="h-4 w-4" />
          {title}
        </h3>
      </div>
      {children}
    </section>
  );
}

