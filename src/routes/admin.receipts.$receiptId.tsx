import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getReceiptWithFluency } from "@/serverfn/receipts";
import { setReceiptProvenance, getReceiptAuditData, generateReceiptAuditDoc, getAdminReceiptExtras } from "@/serverfn/admin-data";
import { getReceiptScoreImpact, listReceiptDecisions } from "@/serverfn/admin-audit";
import { analyzeReceipt } from "@/serverfn/fluency";
import { LiteracyReceipt } from "@/components/receipt/LiteracyReceipt";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronLeft, ShieldCheck, ShieldOff, Loader2, AlertTriangle, FileText, FlaskConical, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { posthog } from "@/lib/posthog";
import { ProvenanceVial } from "@/components/provenance/ProvenanceVial";
import {
  getProvenance, isVerifiedLab, getProvenanceSource,
  PROVENANCE_LABELS, PROVENANCE_SOURCE_LABELS,
} from "@/lib/displayNames";

export const Route = createFileRoute("/admin/receipts/$receiptId")({
  loader: ({ params }) => getReceiptWithFluency({ data: { receiptId: params.receiptId } }),
  component: AdminReceiptPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-6">
        <p className="text-sm text-destructive mb-3">{error.message}</p>
        <Button onClick={() => { router.invalidate(); reset(); }}>Retry</Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6 text-sm">Receipt not found.</div>,
});

