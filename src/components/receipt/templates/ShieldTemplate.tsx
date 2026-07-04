import { useState } from "react";
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  HelpCircle,
  ChevronDown,
  Quote,
} from "lucide-react";

type Risk = "HIGH" | "MEDIUM" | "LOW";

interface ShieldAnalysis {
  template?: "shield";
  verified_claims?: { claim: string; method: string; verified: boolean }[];
  accepted_without_verification?: {
    content: string;
    quote: string;
    risk_level: Risk;
    risk_reason: string;
  }[];
  loops_resolved?: { topic: string; turns_to_resolve: number }[];
  open_questions?: string[];
  risk_summary?: string;
  null_reason?: string | null;
}

interface Props {
  receiptId: string;
  analysis?: ShieldAnalysis | null;
  receipt?: unknown;
  turns?: unknown;
}

const RISK_RANK: Record<Risk, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

const RISK_PILL: Record<Risk, string> = {
  HIGH: "bg-red-100 text-red-900 border-red-200",
  MEDIUM: "bg-amber-100 text-amber-900 border-amber-200",
  LOW: "bg-emerald-100 text-emerald-900 border-emerald-200",
};

const RISK_DOT: Record<Risk, string> = {
  HIGH: "bg-red-500",
  MEDIUM: "bg-amber-500",
  LOW: "bg-emerald-500",
};

const RISK_BAND: Record<Risk | "NONE", { bg: string; text: string; label: string }> = {
  HIGH: { bg: "from-red-600 to-red-700", text: "text-white", label: "High risk" },
  MEDIUM: { bg: "from-amber-500 to-amber-600", text: "text-white", label: "Medium risk" },
  LOW: { bg: "from-emerald-600 to-emerald-700", text: "text-white", label: "Low risk" },
  NONE: { bg: "from-[#0A2848] to-[#163E73]", text: "text-white", label: "All clear" },
};

