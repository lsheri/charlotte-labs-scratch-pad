import { useState } from "react";
import {
  GraduationCap,
  AlertTriangle,
  Target,
  CheckCircle2,
  Clock,
  BookOpen,
  ListChecks,
  Sparkles,
  ChevronDown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type Risk = "low" | "medium" | "medium_high" | "high";

const RISK_STYLES: Record<
  Risk,
  { dot: string; chip: string; bar: string; label: string }
> = {
  low: {
    dot: "bg-emerald-500",
    chip: "bg-emerald-50 text-emerald-800 border-emerald-200",
    bar: "bg-emerald-500",
    label: "Low risk",
  },
  medium: {
    dot: "bg-amber-400",
    chip: "bg-amber-50 text-amber-800 border-amber-200",
    bar: "bg-amber-400",
    label: "Medium risk",
  },
  medium_high: {
    dot: "bg-orange-500",
    chip: "bg-orange-50 text-orange-800 border-orange-200",
    bar: "bg-orange-500",
    label: "Medium-high risk",
  },
  high: {
    dot: "bg-red-500",
    chip: "bg-red-50 text-red-800 border-red-200",
    bar: "bg-red-500",
    label: "High risk",
  },
};

const MOCK = {
  course: "ECON 201",
  assignment: "Homework 4: Elasticity, Surplus, and Taxes",
  assessment: "Midterm 1",
  daysUntilExam: 9,
  conversationsAnalyzed: 1,
  studentTurns: 23,
  aiTurns: 23,
  homeworkMinutes: 31,
  studyGapsDetected: 6,
  activeRecallCount: 3,
  highRiskCount: 1,
  highestRisk:
    "Graphing tax incidence and explaining tax burden without AI-generated phrasing.",
  topics: [
    {
      name: "Elasticity calculations",
      status: "Improving",
      risk: "medium" as Risk,
      evidence:
        "Student solved one new practice problem correctly after AI explanation.",
    },
    {
      name: "Consumer surplus",
      status: "Needs review",
      risk: "medium" as Risk,
      evidence:
        "Student asked why the height was demand intercept minus market price, then later explained the intuition correctly.",
    },
    {
      name: "Producer surplus",
      status: "Stable",
      risk: "low" as Risk,
      evidence: "Student restated the logic in her own words.",
    },
    {
      name: "Tax incidence",
      status: "Needs review",
      risk: "medium_high" as Risk,
      evidence:
        "Student was confused why buyers can bear tax burden when tax is placed on sellers.",
    },
    {
      name: "Tax graphing",
      status: "High risk",
      risk: "high" as Risk,
      evidence:
        "Student skipped the assignment graph and later said she still could not draw the full tax graph.",
    },
    {
      name: "Deadweight loss",
      status: "Low evidence",
      risk: "medium_high" as Risk,
      evidence:
        "AI generated the explanation, but student did not independently explain it.",
    },
  ],
  studyActions: [
    {
      title: "Draw a tax wedge graph from scratch",
      reason:
        "You asked for a checklist, but there is limited evidence you can recreate the graph without AI.",
      action: "5-minute graph drill",
    },
    {
      title: "Explain tax incidence in your own words",
      reason:
        "You initially thought sellers pay all of the tax when the tax is legally placed on sellers.",
      action: "60-second verbal explanation",
    },
    {
      title: "Practice midpoint elasticity without notes",
      reason:
        "You solved a new problem correctly, but the formula still depends on recall.",
      action: "3 practice problems",
    },
    {
      title: "Redraw consumer and producer surplus",
      reason:
        "You understood the intuition after explanation, but graph labeling is still a midterm risk.",
      action: "Label CS, PS, total surplus, and intercepts",
    },
    {
      title: "Explain deadweight loss",
      reason: "The homework answer was AI-written and not independently tested.",
      action: "One paragraph from memory",
    },
  ],
  evidenceChips: [
    "Asked AI to write final answers",
    "Asked conceptual clarification",
    "Solved one practice problem independently",
    "Skipped graphing step",
  ],
};

export function StudyGapTemplate() {
  const [selfCheck, setSelfCheck] = useState(false);
  const m = MOCK;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="rounded-xl border bg-gradient-to-br from-[#0A2848] to-[#123a66] p-5 text-white">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-white/15 p-2">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold tracking-tight">
              Study Gaps from AI Receipts
            </h2>
            <p className="text-sm text-white/80 mt-0.5">
              Turn AI-assisted homework into a personalized test prep plan.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge className="bg-white/15 text-white border-white/20 hover:bg-white/20">
                {m.course}
              </Badge>
              <Badge className="bg-amber-400/20 text-amber-100 border-amber-300/40 hover:bg-amber-400/25">
                <Clock className="h-3 w-3 mr-1" />
                Midterm in {m.daysUntilExam} days
              </Badge>
              <Badge className="bg-white/15 text-white border-white/20 hover:bg-white/20">
                HW4 analyzed
              </Badge>
            </div>
            <p className="mt-3 text-[11px] uppercase tracking-wide text-white/60">
              Based on syllabus + assignment + AI conversation
            </p>
          </div>
        </div>
      </div>

      {/* Main insight callout */}
      <div className="rounded-xl border-2 border-[#0A2848]/10 bg-[#F5F8FC] p-5">
        <div className="flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-[#0A2848] mt-0.5 shrink-0" />
          <p className="text-[15px] font-medium text-[#0A2848] leading-snug">
            You finished the assignment. Here's what to review before you have
            to do it without AI.
          </p>
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <MetricPill
            value={m.studyGapsDetected}
            label="study gaps found"
            tone="neutral"
          />
          <MetricPill
            value={m.activeRecallCount}
            label="concepts need active recall"
            tone="amber"
          />
          <MetricPill
            value={m.highRiskCount}
            label="high-risk exam skill"
            tone="red"
          />
        </div>
      </div>

      {/* Two-column: Map + Study List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Knowledge Gap Map */}
        <section className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="h-4 w-4 text-[#0A2848]" />
            <h3 className="text-sm font-semibold text-[#0A2848]">
              Knowledge Gap Map
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mb-4">
            Where your receipt shows strong, uneven, or missing evidence.
          </p>
          <ul className="space-y-3">
            {m.topics.map((t) => {
              const s = RISK_STYLES[t.risk];
              return (
                <li key={t.name} className="rounded-lg border bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`h-2.5 w-2.5 rounded-full shrink-0 ${s.dot}`}
                      />
                      <span className="font-medium text-sm text-[#0A2848] truncate">
                        {t.name}
                      </span>
                    </div>
                    <span
                      className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border ${s.chip}`}
                    >
                      {t.status}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full ${s.bar}`}
                      style={{
                        width:
                          t.risk === "low"
                            ? "25%"
                            : t.risk === "medium"
                            ? "50%"
                            : t.risk === "medium_high"
                            ? "75%"
                            : "95%",
                      }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground leading-snug">
                    <span className="font-medium text-foreground">
                      Evidence:{" "}
                    </span>
                    {t.evidence}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Prioritized Study List + CTA */}
        <div className="space-y-5">
          <section className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-2 mb-1">
              <ListChecks className="h-4 w-4 text-[#0A2848]" />
              <h3 className="text-sm font-semibold text-[#0A2848]">
                What to study next
              </h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Ranked by exam risk and evidence gap.
            </p>
            <ol className="space-y-3">
              {m.studyActions.map((a, i) => (
                <li
                  key={a.title}
                  className="rounded-lg border bg-white p-3 flex gap-3"
                >
                  <div className="shrink-0 h-7 w-7 rounded-full bg-[#0A2848] text-white text-xs font-semibold flex items-center justify-center">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[#0A2848]">
                      {a.title}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                      {a.reason}
                    </p>
                    <div className="mt-2">
                      <Badge
                        variant="outline"
                        className="text-[10px] font-normal bg-[#F5F8FC] border-[#0A2848]/20 text-[#0A2848]"
                      >
                        <Target className="h-3 w-3 mr-1" />
                        {a.action}
                      </Badge>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* CTA */}
          <section className="rounded-xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-white p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-amber-400 text-white p-2 shrink-0">
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-[#0A2848]">
                  Start 10-minute self-check
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Practice the concepts Charlotte flagged before the midterm.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => setSelfCheck(true)}
                    className="bg-[#0A2848] hover:bg-[#123a66] text-white"
                  >
                    {selfCheck ? "Self-check started" : "Start self-check"}
                  </Button>
                  <Button size="sm" variant="outline">
                    Add to study list
                  </Button>
                  <Button size="sm" variant="ghost">
                    View original receipt
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Evidence section */}
      <Collapsible defaultOpen className="rounded-xl border bg-card">
        <CollapsibleTrigger className="w-full flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[#0A2848]" />
            <span className="text-sm font-semibold text-[#0A2848]">
              Why Charlotte recommended this
            </span>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t px-5 py-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {m.evidenceChips.map((c) => (
                <Badge
                  key={c}
                  variant="outline"
                  className="bg-[#F5F8FC] border-[#0A2848]/20 text-[#0A2848] text-xs font-normal"
                >
                  {c}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Charlotte does not assume you do not know a topic. It identifies
              where your receipt shows limited evidence of independent practice.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t">
              <MiniStat label="Conversations" value={m.conversationsAnalyzed} />
              <MiniStat label="Student turns" value={m.studentTurns} />
              <MiniStat label="AI turns" value={m.aiTurns} />
              <MiniStat label="Homework time" value={`${m.homeworkMinutes}m`} />
            </div>
            <div className="pt-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                Highest exam risk:{" "}
              </span>
              {m.highestRisk}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function MetricPill({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "neutral" | "amber" | "red";
}) {
  const toneClass =
    tone === "red"
      ? "text-red-700"
      : tone === "amber"
      ? "text-amber-700"
      : "text-[#0A2848]";
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className={`text-2xl font-bold leading-none ${toneClass}`}>
        {value}
      </div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div>
      <div className="text-sm font-semibold text-[#0A2848]">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
