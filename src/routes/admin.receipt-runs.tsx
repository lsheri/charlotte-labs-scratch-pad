// Admin-only, READ-ONLY diagnostics for receipt runs.
// Shows the last 50 receipt_jobs (all statuses) plus the AI provider events
// (Gemini primary / OpenAI fallback) that fired during each run. No buttons,
// no retries, no writes — purely for troubleshooting. Cannot affect the
// generation pipeline.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2, ChevronDown, ChevronRight, AlertTriangle, CheckCircle2,
  ArrowRightLeft, Clock, ShieldAlert, Skull,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { anonymousLabel } from "@/lib/displayNames";
import { adminListReceiptRuns } from "@/serverfn/threads";

export const Route = createFileRoute("/admin/receipt-runs")({ component: ReceiptRunsPage });

interface ProviderEvent {
  id: string;
  created_at: string;
  label: string;
  provider: string;
  model: string | null;
  status: "ok" | "fallback" | "error" | "content_filter";
  http_status: number | null;
  latency_ms: number | null;
  error_message: string | null;
  receipt_id: string | null;
}

interface RunJob {
  id: string;
  status: string;
  stage: string | null;
  progress_label: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  label: string | null;
  attempts: number | null;
  retry_after: string | null;
  participant_id: string;
  receipt_id: string | null;
  workflow_type: string | null;
  thread_ids: string[] | null;
  bucket: string | null;
  chunks_total: number | null;
  chunks_done: number | null;
  recommendations_status: string | null;
  events: ProviderEvent[];
}

function statusBadge(s: string) {
  const map: Record<string, { variant: any; label: string; icon: any }> = {
    completed: { variant: "secondary", label: "completed", icon: CheckCircle2 },
    queued: { variant: "outline", label: "queued", icon: Clock },
    processing: { variant: "secondary", label: "processing", icon: Loader2 },
    building: { variant: "secondary", label: "building", icon: Loader2 },
    analyzing: { variant: "secondary", label: "analyzing", icon: Loader2 },
    rate_limited: { variant: "secondary", label: "rate-limited", icon: Clock },
    failed: { variant: "destructive", label: "failed", icon: AlertTriangle },
    dead_letter: { variant: "destructive", label: "dead", icon: Skull },
  };
  const cfg = map[s] ?? { variant: "outline", label: s, icon: ShieldAlert };
  const Icon = cfg.icon;
  const spin = ["processing", "building", "analyzing"].includes(s);
  return (
    <Badge variant={cfg.variant} className="capitalize">
      <Icon className={`mr-1 h-3 w-3 ${spin ? "animate-spin" : ""}`} />
      {cfg.label}
    </Badge>
  );
}

function providerEventBadge(e: ProviderEvent) {
  if (e.status === "ok") return <Badge variant="secondary"><CheckCircle2 className="mr-1 h-3 w-3" />ok</Badge>;
  if (e.status === "fallback") return <Badge><ArrowRightLeft className="mr-1 h-3 w-3" />fallback</Badge>;
  if (e.status === "content_filter") return <Badge variant="destructive">content filter</Badge>;
  return <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" />error</Badge>;
}

