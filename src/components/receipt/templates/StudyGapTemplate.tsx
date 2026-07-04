import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { runStudyTemplate, getStudyAnalysis } from "@/serverfn/study-analyses";

type Risk = "low" | "medium" | "medium_high" | "high";

const RISK_STYLES: Record<
  Risk,
  { dot: string; chip: string; bar: string; label: string; width: string }
> = {
  low: {
    dot: "bg-emerald-500",
    chip: "bg-emerald-50 text-emerald-800 border-emerald-200",
    bar: "bg-emerald-500",
    label: "Low risk",
    width: "25%",
  },
  medium: {
    dot: "bg-amber-400",
    chip: "bg-amber-50 text-amber-800 border-amber-200",
    bar: "bg-amber-400",
    label: "Medium risk",
    width: "50%",
  },
  medium_high: {
    dot: "bg-orange-500",
    chip: "bg-orange-50 text-orange-800 border-orange-200",
    bar: "bg-orange-500",
    label: "Medium-high risk",
    width: "75%",
  },
  high: {
    dot: "bg-red-500",
    chip: "bg-red-50 text-red-800 border-red-200",
    bar: "bg-red-500",
    label: "High risk",
    width: "95%",
  },
};

interface StudyGapsAnalysis {
  summary?: string;
  context?: {
    course_or_subject: string | null;
    assignment_or_topic: string | null;
    assessment: string | null;
  };
  metrics?: {
    study_gaps_detected: number;
    active_recall_count: number;
    high_risk_count: number;
  };
  topics?: Array<{ name: string; status: string; risk: Risk; evidence: string }>;
  study_actions?: Array<{ title: string; reason: string; action: string }>;
  evidence_chips?: string[];
  highest_risk?: string;
  null_reason?: string | null;
}

interface Props {
  receiptId: string;
}

export function StudyGapTemplate({ receiptId }: Props) {
  const qc = useQueryClient();
  const [selfCheck, setSelfCheck] = useState(false);
  const fetchAnalysis = useServerFn(getStudyAnalysis);
  const runAnalyzer = useServerFn(runStudyTemplate);

  const analysisQuery = useQuery({
    queryKey: ["study-analysis", receiptId, "study_gaps"],
    queryFn: () =>
      fetchAnalysis({ data: { receiptId, templateKey: "study_gaps" } }),
  });

  const runMutation = useMutation({
    mutationFn: (force: boolean) =>
      runAnalyzer({ data: { receiptId, templateKey: "study_gaps", force } }),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["study-analysis", receiptId, "study_gaps"],
      }),
  });

  const row = analysisQuery.data?.row;
  const m = (row?.analysis_json ?? null) as StudyGapsAnalysis | null;

  if (analysisQuery.isLoading) {
    return (
      <div className="rounded-xl border bg-card p-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading study gaps…
      </div>
    );
  }

  if (!row || row.status === "error" || !m) {
    return (
      <div className="rounded-xl border bg-card p-6 space-y-3">
        <div className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5 text-[#0A2848]" />
          <h3 className="text-base font-semibold text-[#0A2848]">
            Study Gaps from AI Receipts
          </h3>
        </div>
        <p className="text-sm text-muted-foreground">
          {row?.error_message
            ? `Last run: ${row.error_message}`
            : "Run a study-gap analysis to turn this AI-assisted session into a personalized review plan."}
        </p>
        <Button
          onClick={() => runMutation.mutate(true)}
          disabled={runMutation.isPending}
          className="bg-[#0A2848] hover:bg-[#123a66] text-white"
        >
          {runMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyzing…
            </>
          ) : (
            "Run study-gap analysis"
          )}
        </Button>
      </div>
    );
  }

  const topics = m.topics ?? [];
  const actions = m.study_actions ?? [];
  const chips = m.evidence_chips ?? [];
  const metrics = m.metrics ?? {
    study_gaps_detected: topics.length,
    active_recall_count: 0,
    high_risk_count: topics.filter((t) => t.risk === "high").length,
  };
  const context = m.context ?? {
    course_or_subject: null,
    assignment_or_topic: null,
    assessment: null,
  };

  return (
    <div className="space-y-5">
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
              {m.summary ||
                "Turn AI-assisted homework into a personalized review plan."}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {context.course_or_subject && (
                <Badge className="bg-white/15 text-white border-white/20">
                  {context.course_or_subject}
                </Badge>
              )}
              {context.assessment && (
                <Badge className="bg-amber-400/20 text-amber-100 border-amber-300/40">
                  <Clock className="h-3 w-3 mr-1" />
                  {context.assessment}
                </Badge>
              )}
              {context.assignment_or_topic && (
                <Badge className="bg-white/15 text-white border-white/20">
                  {context.assignment_or_topic}
                </Badge>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-white hover:bg-white/10"
            onClick={() => runMutation.mutate(true)}
            disabled={runMutation.isPending}
          >
            {runMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Re-run"
            )}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border-2 border-[#0A2848]/10 bg-[#F5F8FC] p-5">
        <div className="flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-[#0A2848] mt-0.5 shrink-0" />
          <p className="text-[15px] font-medium text-[#0A2848] leading-snug">
            {m.summary ||
              "Here's what to review before you have to do it without AI."}
          </p>
        </div>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <MetricPill
            value={metrics.study_gaps_detected}
            label="study gaps found"
            tone="neutral"
          />
          <MetricPill
            value={metrics.active_recall_count}
            label="concepts need active recall"
            tone="amber"
          />
          <MetricPill
            value={metrics.high_risk_count}
            label="high-risk exam skill(s)"
            tone="red"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
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
          {topics.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No topics detected yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {topics.map((t) => {
                const s = RISK_STYLES[t.risk];
                return (
                  <li
                    key={t.name}
                    className="rounded-lg border bg-white p-3"
                  >
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
                        style={{ width: s.width }}
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
          )}
        </section>

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
            {actions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No study actions suggested yet.
              </p>
            ) : (
              <ol className="space-y-3">
                {actions.map((a, i) => (
                  <li
                    key={a.title + i}
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
                      {a.action && (
                        <div className="mt-2">
                          <Badge
                            variant="outline"
                            className="text-[10px] font-normal bg-[#F5F8FC] border-[#0A2848]/20 text-[#0A2848]"
                          >
                            <Target className="h-3 w-3 mr-1" />
                            {a.action}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

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
                  Practice the concepts Charlotte flagged before your next
                  assessment.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => setSelfCheck(true)}
                    className="bg-[#0A2848] hover:bg-[#123a66] text-white"
                  >
                    {selfCheck ? "Self-check started" : "Start self-check"}
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {(chips.length > 0 || m.highest_risk) && (
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
              {chips.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {chips.map((c) => (
                    <Badge
                      key={c}
                      variant="outline"
                      className="bg-[#F5F8FC] border-[#0A2848]/20 text-[#0A2848] text-xs font-normal"
                    >
                      {c}
                    </Badge>
                  ))}
                </div>
              )}
              {m.highest_risk && (
                <div className="pt-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    Highest exam risk:{" "}
                  </span>
                  {m.highest_risk}
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
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
