import { Badge } from "@/components/ui/badge";
import { overallBand, dimensionEvidenceState, evidenceStateStyle, scoreToBand } from "@/lib/fluencyMapping";
import { matchSnippetToTurn } from "@/lib/snippetMatch";

interface DimensionLike {
  canonical_name: string;
  display_name: string;
  score: number | null;
  explanation?: string;
  evidence_basis?: string;
  evidence_snippets?: string[];
  behaviors_observed?: string[];
  citations?: Array<{ name?: string; url?: string; version_label?: string }>;
}

interface Props {
  dim: DimensionLike;
  turns: Array<{ idx: number; content: string; role: string }>;
  onSnippetClick?: (turnIdx: number) => void;
  /** When true (admin/researcher), show raw numeric score. Default false (participant). */
  showNumericScore?: boolean;
}

const BASIS_META: Record<string, { label: string; className: string }> = {
  direct_evidence:      { label: "Observed", className: "bg-[#EAF4E0] text-[#1a5020] border-[#B8D8A0]" },
  inferred_evidence:    { label: "Inferred", className: "bg-[#FBF2E0] text-[#7a5010] border-[#E0C880]" },
  insufficient_evidence:{ label: "Not enough evidence yet", className: "bg-muted text-muted-foreground border-border" },
  // legacy aliases (defensive)
  inferred:             { label: "Inferred", className: "bg-[#FBF2E0] text-[#7a5010] border-[#E0C880]" },
  not_enough:           { label: "Not enough evidence yet", className: "bg-muted text-muted-foreground border-border" },
};

function levelFromScore(score: number | null): string {
  if (score == null) return "Emerging";
  if (score >= 4.5) return "Strong";
  if (score >= 3.5) return "Proficient";
  if (score >= 2.5) return "Developing";
  return "Emerging";
}

export function DimensionEvidenceCard({ dim, turns, onSnippetClick, showNumericScore = false }: Props) {
  const level = overallBand(levelFromScore(dim.score));
  const evState = dimensionEvidenceState(dim.score);
  const basis = dim.evidence_basis ? BASIS_META[dim.evidence_basis] : null;
  const snippets = dim.evidence_snippets ?? [];
  const behaviors = dim.behaviors_observed ?? [];
  const band = scoreToBand(dim.score, dim.evidence_basis);

  const scrollToTurn = (idx: number) => {
    onSnippetClick?.(idx);
    // Defer scroll to allow Collapsible to mount the transcript content
    setTimeout(() => {
      const el = document.getElementById(`receipt-turn-${idx}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-primary", "ring-offset-2");
        setTimeout(() => el.classList.remove("ring-2", "ring-primary", "ring-offset-2"), 2400);
      }
    }, onSnippetClick ? 120 : 0);
  };

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold leading-tight">{dim.display_name}</h3>
          <div className="flex items-center gap-1.5 flex-wrap">
            {showNumericScore ? (
              <>
                <Badge variant="outline" className={`text-[10px] border ${level.className}`}>
                  {level.label}
                </Badge>
                <Badge variant="outline" className={`text-[10px] border ${evidenceStateStyle(evState)}`}>
                  {evState}
                </Badge>
                {basis && (
                  <Badge variant="outline" className={`text-[10px] border ${basis.className}`}>
                    {basis.label}
                  </Badge>
                )}
              </>
            ) : (
              <>
                {band.label && (
                  <Badge variant="outline" className={`text-[10px] border ${band.className}`}>
                    {band.label}
                  </Badge>
                )}
                <Badge variant="outline" className={`text-[10px] border ${evidenceStateStyle(evState)}`}>
                  {band.evidenceTag}
                </Badge>
              </>
            )}
          </div>
        </div>
        {showNumericScore && dim.score != null && (
          <div className="text-right">
            <div className="text-2xl font-bold tabular-nums">{dim.score.toFixed(1)}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">/ 5.0</div>
          </div>
        )}
      </div>

      {dim.explanation && (
        <p className="text-sm leading-relaxed text-foreground/90">{dim.explanation}</p>
      )}

      {dim.score == null && /ethics/i.test(dim.canonical_name + " " + dim.display_name) && (
        <p className="text-xs italic text-muted-foreground leading-snug">
          This dimension only scores explicit positive signals — citing sources, flagging sensitive
          data, scoping risk. A null score means it wasn't triggered, not that anything was wrong.
        </p>
      )}

      {snippets.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            Evidence from your transcript
          </div>
          {snippets.slice(0, 4).map((snip, i) => {
            const turnIdx = turns.length ? matchSnippetToTurn(snip, turns) : null;
            const content = (
              <blockquote className="border-l-2 border-primary/40 pl-3 italic text-sm text-muted-foreground leading-snug">
                "{snip}"
              </blockquote>
            );
            return turnIdx != null ? (
              <button
                key={i}
                type="button"
                onClick={() => scrollToTurn(turnIdx)}
                className="block w-full text-left hover:bg-accent/30 rounded px-1 py-1 transition-colors"
                title="Jump to this moment in the transcript"
              >
                {content}
              </button>
            ) : (
              <div key={i} className="px-1 py-1">{content}</div>
            );
          })}
        </div>
      )}

      {behaviors.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {behaviors.slice(0, 6).map((b, i) => (
            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground border border-border/60">
              {b}
            </span>
          ))}
        </div>
      )}

      {dim.citations && dim.citations.length > 0 && (
        <div className="text-[10px] text-muted-foreground pt-1 border-t border-border/40">
          Source: {dim.citations.map((c, i) => (
            <span key={i}>
              {i > 0 && ", "}
              {c.url ? (
                <a href={c.url} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
                  {c.name ?? c.url}
                </a>
              ) : (
                <span>{c.name}</span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