function AdminReceiptPage() {
  const { receipt, run, turns, tools } = Route.useLoaderData();
  const router = useRouter();
  const setProv = useServerFn(setReceiptProvenance);
  const analyzeFn = useServerFn(analyzeReceipt);
  const auditDataFn = useServerFn(getReceiptAuditData);
  const extrasFn = useServerFn(getAdminReceiptExtras);
  const generateAuditFn = useServerFn(generateReceiptAuditDoc);
  const [busy, setBusy] = useState(false);
  const [engineOpen, setEngineOpen] = useState(false);
  const r = receipt as any;
  const provenance = getProvenance(r);
  const verified = isVerifiedLab(r);
  const psrc = getProvenanceSource(r);

  const audit = (run?.analysis_output_json as any) ?? null;
  const runMeta = run ? {
    transcript_hash: run.transcript_hash, created_at: run.created_at,
    input_type: run.input_type, subject_type: run.subject_type,
    receipt_profile: run.receipt_profile, tool_metadata: run.tool_metadata,
  } : undefined;

  const toggleVerify = async () => {
    setBusy(true);
    try {
      await setProv({ data: { receiptId: r.id, verified: !verified } });
      posthog.capture("admin_provenance_verified", {
        receipt_id: r.id,
        verified: !verified,
        prior_provenance: provenance,
      });
      toast.success(verified ? "Verification removed" : "Marked as verified Lab Work");
      router.invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  };

  const { data: auditData } = useQuery({
    queryKey: ["receipt-audit-data", r.id],
    queryFn: () => auditDataFn({ data: { receiptId: r.id } }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: extras } = useQuery({
    queryKey: ["admin-receipt-extras", r.id],
    queryFn: () => extrasFn({ data: { receiptId: r.id } }),
    staleTime: 60 * 1000,
  });

  const downloadAuditDoc = async () => {
    posthog.capture("admin_audit_doc_downloaded", { receipt_id: r.id });
    try {
      const result = await generateAuditFn({ data: { receiptId: r.id } }) as any;
      const blob = new Blob([result.content], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = result.filename; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) { toast.error(e?.message ?? "Failed to generate audit doc"); }
  };

  const signalRows: Array<{ label: string; value: any; suffix?: string }> = auditData?.constructSignals ? [
    { label: "Goal clarity avg", value: (auditData.constructSignals as any).c3_avg_goal_clarity },
    { label: "Format spec rate", value: (auditData.constructSignals as any).c3_format_spec_rate },
    { label: "Exemplar rate", value: (auditData.constructSignals as any).c3_exemplar_rate },
    { label: "Iteration rate", value: (auditData.constructSignals as any).c3_iteration_rate },
    { label: "Role directive rate", value: (auditData.constructSignals as any).c4_role_directive_rate },
    { label: "Collaboration terms", value: (auditData.constructSignals as any).c4_collaboration_term_count },
    { label: "Challenge rate", value: (auditData.constructSignals as any).c5_challenge_rate },
    { label: "Challenge count", value: (auditData.constructSignals as any).c5_challenge_count },
    { label: "Clarification rate", value: (auditData.constructSignals as any).c10_clarification_rate },
    { label: "Structure score avg", value: (auditData.constructSignals as any).c11_mean_structure_score, suffix: " / 5" },
    { label: "Synthesis rate", value: (auditData.constructSignals as any).c12_synthesis_rate },
    { label: "Attribution rate", value: (auditData.constructSignals as any).c14_attribution_rate },
    { label: "Meta-prompt rate", value: (auditData.constructSignals as any).c16_meta_rate },
    { label: "Meta-prompt count", value: (auditData.constructSignals as any).c16_meta_count },
  ] : [];

  return (
    <div className="space-y-4">
      <Link to="/admin/users/$userId" params={{ userId: r.participant_id }}>
        <Button variant="ghost" size="sm"><ChevronLeft className="h-4 w-4 mr-1" />Back to user</Button>
      </Link>

      <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/40 p-3">
        <div className="flex items-center gap-3">
          <ProvenanceVial variant={provenance} verified={verified} size="lg" />
          <div className="text-sm">
            <div className="font-medium">
              Provenance: {PROVENANCE_LABELS[provenance]}
              {verified && <span className="ml-1 text-emerald-700">· verified</span>}
            </div>
            <div className="text-xs text-muted-foreground">
              {psrc ? PROVENANCE_SOURCE_LABELS[psrc] : "No source recorded"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={downloadAuditDoc}>
            <FileText className="h-4 w-4 mr-1" />Audit doc
          </Button>
          <Button size="sm" variant={verified ? "outline" : "default"} disabled={busy} onClick={toggleVerify}>
            {verified ? <><ShieldOff className="h-4 w-4 mr-1" />Remove verification</> : <><ShieldCheck className="h-4 w-4 mr-1" />Verify as Lab Work</>}
          </Button>
        </div>
      </div>

      <Card>
        <Collapsible open={engineOpen} onOpenChange={setEngineOpen}>
          <CollapsibleTrigger asChild>
            <div className="flex cursor-pointer items-center justify-between gap-3 p-3 hover:bg-accent/30 transition-colors">
              <div className="flex items-center gap-2 text-sm">
                <FlaskConical className="h-4 w-4" />
                <span className="font-medium">Engine V1 Analysis Data</span>
                <span className="text-xs text-muted-foreground">(admin only)</span>
              </div>
              <ChevronDown className={`h-4 w-4 transition-transform ${engineOpen ? "rotate-180" : ""}`} />
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t p-4 space-y-5">
              {/* A. PIPELINE STATUS */}
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Pipeline status</div>
                <div className="space-y-1.5 text-sm">
                  <PipelineRow
                    color={auditData?.fluencyRun ? "green" : "red"}
                    label="Fluency analysis"
                    detail={auditData?.fluencyRun ? `Complete (${(auditData.fluencyRun as any).run_id?.slice(0, 8)}…)` : "Missing"}
                  />
                  <PipelineRow
                    color={auditData?.constructSignals ? "green" : "amber"}
                    label="Construct signals"
                    detail={auditData?.constructSignals ? "Complete" : "Not available (predates V1 or pipeline error)"}
                  />
                  <PipelineRow
                    color={(auditData?.promptFeatures?.length ?? 0) > 0 ? "green" : "amber"}
                    label="Prompt features"
                    detail={(auditData?.promptFeatures?.length ?? 0) > 0
                      ? `${auditData!.promptFeatures.length} prompts analyzed`
                      : "None found"}
                  />
                </div>
              </div>

              {/* B. CONSTRUCT SIGNALS */}
              {auditData?.constructSignals && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Construct signals</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                    {signalRows.map(s => (
                      <div key={s.label} className="flex items-baseline justify-between border-b border-dashed border-muted py-1">
                        <span className="text-muted-foreground">{s.label}</span>
                        <span className="font-mono tabular-nums">
                          {s.value === null || s.value === undefined ? "—" : `${typeof s.value === "number" ? s.value.toFixed(2) : s.value}${s.suffix ?? ""}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* C. CHAINS */}
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Chains</div>
                {(auditData?.chains?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">No chains detected.</p>
                ) : (
                  <table className="w-full text-sm border rounded-md overflow-hidden">
                    <thead className="bg-muted/40">
                      <tr className="text-left">
                        <th className="px-3 py-2 font-medium">Chain type</th>
                        <th className="px-3 py-2 font-medium text-right">Prompt count</th>
                        <th className="px-3 py-2 font-medium">Loop?</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditData!.chains.map((c: any, i: number) => {
                        const isLoop = c.chain_type === "loop";
                        return (
                          <tr key={i} className={`border-t ${isLoop ? "bg-amber-50" : ""}`}>
                            <td className="px-3 py-2 font-mono text-xs">{c.chain_type ?? "—"}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{c.prompt_count ?? "—"}</td>
                            <td className="px-3 py-2">{isLoop ? <span className="text-amber-700 font-medium">YES</span> : <span className="text-muted-foreground">no</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {!run && (
        <div className="rounded-md border border-yellow-300 bg-yellow-50 p-4 flex items-start justify-between gap-3">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-700 shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-medium text-yellow-900">Fluency analysis not available</div>
              <div className="text-yellow-800">Analysis may have failed or is still processing. You can trigger it manually.</div>
            </div>
          </div>
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await analyzeFn({ data: { receiptId: r.id } });
                toast.success("Analysis started — refresh in 30 seconds");
                router.invalidate();
              } catch (e: any) { toast.error(e?.message ?? "Failed"); }
              finally { setBusy(false); }
            }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Run analysis"}
          </Button>
        </div>
      )}

      <ScoreImpactPanel receiptId={r.id} />
      <DecisionsPanel receiptId={r.id} />

      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
        <span className="font-medium">Admin view</span> — showing the participant experience exactly. Engine V1 panel above is admin-only. Profile builds directionally over the participant's first few receipts.
      </div>

      <LiteracyReceipt
        receipt={r}
        audit={audit}
        runMeta={runMeta}
        turns={turns as any}
        tools={tools as any}
        profile={(extras as any)?.profile ?? null}
        recommendations={(extras as any)?.recommendations ?? null}
        showTranscript
        adminView
      />
    </div>
  );
}

function PipelineRow({ color, label, detail }: { color: "green" | "amber" | "red"; label: string; detail: string }) {
  const dot = color === "green" ? "bg-emerald-500" : color === "amber" ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      <span className="font-medium">{label}:</span>
      <span className="text-muted-foreground">{detail}</span>
    </div>
  );
}

function ScoreImpactPanel({ receiptId }: { receiptId: string }) {
  const fn = useServerFn(getReceiptScoreImpact);
  const { data, isLoading, error } = useQuery({
    queryKey: ["receipt-score-impact", receiptId],
    queryFn: () => fn({ data: { receiptId } }),
  });
  const [open, setOpen] = useState(false);
  return (
    <Card className="p-3">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-medium">
          <span>Score impact (engine audit)</span>
          <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> :
           error ? <p className="text-xs text-destructive">{(error as any)?.message}</p> :
           !data ? <p className="text-xs text-muted-foreground">No data.</p> : (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">
                Prior receipt count: {data.priorReceiptCount} (capped at {data.cappedPriorCount} for EMA){data.isReanalysis ? " · re-analysis" : ""}
              </div>
              <div className="overflow-auto">
                <table className="w-full text-xs tabular-nums">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-3">Dimension</th>
                      <th className="py-1 pr-3 text-right">Prior</th>
                      <th className="py-1 pr-3 text-right">Conf</th>
                      <th className="py-1 pr-3 text-right">Run</th>
                      <th className="py-1 pr-3">Basis</th>
                      <th className="py-1 pr-3 text-right">Ev wt</th>
                      <th className="py-1 pr-3 text-right">Prior wt</th>
                      <th className="py-1 pr-3 text-right">New</th>
                      <th className="py-1 pr-3 text-right">Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row: any) => (
                      <tr key={row.dimension} className="border-t">
                        <td className="py-1 pr-3 capitalize">{row.dimension.replace("_", " ")}</td>
                        <td className="py-1 pr-3 text-right">{row.priorScore?.toFixed(2) ?? "—"}</td>
                        <td className="py-1 pr-3 text-right">{row.priorConfidence?.toFixed(2) ?? "—"}</td>
                        <td className="py-1 pr-3 text-right">{row.runScore?.toFixed(2) ?? "—"}</td>
                        <td className="py-1 pr-3 text-muted-foreground">{row.evidenceBasis ?? "—"}</td>
                        <td className="py-1 pr-3 text-right">{row.evidenceWeight.toFixed(2)}</td>
                        <td className="py-1 pr-3 text-right">{row.priorWeight.toFixed(2)}</td>
                        <td className="py-1 pr-3 text-right font-medium">{row.storedNewScore?.toFixed(2) ?? "—"}</td>
                        <td className={`py-1 pr-3 text-right ${row.delta > 0 ? "text-emerald-600" : row.delta < 0 ? "text-rose-600" : "text-muted-foreground"}`}>
                          {row.delta === null ? "—" : `${row.delta > 0 ? "+" : ""}${row.delta.toFixed(2)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.rows.some((r: any) => r.formulaDriftNote) && (
                <p className="text-[10px] text-amber-700">⚠ Some rows show stored snapshot diverging from current EMA formula — engine version drift.</p>
              )}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function DecisionsPanel({ receiptId }: { receiptId: string }) {
  const fn = useServerFn(listReceiptDecisions);
  const { data } = useQuery({
    queryKey: ["receipt-decisions", receiptId],
    queryFn: () => fn({ data: { receiptId } }),
  });
  const decisions = (data as any)?.decisions ?? [];
  if (decisions.length === 0) return null;
  return (
    <Card className="p-3">
      <div className="text-sm font-medium mb-2">Admin decisions ({decisions.length})</div>
      <ul className="space-y-1 text-xs">
        {decisions.map((d: any) => (
          <li key={d.id} className="border-t pt-1">
            <span className="font-mono text-[10px] text-muted-foreground">{new Date(d.created_at).toLocaleString()}</span>
            <span className="ml-2 font-medium">{d.action}</span>
            <span className="ml-2 text-muted-foreground">by {String(d.admin_user_id).slice(0, 8)}</span>
            {d.note && <div className="text-muted-foreground">{d.note}</div>}
          </li>
        ))}
      </ul>
    </Card>
  );
}
