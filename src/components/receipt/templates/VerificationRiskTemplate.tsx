import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Circle,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  runStudyTemplate,
  getStudyAnalysis,
  listChecklistItems,
  setChecklistItem,
} from "@/serverfn/study-analyses";

interface Props {
  receiptId: string;
}

type ChecklistStatus = "open" | "verified" | "dismissed";

interface UnverifiedClaim {
  item_key: string;
  title: string;
  quote: string;
  turn_index: number | null;
  why_risky: string;
  suggested_source: string;
}
interface RiskItem {
  item_key: string;
  title: string;
  kind: string;
  quote: string;
  turn_index: number | null;
  severity: "low" | "medium" | "high";
  explanation: string;
}

const SEV_STYLES: Record<
  "low" | "medium" | "high",
  { chip: string; label: string }
> = {
  low: { chip: "bg-emerald-50 text-emerald-800 border-emerald-200", label: "Low" },
  medium: { chip: "bg-amber-50 text-amber-800 border-amber-200", label: "Medium" },
  high: { chip: "bg-red-50 text-red-800 border-red-200", label: "High" },
};

export function VerificationRiskTemplate({ receiptId }: Props) {
  const qc = useQueryClient();
  const fetchAnalysis = useServerFn(getStudyAnalysis);
  const fetchChecklist = useServerFn(listChecklistItems);
  const runAnalyzer = useServerFn(runStudyTemplate);
  const updateItem = useServerFn(setChecklistItem);

  const analysisQuery = useQuery({
    queryKey: ["study-analysis", receiptId, "verification_risk"],
    queryFn: () =>
      fetchAnalysis({ data: { receiptId, templateKey: "verification_risk" } }),
  });

  const checklistQuery = useQuery({
    queryKey: ["checklist", receiptId, "verification_risk"],
    queryFn: () => fetchChecklist({ data: { receiptId } }),
  });

  const runMutation = useMutation({
    mutationFn: (force: boolean) =>
      runAnalyzer({
        data: { receiptId, templateKey: "verification_risk", force },
      }),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["study-analysis", receiptId, "verification_risk"],
      }),
  });

  const setStatus = useMutation({
    mutationFn: (v: { itemKey: string; status: ChecklistStatus }) =>
      updateItem({
        data: {
          receiptId,
          templateKey: "verification_risk",
          itemKey: v.itemKey,
          status: v.status,
        },
      }),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["checklist", receiptId, "verification_risk"],
      }),
  });

  const row = analysisQuery.data?.row;
  const analysis = (row?.analysis_json ?? null) as {
    summary?: string;
    unverified_claims?: UnverifiedClaim[];
    risk_items?: RiskItem[];
    null_reason?: string | null;
  } | null;
  const statusByKey = new Map<string, ChecklistStatus>();
  for (const it of (checklistQuery.data?.items ?? []) as any[]) {
    statusByKey.set(it.item_key as string, it.status as ChecklistStatus);
  }
  const stateFor = (k: string): ChecklistStatus =>
    statusByKey.get(k) ?? "open";

  if (analysisQuery.isLoading || checklistQuery.isLoading) {
    return (
      <div className="rounded-xl border bg-card p-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading verification analysis…
      </div>
    );
  }

  if (!row || row.status === "error") {
    return (
      <div className="rounded-xl border bg-card p-6 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-[#0A2848]" />
          <h3 className="text-base font-semibold text-[#0A2848]">
            Verification &amp; Informational Risk
          </h3>
        </div>
        <p className="text-sm text-muted-foreground">
          {row?.error_message
            ? `Last run: ${row.error_message}`
            : "No verification check has run for this receipt yet."}
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
            "Run verification check"
          )}
        </Button>
      </div>
    );
  }

  const claims = analysis?.unverified_claims ?? [];
  const risks = analysis?.risk_items ?? [];
  const totalOpen =
    claims.filter((c) => stateFor(c.item_key) === "open").length +
    risks.filter((r) => stateFor(r.item_key) === "open").length;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-gradient-to-br from-[#0A2848] to-[#123a66] p-5 text-white">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-white/15 p-2">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold tracking-tight">
              Verification &amp; Informational Risk
            </h2>
            <p className="text-sm text-white/80 mt-0.5">
              {analysis?.summary ||
                "Check any AI claims that could bite you on a test or in writing."}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge className="bg-white/15 text-white border-white/20">
                {claims.length} claim{claims.length === 1 ? "" : "s"} to verify
              </Badge>
              <Badge className="bg-amber-400/20 text-amber-100 border-amber-300/40">
                {risks.length} risk item{risks.length === 1 ? "" : "s"}
              </Badge>
              <Badge className="bg-white/15 text-white border-white/20">
                {totalOpen} open
              </Badge>
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

      <section className="rounded-xl border bg-card p-5">
        <h3 className="text-sm font-semibold text-[#0A2848] mb-1">
          Unverified claims
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Factual statements the AI made — check each one before you rely on it.
        </p>
        {claims.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No unverified factual claims flagged.
          </p>
        ) : (
          <ul className="space-y-3">
            {claims.map((c) => (
              <ChecklistCard
                key={c.item_key}
                title={c.title}
                subtitle={c.why_risky}
                quote={c.quote}
                footer={
                  c.suggested_source ? (
                    <div className="flex items-center gap-1 text-xs text-[#0A2848]">
                      <ExternalLink className="h-3 w-3" />
                      <span className="font-medium">Verify with:</span>{" "}
                      <span className="text-muted-foreground">
                        {c.suggested_source}
                      </span>
                    </div>
                  ) : null
                }
                status={stateFor(c.item_key)}
                onSetStatus={(s) =>
                  setStatus.mutate({ itemKey: c.item_key, status: s })
                }
              />
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h3 className="text-sm font-semibold text-[#0A2848] mb-1">
          Informational risk items
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Patterns that often signal hallucination — read these before quoting.
        </p>
        {risks.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No risk patterns flagged in this thread.
          </p>
        ) : (
          <ul className="space-y-3">
            {risks.map((r) => {
              const sev = SEV_STYLES[r.severity];
              return (
                <ChecklistCard
                  key={r.item_key}
                  title={r.title}
                  subtitle={r.explanation}
                  quote={r.quote}
                  chip={
                    <span
                      className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border ${sev.chip}`}
                    >
                      {sev.label} · {r.kind.replace(/_/g, " ")}
                    </span>
                  }
                  status={stateFor(r.item_key)}
                  onSetStatus={(s) =>
                    setStatus.mutate({ itemKey: r.item_key, status: s })
                  }
                />
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function ChecklistCard({
  title,
  subtitle,
  quote,
  chip,
  footer,
  status,
  onSetStatus,
}: {
  title: string;
  subtitle: string;
  quote: string;
  chip?: React.ReactNode;
  footer?: React.ReactNode;
  status: ChecklistStatus;
  onSetStatus: (s: ChecklistStatus) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const dim = status !== "open";
  return (
    <li
      className={`rounded-lg border bg-white p-3 transition ${
        dim ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <StatusIcon status={status} />
            <span className="font-medium text-sm text-[#0A2848]">{title}</span>
            {chip}
          </div>
          {subtitle && (
            <p className="mt-1 text-xs text-muted-foreground leading-snug">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {quote && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 block w-full text-left text-xs italic text-muted-foreground border-l-2 border-[#0A2848]/20 pl-2"
        >
          "{expanded ? quote : quote.slice(0, 160)}
          {!expanded && quote.length > 160 ? "…" : ""}"
        </button>
      )}
      {footer && <div className="mt-2">{footer}</div>}
      <div className="mt-3 flex items-center gap-2">
        <Button
          size="sm"
          variant={status === "verified" ? "default" : "outline"}
          className={
            status === "verified"
              ? "bg-emerald-600 hover:bg-emerald-700 text-white h-7 text-xs"
              : "h-7 text-xs"
          }
          onClick={() =>
            onSetStatus(status === "verified" ? "open" : "verified")
          }
        >
          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
          {status === "verified" ? "Verified" : "Mark verified"}
        </Button>
        <Button
          size="sm"
          variant={status === "dismissed" ? "default" : "ghost"}
          className={
            status === "dismissed"
              ? "bg-muted text-foreground h-7 text-xs"
              : "h-7 text-xs text-muted-foreground"
          }
          onClick={() =>
            onSetStatus(status === "dismissed" ? "open" : "dismissed")
          }
        >
          <XCircle className="h-3.5 w-3.5 mr-1" />
          {status === "dismissed" ? "Dismissed" : "Dismiss"}
        </Button>
      </div>
    </li>
  );
}

function StatusIcon({ status }: { status: ChecklistStatus }) {
  if (status === "verified")
    return <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />;
  if (status === "dismissed")
    return <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />;
  return <Circle className="h-4 w-4 text-[#0A2848]/60 shrink-0" />;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _iconRef = AlertTriangle;
