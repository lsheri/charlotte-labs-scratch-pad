interface Contribution {
  rank: number;
  description: string;
  quote: string;
  evidence_strength: "direct" | "inferred";
}
interface Skill {
  skill_label: string;
  quote: string;
}
interface ImpactStatementAnalysis {
  template?: "impact_statement";
  work_accomplished?: string;
  human_contributions?: Contribution[];
  skills_demonstrated?: Skill[];
  ai_handled_summary?: string;
  impact_headline?: string;
  null_reason?: string | null;
}

interface Props {
  receiptId: string;
  demoMode?: boolean;
  analysis?: ImpactStatementAnalysis | null;
}

export function ImpactStatementTemplate({ analysis }: Props) {
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
      {analysis.impact_headline && (
        <div className="rounded-lg bg-[#0A2848] text-white p-4">
          <div className="text-[10px] uppercase tracking-wide text-white/60 mb-1">
            Review-ready headline
          </div>
          <p className="text-base font-medium leading-snug">
            {analysis.impact_headline}
          </p>
        </div>
      )}

      {analysis.work_accomplished && (
        <section>
          <SectionTitle>Work accomplished</SectionTitle>
          <p className="text-sm">{analysis.work_accomplished}</p>
        </section>
      )}

      {analysis.human_contributions && analysis.human_contributions.length > 0 && (
        <section>
          <SectionTitle>How your judgment shaped the outcome</SectionTitle>
          <ol className="space-y-2">
            {analysis.human_contributions.map((c) => (
              <li key={c.rank} className="rounded border bg-white p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="rounded bg-[#0A2848] text-white text-[10px] font-mono px-1.5 py-0.5">
                    #{c.rank}
                  </span>
                  <span
                    className={`text-[10px] uppercase tracking-wide font-semibold ${
                      c.evidence_strength === "direct"
                        ? "text-emerald-700"
                        : "text-amber-700"
                    }`}
                  >
                    {c.evidence_strength}
                  </span>
                </div>
                <p className="text-sm text-foreground">{c.description}</p>
                <blockquote className="mt-1 text-xs italic text-muted-foreground border-l-2 border-muted pl-2 leading-snug">
                  "{c.quote}"
                </blockquote>
              </li>
            ))}
          </ol>
        </section>
      )}

      {analysis.skills_demonstrated && analysis.skills_demonstrated.length > 0 && (
        <section>
          <SectionTitle>Skills demonstrated</SectionTitle>
          <ul className="space-y-2">
            {analysis.skills_demonstrated.map((s, i) => (
              <li key={i} className="rounded border bg-white p-3">
                <div className="text-sm font-medium text-[#0A2848]">
                  {s.skill_label}
                </div>
                <blockquote className="mt-1 text-xs italic text-muted-foreground leading-snug">
                  "{s.quote}"
                </blockquote>
              </li>
            ))}
          </ul>
        </section>
      )}

      {analysis.ai_handled_summary && (
        <section className="rounded-md border bg-muted/30 p-3">
          <SectionTitle>What the AI handled</SectionTitle>
          <p className="text-sm leading-relaxed text-foreground">
            {analysis.ai_handled_summary}
          </p>
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
