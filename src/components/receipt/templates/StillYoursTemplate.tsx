interface OriginalInput {
  turn_index: number;
  quote: string;
  label: string;
}
interface PushBack {
  turn_index: number;
  quote: string;
  what_they_rejected: string;
  partial: boolean;
}
interface DirectionChange {
  turn_index: number;
  quote: string;
  from_direction: string;
  to_direction: string;
}
interface EditorialDecision {
  turn_index: number;
  quote: string;
  decision: string;
}
interface StillYoursAnalysis {
  template?: "still_yours";
  original_inputs?: OriginalInput[];
  push_back_events?: PushBack[];
  direction_changes?: DirectionChange[];
  editorial_decisions?: EditorialDecision[];
  ownership_summary?: string;
  contribution_event_count?: number;
  null_reason?: string | null;
}

interface Props {
  receiptId: string;
  analysis?: StillYoursAnalysis | null;
  // Legacy props (ignored).
  receipt?: unknown;
  run?: unknown;
  turns?: unknown;
  recommendations?: unknown;
}

export function StillYoursTemplate({ analysis }: Props) {
  if (!analysis) return <NotRun />;
  if (analysis.null_reason)
    return <EmptyState reason={analysis.null_reason} />;

  return (
    <div className="space-y-5">
      <Section
        title="Original inputs"
        subtitle="What you brought that the AI could not generate."
        empty="No original inputs identified."
      >
        {(analysis.original_inputs ?? []).map((e, i) => (
          <Quote key={i} turnIndex={e.turn_index} quote={e.quote}>
            <div className="text-xs font-medium text-[#0A2848]">{e.label}</div>
          </Quote>
        ))}
      </Section>

      <Section
        title="Push back and rejection"
        subtitle="Where you disagreed with or refused AI output."
        empty="No push-back events recorded."
      >
        {(analysis.push_back_events ?? []).map((e, i) => (
          <Quote key={i} turnIndex={e.turn_index} quote={e.quote}>
            <div className="text-xs text-muted-foreground">
              Rejected: {e.what_they_rejected}
              {e.partial ? " (partial)" : ""}
            </div>
          </Quote>
        ))}
      </Section>

      <Section
        title="Direction changes"
        subtitle="Where you pivoted the task instead of refusing an answer."
        empty="No direction changes recorded."
      >
        {(analysis.direction_changes ?? []).map((e, i) => (
          <Quote key={i} turnIndex={e.turn_index} quote={e.quote}>
            <div className="text-xs text-muted-foreground">
              From <span className="font-medium">{e.from_direction}</span> to{" "}
              <span className="font-medium">{e.to_direction}</span>
            </div>
          </Quote>
        ))}
      </Section>

      <Section
        title="Editorial decisions"
        subtitle="Where you chose what to keep, cut, or approve."
        empty="No explicit editorial decisions recorded."
      >
        {(analysis.editorial_decisions ?? []).map((e, i) => (
          <Quote key={i} turnIndex={e.turn_index} quote={e.quote}>
            <div className="text-xs text-muted-foreground">{e.decision}</div>
          </Quote>
        ))}
      </Section>

      {analysis.ownership_summary && (
        <div className="rounded-md border bg-muted/30 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-[#0A2848] mb-1.5">
            What you contributed
          </div>
          <p className="text-sm text-foreground leading-relaxed">
            {analysis.ownership_summary}
          </p>
          {typeof analysis.contribution_event_count === "number" && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {analysis.contribution_event_count} contribution moments observed.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  subtitle,
  empty,
  children,
}: {
  title: string;
  subtitle: string;
  empty: string;
  children: React.ReactNode;
}) {
  const list = Array.isArray(children) ? children : [children];
  const hasContent = list.some(Boolean);
  return (
    <section>
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-[#0A2848]">{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {hasContent ? (
        <ul className="space-y-2">{children}</ul>
      ) : (
        <p className="text-xs text-muted-foreground italic">{empty}</p>
      )}
    </section>
  );
}

function Quote({
  turnIndex,
  quote,
  children,
}: {
  turnIndex: number;
  quote: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="rounded-md border bg-white p-3">
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="rounded bg-[#0A2848] text-white text-[10px] font-mono px-1.5 py-0.5">
          T{turnIndex + 1}
        </span>
        <blockquote className="text-sm text-foreground italic leading-snug">
          "{quote}"
        </blockquote>
      </div>
      {children}
    </li>
  );
}

function EmptyState({ reason }: { reason: string }) {
  return (
    <div className="rounded-md border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
      {reason}
    </div>
  );
}
function NotRun() {
  return (
    <p className="text-sm text-muted-foreground">
      No analysis stored yet. Run it from the AI Analysis panel below.
    </p>
  );
}