function ReceiptRunsPage() {
  const listFn = useServerFn(adminListReceiptRuns);
  const [jobs, setJobs] = useState<RunJob[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | "issues" | "completed">("all");

  const refresh = useCallback(async () => {
    try {
      const { jobs } = await listFn({});
      setJobs(jobs as RunJob[]);
    } catch (e) {
      console.error(e);
      setJobs([]);
    }
  }, [listFn]);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const issueStatuses = new Set(["failed", "dead_letter", "rate_limited"]);
  const filtered = (jobs ?? []).filter((j) => {
    if (filter === "issues") {
      return issueStatuses.has(j.status) || (j.events ?? []).some((e) => e.status !== "ok");
    }
    if (filter === "completed") return j.status === "completed";
    return true;
  });

  // Aggregate stats across the loaded window.
  const totalEvents = (jobs ?? []).reduce((n, j) => n + (j.events?.length ?? 0), 0);
  const fallbackCount = (jobs ?? []).reduce(
    (n, j) => n + (j.events?.filter((e) => e.status === "fallback").length ?? 0),
    0,
  );
  const errorCount = (jobs ?? []).reduce(
    (n, j) => n + (j.events?.filter((e) => e.status === "error" || e.status === "content_filter").length ?? 0),
    0,
  );

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Receipt run diagnostics</h1>
          <p className="text-sm text-muted-foreground">
            Read-only view of the last 50 receipt jobs and the AI provider events that fired
            during each run. Auto-refreshes every 15s. Nothing here affects generation.
          </p>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>All</Button>
          <Button size="sm" variant={filter === "issues" ? "default" : "outline"} onClick={() => setFilter("issues")}>Issues</Button>
          <Button size="sm" variant={filter === "completed" ? "default" : "outline"} onClick={() => setFilter("completed")}>Completed</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Runs loaded</div><div className="text-2xl font-semibold">{jobs?.length ?? "—"}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Provider events (24h)</div><div className="text-2xl font-semibold">{totalEvents}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Fallbacks to OpenAI</div><div className="text-2xl font-semibold">{fallbackCount}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Errors / filter</div><div className={`text-2xl font-semibold ${errorCount > 0 ? "text-destructive" : ""}`}>{errorCount}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Runs</CardTitle>
          <CardDescription>Click a run to see its AI provider event timeline.</CardDescription>
        </CardHeader>
        <CardContent>
          {jobs === null ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs match this filter.</p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((j) => {
                const isOpen = expanded.has(j.id);
                const evs = j.events ?? [];
                const hasIssue = issueStatuses.has(j.status) || evs.some((e) => e.status !== "ok");
                const durationMs = new Date(j.updated_at).getTime() - new Date(j.created_at).getTime();
                const durationLabel =
                  durationMs < 1000 ? `${durationMs}ms`
                  : durationMs < 60_000 ? `${(durationMs / 1000).toFixed(1)}s`
                  : `${Math.round(durationMs / 1000)}s`;
                return (
                  <li key={j.id} className={`rounded-md border ${hasIssue ? "border-destructive/40" : "border-border"} bg-background`}>
                    <button
                      className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-muted/40"
                      onClick={() => toggle(j.id)}
                    >
                      {isOpen ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium">{j.label || "Untitled run"}</span>
                          {statusBadge(j.status)}
                          {j.stage && j.stage !== j.status && (
                            <Badge variant="outline" className="capitalize text-[10px]">stage: {j.stage}</Badge>
                          )}
                          {j.workflow_type && (
                            <Badge variant="outline" className="text-[10px]">{j.workflow_type}</Badge>
                          )}
                          {(j.attempts ?? 0) > 1 && (
                            <Badge variant="secondary" className="text-[10px]">{j.attempts} attempts</Badge>
                          )}
                          <span className="text-xs text-muted-foreground">{anonymousLabel(j.participant_id)}</span>
                          <span className="text-xs text-muted-foreground">· {formatDistanceToNow(new Date(j.created_at), { addSuffix: true })}</span>
                          <span className="text-xs text-muted-foreground">· {durationLabel}</span>
                          <span className="text-xs text-muted-foreground">· {(j.thread_ids ?? []).length} thread{(j.thread_ids ?? []).length === 1 ? "" : "s"}</span>
                          {evs.length > 0 && (
                            <span className="text-xs text-muted-foreground">· {evs.length} AI event{evs.length === 1 ? "" : "s"}</span>
                          )}
                        </div>
                        {j.error && (
                          <p className="mt-1 line-clamp-2 text-xs text-destructive" title={j.error}>
                            {j.error}
                          </p>
                        )}
                        {!j.error && j.progress_label && (
                          <p className="mt-1 truncate text-xs text-muted-foreground">{j.progress_label}</p>
                        )}
                      </div>
                    </button>
                    {isOpen && (
                      <div className="space-y-3 border-t bg-muted/20 px-3 py-3 text-xs">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div>
                            <div className="text-muted-foreground">Job ID</div>
                            <div className="font-mono">{j.id}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Receipt ID</div>
                            <div className="font-mono">
                              {j.receipt_id ? (
                                <Link to="/admin/receipts/$receiptId" params={{ receiptId: j.receipt_id }} className="text-primary underline">
                                  {j.receipt_id}
                                </Link>
                              ) : "—"}
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Bucket / chunks</div>
                            <div>{j.bucket ?? "—"} · {j.chunks_done ?? 0}/{j.chunks_total ?? 0}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Recommendations</div>
                            <div className="capitalize">{j.recommendations_status ?? "—"}</div>
                          </div>
                        </div>

                        <div>
                          <div className="mb-1 font-medium text-foreground">AI provider event timeline</div>
                          {evs.length === 0 ? (
                            <p className="text-muted-foreground">
                              {j.receipt_id
                                ? "No provider events in the last 24h for this receipt. Either the run pre-dates the events table window, or no AI call has fired yet."
                                : "No receipt yet — run hasn't reached the AI step."}
                            </p>
                          ) : (
                            <ul className="space-y-1.5">
                              {evs.map((e) => (
                                <li key={e.id} className="flex items-start justify-between gap-3 rounded border bg-background px-2 py-1.5">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      {providerEventBadge(e)}
                                      <span className="font-mono text-[11px] text-muted-foreground">{e.label}</span>
                                      <span className="text-muted-foreground">·</span>
                                      <span className="text-muted-foreground">{e.provider}{e.model ? ` (${e.model})` : ""}</span>
                                      {e.http_status != null && (
                                        <span className="text-muted-foreground">· HTTP {e.http_status}</span>
                                      )}
                                    </div>
                                    {e.error_message && (
                                      <p className="mt-0.5 text-muted-foreground" title={e.error_message}>
                                        {e.error_message.length > 240 ? `${e.error_message.slice(0, 240)}…` : e.error_message}
                                      </p>
                                    )}
                                  </div>
                                  <div className="shrink-0 text-right text-muted-foreground">
                                    <div>{formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}</div>
                                    {e.latency_ms != null && <div>{e.latency_ms} ms</div>}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
