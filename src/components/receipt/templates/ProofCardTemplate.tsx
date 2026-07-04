import { ToolLogo } from "@/components/ToolLogo";
import { CheckCircle2, Scale, Award } from "lucide-react";

interface ProofCardAnalysis {
  template?: "proof_card";
  work_outcome?: string;
  tools_used?: string[];
  verification_events?: { label: string; verified: boolean }[];
  judgment_moments?: { label: string; quote: string }[];
  strongest_dimension?: { name: string; quote: string } | null;
  headline?: string;
  null_reason?: string | null;
}

interface Props {
  receiptId: string;
  analysis?: ProofCardAnalysis | null;
  receipt?: unknown;
  turns?: unknown;
}

export function ProofCardTemplate({ analysis }: Props) {
  if (!analysis) {
    return (
      <p className="text-sm text-muted-foreground">
        No analysis stored yet. Run it from the AI Analysis panel below.
      </p>
    );
  }
  if (analysis.null_reason) {
    return (
      <div className="rounded-md border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
        {analysis.null_reason}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {analysis.headline && (
        <div className="rounded-lg bg-[#0A2848] text-white p-4">
          <div className="text-[10px] uppercase tracking-wide text-white/60 mb-1">
            Resume headline
          </div>
          <p className="text-base font-medium leading-snug">
            {analysis.headline}
          </p>
        </div>
      )}

      {analysis.work_outcome && (
        <section>
          <SectionTitle>Work outcome</SectionTitle>
          <p className="text-sm text-foreground">{analysis.work_outcome}</p>
        </section>
      )}

      {analysis.tools_used && analysis.tools_used.length > 0 && (
        <section>
          <SectionTitle>Tools used</SectionTitle>
          <div className="flex flex-wrap items-center gap-2">
            {analysis.tools_used.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1.5 rounded-full border bg-white px-2.5 py-1 text-xs"
              >
                <ToolLogo tool={t} className="h-3.5 w-3.5" />
                {t}
              </span>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionTitle>What you checked</SectionTitle>
        {analysis.verification_events && analysis.verification_events.length ? (
          <ul className="space-y-1.5">
            {analysis.verification_events.map((v, i) => (
              <li
                key={i}
                className="flex items-start gap-2 rounded border bg-white px-3 py-2 text-sm"
              >
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                {v.label}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs italic text-muted-foreground">
            No verification events recorded.
          </p>
        )}
      </section>

      <section>
        <SectionTitle>Where judgment mattered</SectionTitle>
        {analysis.judgment_moments && analysis.judgment_moments.length ? (
          <ul className="space-y-2">
            {analysis.judgment_moments.map((j, i) => (
              <li key={i} className="rounded border bg-white p-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-[#0A2848]">
                  <Scale className="h-3.5 w-3.5" />
                  {j.label}
                </div>
                <blockquote className="mt-1 text-sm italic text-muted-foreground leading-snug">
                  "{j.quote}"
                </blockquote>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs italic text-muted-foreground">
            No judgment moments recorded.
          </p>
        )}
      </section>

      {analysis.strongest_dimension && (
        <section className="rounded-md border bg-amber-50/60 p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-900">
            <Award className="h-3.5 w-3.5" />
            Strongest dimension: {analysis.strongest_dimension.name}
          </div>
          <blockquote className="mt-1 text-sm italic text-foreground leading-snug">
            "{analysis.strongest_dimension.quote}"
          </blockquote>
        </section>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-[#0A2848] mb-2">
      {children}
    </h3>
  );
}

// Legacy named export used by the public share-card route. Renders a
// compact card from pre-aggregated counts. Kept as a shim so the share
// route continues to render without depending on per-template AI output.
export function ProofCard(props: {
  judgmentCount: number;
  verificationCount: number;
  risksCount: number;
  toolStack: string[];
  leadQuote: string | { content?: string | null } | null;
  sessionDate: string | null;
}) {
  const quote =
    typeof props.leadQuote === "string"
      ? props.leadQuote
      : props.leadQuote?.content ?? null;
  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      <div className="grid grid-cols-3 gap-3 text-center">
        <Stat label="Judgment" value={props.judgmentCount} />
        <Stat label="Verifications" value={props.verificationCount} />
        <Stat label="Risks flagged" value={props.risksCount} />
      </div>
      {props.toolStack.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 justify-center">
          {props.toolStack.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1.5 rounded-full border bg-white px-2.5 py-1 text-xs"
            >
              <ToolLogo tool={t} className="h-3.5 w-3.5" />
              {t}
            </span>
          ))}
        </div>
      )}
      {quote && (
        <blockquote className="rounded-md bg-muted/40 p-3 text-sm italic text-foreground">
          "{quote}"
        </blockquote>
      )}
      {props.sessionDate && (
        <p className="text-xs text-muted-foreground text-center">
          Session date: {props.sessionDate}
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border bg-white p-3">
      <div className="text-2xl font-semibold text-[#0A2848]">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