export function ShieldTemplate({ analysis }: Props) {
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

  const verified = analysis.verified_claims ?? [];
  const unverified = (analysis.accepted_without_verification ?? [])
    .slice()
    .sort((a, b) => (RISK_RANK[a.risk_level] ?? 9) - (RISK_RANK[b.risk_level] ?? 9));
  const loops = analysis.loops_resolved ?? [];
  const open = analysis.open_questions ?? [];

  const worstRisk: Risk | "NONE" =
    unverified.find((u) => u.risk_level === "HIGH")
      ? "HIGH"
      : unverified.find((u) => u.risk_level === "MEDIUM")
        ? "MEDIUM"
        : unverified.length > 0
          ? "LOW"
          : "NONE";
  const band = RISK_BAND[worstRisk];

  return (
    <article className="overflow-hidden rounded-2xl border border-[#0A2848]/15 bg-white shadow-[0_1px_0_rgba(10,40,72,0.04),0_24px_60px_-30px_rgba(10,40,72,0.35)]">
      {/* Hero */}
      <header className={`relative bg-gradient-to-br ${band.bg} ${band.text} px-6 py-6`}>
        <div className="absolute inset-0 opacity-[0.10] pointer-events-none"
          style={{ backgroundImage: "radial-gradient(circle at 90% 10%, white 0, transparent 35%)" }}
        />
        <div className="relative flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="rounded-xl bg-white/15 p-2.5 ring-1 ring-white/20 backdrop-blur">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/70">
                Shield · Before this goes out
              </div>
              <p className="mt-1 text-base leading-snug">
                {analysis.risk_summary ?? "Reviewed for verified claims, unchecked assumptions, and loose ends."}
              </p>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ring-1 ring-white/25 backdrop-blur">
            {band.label}
          </span>
        </div>

        {/* Counters */}
        <div className="relative mt-5 grid grid-cols-4 gap-px overflow-hidden rounded-lg bg-white/15 ring-1 ring-white/15">
          <Stat n={verified.length} label="Verified" />
          <Stat n={unverified.length} label="Unverified" highlight={unverified.length > 0} />
          <Stat n={loops.length} label="Loops" />
          <Stat n={open.length} label="Open" />
        </div>
      </header>

      {/* Body */}
      <div className="space-y-3 p-5">
        {/* Unverified — lead, sorted high → low */}
        <section className="rounded-xl border border-amber-200/70 bg-amber-50/40 p-4">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-700" />
            <h3 className="text-sm font-semibold text-amber-950">
              Accepted without verification
            </h3>
            <span className="ml-auto text-[11px] text-amber-900/70">
              Sorted by severity
            </span>
          </div>
          {unverified.length === 0 ? (
            <p className="text-xs italic text-amber-900/70">
              Nothing shipped without a check.
            </p>
          ) : (
            <ul className="space-y-2">
              {unverified.map((a, i) => (
                <li key={i} className="rounded-lg border border-amber-200/80 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 min-w-0">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${RISK_DOT[a.risk_level]}`} />
                      <p className="text-sm font-medium text-foreground">{a.content}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${RISK_PILL[a.risk_level]}`}
                    >
                      {a.risk_level}
                    </span>
                  </div>
                  {a.quote && (
                    <blockquote className="mt-2 flex gap-2 rounded-md bg-foreground/[0.03] px-3 py-2 text-xs italic leading-snug text-muted-foreground">
                      <Quote className="h-3 w-3 shrink-0 mt-0.5 text-foreground/30" />
                      <span>"{a.quote}"</span>
                    </blockquote>
                  )}
                  {a.risk_reason && (
                    <p className="mt-2 text-xs leading-snug text-foreground/80">{a.risk_reason}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Collapsed reassurance sections */}
        <Disclosure
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          title="Verified claims"
          count={verified.length}
        >
          {verified.length === 0 ? (
            <Empty>No verification events recorded.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {verified.map((v, i) => (
                <li
                  key={i}
                  className="flex items-start justify-between gap-3 rounded-md border bg-white px-3 py-2 text-sm"
                >
                  <span className="font-medium text-foreground">{v.claim}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {v.method}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Disclosure>

        <Disclosure
          icon={<RotateCcw className="h-4 w-4 text-[#0A2848]" />}
          title="Loops that resolved"
          count={loops.length}
        >
          {loops.length === 0 ? (
            <Empty>No loops to resolve.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {loops.map((l, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 rounded-md border bg-white px-3 py-2 text-sm"
                >
                  <span>{l.topic}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {l.turns_to_resolve} turn{l.turns_to_resolve === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Disclosure>

        <Disclosure
          icon={<HelpCircle className="h-4 w-4 text-[#0A2848]" />}
          title="Open questions"
          count={open.length}
        >
          {open.length === 0 ? (
            <Empty>No unresolved threads identified.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {open.map((q, i) => (
                <li
                  key={i}
                  className="rounded-md border bg-white px-3 py-2 text-sm"
                >
                  {q}
                </li>
              ))}
            </ul>
          )}
        </Disclosure>
      </div>
    </article>
  );
}

function Stat({ n, label, highlight }: { n: number; label: string; highlight?: boolean }) {
  return (
    <div className="bg-white/10 px-3 py-3 text-center backdrop-blur">
      <div className={`text-2xl font-semibold leading-none ${highlight ? "text-white" : "text-white/95"}`}>
        {n}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-wider text-white/70">{label}</div>
    </div>
  );
}

function Disclosure({
  icon,
  title,
  count,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-xl border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
        aria-expanded={open}
      >
        {icon}
        <span className="text-sm font-medium text-[#0A2848]">{title}</span>
        <span className="ml-1 rounded-full bg-muted px-1.5 text-[11px] font-medium text-muted-foreground">
          {count}
        </span>
        <ChevronDown
          className={`ml-auto h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="border-t bg-muted/20 p-3">{children}</div>}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs italic text-muted-foreground">{children}</p>;
}
