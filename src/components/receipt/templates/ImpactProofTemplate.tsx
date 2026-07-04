import { ToolLogo } from "@/components/ToolLogo";
import { CheckCircle2, Scale, Award, Quote } from "lucide-react";

type EvidenceKind = "judgment" | "verification";

interface EvidenceItem {
  kind: EvidenceKind;
  label: string;
  quote: string;
  evidence_strength?: "direct" | "inferred";
  method?: string;
}

interface ImpactProofAnalysis {
  template?: "impact_proof";
  headline?: string;
  outcome?: string;
  tools_used?: string[];
  evidence?: EvidenceItem[];
  skills?: { label: string; quote: string }[];
  strongest_dimension?: { name: string; quote: string } | null;
  null_reason?: string | null;
}

interface Props {
  receiptId: string;
  analysis?: ImpactProofAnalysis | null;
  receipt?: unknown;
  turns?: unknown;
}

export function ImpactProofTemplate({ analysis }: Props) {
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

  const evidence = analysis.evidence ?? [];
  const judgmentCount = evidence.filter((e) => e.kind === "judgment").length;
  const verificationCount = evidence.filter((e) => e.kind === "verification").length;

  return (
    <article className="overflow-hidden rounded-2xl border border-[#0A2848]/15 bg-white shadow-[0_1px_0_rgba(10,40,72,0.04),0_24px_60px_-30px_rgba(10,40,72,0.35)]">
      {/* Hero */}
      <header className="relative bg-gradient-to-br from-[#0A2848] via-[#0E3360] to-[#163E73] px-6 py-7 text-white">
        <div className="absolute inset-0 opacity-[0.08] pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 0%, white 0, transparent 40%), radial-gradient(circle at 80% 100%, white 0, transparent 35%)",
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/60">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-300" />
            Impact Proof
            <span className="text-white/30">·</span>
            <span>{new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
          </div>
          {analysis.headline && (
            <h2 className="mt-3 font-serif text-[1.65rem] leading-[1.18] tracking-tight text-white">
              {analysis.headline}
            </h2>
          )}
          {analysis.outcome && (
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/80">
              {analysis.outcome}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
            {analysis.tools_used && analysis.tools_used.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {analysis.tools_used.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-white ring-1 ring-white/15 backdrop-blur"
                  >
                    <ToolLogo tool={t} className="h-3.5 w-3.5" />
                    {t}
                  </span>
                ))}
              </div>
            )}
            {(judgmentCount > 0 || verificationCount > 0) && (
              <div className="ml-auto flex items-center gap-3 text-[11px] text-white/70">
                {verificationCount > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                    {verificationCount} verification{verificationCount === 1 ? "" : "s"}
                  </span>
                )}
                {judgmentCount > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Scale className="h-3.5 w-3.5 text-amber-300" />
                    {judgmentCount} judgment moment{judgmentCount === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Evidence rail */}
      {evidence.length > 0 && (
        <section className="px-6 py-6">
          <div className="mb-4 flex items-baseline justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0A2848]">
              Evidence
            </h3>
            <span className="text-[11px] text-muted-foreground">
              In the order it happened
            </span>
          </div>

          <ol className="relative space-y-3 before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-px before:bg-[#0A2848]/10">
            {evidence.map((e, i) => (
              <EvidenceRow key={i} item={e} index={i + 1} />
            ))}
          </ol>
        </section>
      )}

      {/* Footer: strongest dimension + skills */}
      {(analysis.strongest_dimension || (analysis.skills && analysis.skills.length > 0)) && (
        <footer className="border-t border-[#0A2848]/10 bg-[#FAF7F1]/60 px-6 py-5">
          {analysis.strongest_dimension && (
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-amber-100 p-1.5 text-amber-900 ring-1 ring-amber-200">
                <Award className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-900">
                  Strongest dimension · {analysis.strongest_dimension.name}
                </div>
                <blockquote className="mt-1 text-sm italic leading-snug text-foreground/85">
                  "{analysis.strongest_dimension.quote}"
                </blockquote>
              </div>
            </div>
          )}

          {analysis.skills && analysis.skills.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground mr-1">
                Skills
              </span>
              {analysis.skills.map((s, i) => (
                <span
                  key={i}
                  title={s.quote}
                  className="cursor-help rounded-full bg-[#0A2848] px-2.5 py-1 text-[11px] font-medium text-white/95 hover:bg-[#0A2848]/90"
                >
                  {s.label}
                </span>
              ))}
            </div>
          )}
        </footer>
      )}
    </article>
  );
}

function EvidenceRow({ item, index }: { item: EvidenceItem; index: number }) {
  const isVerify = item.kind === "verification";
  return (
    <li className="relative pl-10">
      {/* Numbered chip */}
      <span
        className={[
          "absolute left-0 top-0 inline-flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold ring-2 ring-white",
          isVerify
            ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
            : "bg-amber-50 text-amber-800 ring-amber-100",
        ].join(" ")}
        aria-hidden
      >
        {isVerify ? <CheckCircle2 className="h-4 w-4" /> : <Scale className="h-4 w-4" />}
      </span>

      <div className="rounded-lg border border-[#0A2848]/10 bg-white p-3.5 transition hover:border-[#0A2848]/25">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-wide">
              <span className="font-mono text-muted-foreground">#{index}</span>
              <span
                className={[
                  "rounded px-1.5 py-0.5 font-semibold",
                  isVerify
                    ? "bg-emerald-100 text-emerald-900"
                    : "bg-amber-100 text-amber-900",
                ].join(" ")}
              >
                {isVerify ? "Verification" : "Judgment"}
              </span>
              {isVerify && item.method && (
                <span className="rounded border border-emerald-200 px-1.5 py-0.5 text-emerald-800">
                  {item.method}
                </span>
              )}
              {!isVerify && item.evidence_strength && (
                <span
                  className={[
                    "rounded border px-1.5 py-0.5",
                    item.evidence_strength === "direct"
                      ? "border-emerald-200 text-emerald-800"
                      : "border-amber-200 text-amber-800",
                  ].join(" ")}
                >
                  {item.evidence_strength}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm font-medium text-foreground">{item.label}</p>
          </div>
        </div>
        {item.quote && (
          <blockquote className="mt-2 flex gap-2 rounded-md bg-[#0A2848]/[0.035] px-3 py-2 text-xs italic leading-snug text-foreground/80">
            <Quote className="h-3 w-3 shrink-0 mt-0.5 text-[#0A2848]/40" />
            <span>"{item.quote}"</span>
          </blockquote>
        )}
      </div>
    </li>
  );
}
