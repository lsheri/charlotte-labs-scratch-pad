import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getUserDetail,
  listUserThreadsForAdmin,
  listUserReceiptsForAdmin,
  revealUserIdentity,
  exportThreadsTxt,
  exportReceiptsTxt,
  exportThreadsJson,
  exportReceiptsJson,
  verifyAllAutoLabReceipts,
  exportBenchmarkRows,
  toggleTemplatePicker,
} from "@/serverfn/admin-data";
import { Switch } from "@/components/ui/switch";
import { listUserProfileHistory, countUserAdminDecisions } from "@/serverfn/admin-audit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Eye, EyeOff, Download, FileJson, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { posthog } from "@/lib/posthog";
import { anonymousLabel, getThreadDisplayName, getReceiptDisplayName, getWorkflowTypeLabel, getWorkflowTags, getWorkflowPurpose, PURPOSE_LABELS, safeFilename, getProvenance, isVerifiedLab, PROVENANCE_LABELS } from "@/lib/displayNames";
import { ProvenanceVial } from "@/components/provenance/ProvenanceVial";

export const Route = createFileRoute("/admin/users/$userId")({
  component: AdminUserDetail,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="space-y-3 p-6">
        <Link to="/admin/users" className="text-xs text-muted-foreground hover:underline">← Back to users</Link>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><AlertCircle className="h-4 w-4 text-destructive" />Couldn't load this user</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">{error?.message ?? "Unknown error"}</p>
            <Button size="sm" onClick={() => { router.invalidate(); reset(); }}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  },
  notFoundComponent: () => (
    <div className="p-6"><Link to="/admin/users" className="text-xs hover:underline">← Back</Link><p className="mt-2 text-sm text-muted-foreground">User not found.</p></div>
  ),
});

const PROFILE_DIMS = ["direction","delegation","discernment","development","ethics","efficiency","strategic_agency"] as const;
type Dim = (typeof PROFILE_DIMS)[number];
const DIM_SHORT: Record<Dim, string> = { direction: "Dir", delegation: "Del", discernment: "Disc", development: "Dev", ethics: "Eth", efficiency: "Eff", strategic_agency: "Str" };

function AdminUserDetail() {
  const { userId } = Route.useParams();
  const router = useRouter();
  const detailFn = useServerFn(getUserDetail);
  const threadsFn = useServerFn(listUserThreadsForAdmin);
  const receiptsFn = useServerFn(listUserReceiptsForAdmin);
  const revealFn = useServerFn(revealUserIdentity);
  const exportThreadsFn = useServerFn(exportThreadsTxt);
  const exportReceiptsFn = useServerFn(exportReceiptsTxt);
  const expThreadsJson = useServerFn(exportThreadsJson);
  const expReceiptsJson = useServerFn(exportReceiptsJson);
  const historyFn = useServerFn(listUserProfileHistory);
  const decisionsCountFn = useServerFn(countUserAdminDecisions);
  const verifyAllFn = useServerFn(verifyAllAutoLabReceipts);
  const exportBenchmarkFn = useServerFn(exportBenchmarkRows);
  const toggleTemplatePickerFn = useServerFn(toggleTemplatePicker);

  const [detail, setDetail] = useState<any>(null);
  const [detailErr, setDetailErr] = useState<string | null>(null);
  const [threads, setThreads] = useState<any[]>([]);
  const [threadsErr, setThreadsErr] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [receiptsErr, setReceiptsErr] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [decisionsCount, setDecisionsCount] = useState<number>(0);
  const [identity, setIdentity] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selThreads, setSelThreads] = useState<Set<string>>(new Set());
  const [selReceipts, setSelReceipts] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const settle = async <T,>(p: Promise<T>): Promise<{ ok: true; v: T } | { ok: false; e: string }> => {
        try { return { ok: true, v: await p }; } catch (e: any) { return { ok: false, e: e?.message ?? "Failed" }; }
      };
      const [d, t, r, id, h, dc] = await Promise.all([
        settle(detailFn({ data: { userId } })),
        settle(threadsFn({ data: { userId } })),
        settle(receiptsFn({ data: { userId } })),
        settle(revealFn({ data: { userId } })),
        settle(historyFn({ data: { userId } })),
        settle(decisionsCountFn({ data: { userId } })),
      ]);
      if (cancelled) return;
      if (d.ok) setDetail(d.v); else setDetailErr(d.e);
      if (t.ok) setThreads((t.v as any).threads ?? []); else setThreadsErr(t.e);
      if (r.ok) setReceipts((r.v as any).receipts ?? []); else setReceiptsErr(r.e);
      if (id.ok && id.v) { setIdentity(id.v); posthog.capture("admin_identity_revealed", { target_user_id: userId, auto: true }); }
      if (h.ok) setHistory((h.v as any).history ?? []);
      if (dc.ok) setDecisionsCount((dc.v as any).count ?? 0);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // Map receipt_id -> per-dim deltas vs prior history snapshot.
  const receiptDeltas = useMemo(() => {
    const sorted = [...history].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    const map: Record<string, Partial<Record<Dim, number>>> = {};
    for (let i = 0; i < sorted.length; i++) {
      const cur = sorted[i];
      const prev = sorted[i - 1];
      if (!cur.receipt_id) continue;
      const deltas: Partial<Record<Dim, number>> = {};
      for (const dim of PROFILE_DIMS) {
        const c = cur[`${dim}_score_profile`];
        const p = prev?.[`${dim}_score_profile`] ?? 3.0;
        if (typeof c === "number") deltas[dim] = c - p;
      }
      map[cur.receipt_id] = deltas;
    }
    return map;
  }, [history]);

  const toggleReveal = async () => {
    if (identity) {
      posthog.capture("admin_identity_hidden", { target_user_id: userId });
      setIdentity(null);
      return;
    }
    try {
      setIdentity(await revealFn({ data: { userId } }));
      posthog.capture("admin_identity_revealed", { target_user_id: userId });
    }
    catch (e: any) { toast.error(e.message); }
  };

  const downloadFiles = async (files: { filename: string; content: string }[], zipName: string) => {
    if (files.length === 0) { toast.error("Nothing to export"); return; }
    if (files.length === 1) {
      const blob = new Blob([files[0].content], { type: "text/plain" });
      triggerDownload(blob, files[0].filename);
      return;
    }
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    files.forEach((f) => zip.file(f.filename, f.content));
    const blob = await zip.generateAsync({ type: "blob" });
    triggerDownload(blob, zipName);
  };

  const triggerDownload = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportThreads = async (ids: string[]) => {
    if (ids.length === 0) return;
    setExporting(true);
    posthog.capture("admin_export_started", { kind: "threads", format: "txt", count: ids.length, scope: ids.length === threads.length ? "all" : "selected", target_user_id: userId });
    try {
      const { files } = await exportThreadsFn({ data: { threadIds: ids } }) as any;
      const stamp = format(new Date(), "yyyyMMdd-HHmm");
      await downloadFiles(files, `threads_${safeFilename(anonymousLabel(userId))}_${stamp}.zip`);
      posthog.capture("admin_export_completed", { kind: "threads", format: "txt", count: ids.length, target_user_id: userId });
    } catch (e: any) { posthog.capture("admin_export_failed", { kind: "threads", format: "txt", error: e?.message }); toast.error(e.message); }
    finally { setExporting(false); }
  };

  const exportReceipts = async (ids: string[]) => {
    if (ids.length === 0) return;
    setExporting(true);
    posthog.capture("admin_export_started", { kind: "receipts", format: "txt", count: ids.length, scope: ids.length === receipts.length ? "all" : "selected", target_user_id: userId });
    try {
      const { files } = await exportReceiptsFn({ data: { receiptIds: ids } }) as any;
      const stamp = format(new Date(), "yyyyMMdd-HHmm");
      await downloadFiles(files, `receipts_${safeFilename(anonymousLabel(userId))}_${stamp}.zip`);
      posthog.capture("admin_export_completed", { kind: "receipts", format: "txt", count: ids.length, target_user_id: userId });
    } catch (e: any) { posthog.capture("admin_export_failed", { kind: "receipts", format: "txt", error: e?.message }); toast.error(e.message); }
    finally { setExporting(false); }
  };

  const exportThreadsAsJson = async (ids: string[]) => {
    if (ids.length === 0) return;
    setExporting(true);
    posthog.capture("admin_export_started", { kind: "threads", format: "json", count: ids.length, scope: ids.length === threads.length ? "all" : "selected", target_user_id: userId });
    try {
      const { json } = await expThreadsJson({ data: { threadIds: ids } }) as any;
      const stamp = format(new Date(), "yyyyMMdd-HHmm");
      triggerDownload(new Blob([json], { type: "application/json" }), `threads_${safeFilename(anonymousLabel(userId))}_${stamp}.json`);
      posthog.capture("admin_export_completed", { kind: "threads", format: "json", count: ids.length, target_user_id: userId });
    } catch (e: any) { posthog.capture("admin_export_failed", { kind: "threads", format: "json", error: e?.message }); toast.error(e.message); }
    finally { setExporting(false); }
  };

  const exportReceiptsAsJson = async (ids: string[]) => {
    if (ids.length === 0) return;
    setExporting(true);
    posthog.capture("admin_export_started", { kind: "receipts", format: "json", count: ids.length, scope: ids.length === receipts.length ? "all" : "selected", target_user_id: userId });
    try {
      const { json } = await expReceiptsJson({ data: { receiptIds: ids } }) as any;
      const stamp = format(new Date(), "yyyyMMdd-HHmm");
      triggerDownload(new Blob([json], { type: "application/json" }), `receipts_${safeFilename(anonymousLabel(userId))}_${stamp}.json`);
      posthog.capture("admin_export_completed", { kind: "receipts", format: "json", count: ids.length, target_user_id: userId });
    } catch (e: any) { posthog.capture("admin_export_failed", { kind: "receipts", format: "json", error: e?.message }); toast.error(e.message); }
    finally { setExporting(false); }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!detail) {
    return (
      <div className="space-y-3">
        <Link to="/admin/users" className="text-xs text-muted-foreground hover:underline">← Back to users</Link>
        <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertCircle className="h-4 w-4 text-destructive" />Couldn't load user header</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">{detailErr ?? "User not found."}</CardContent></Card>
      </div>
    );
  }

  const headerName = identity?.display_name || identity?.email || anonymousLabel(userId);

  // Build chronological activity feed from threads, receipts, and session joins
  const activity = (() => {
    type Item = { ts: string; kind: "thread" | "receipt" | "session_join" | "session_withdraw"; label: string; sub?: string; href?: { to: string; params: any } };
    const items: Item[] = [];
    for (const t of threads) {
      items.push({
        ts: t.last_captured_at,
        kind: "thread",
        label: getThreadDisplayName(t),
        sub: `${t.tool} · ${t.turn_count} msgs`,
        href: { to: "/admin/threads/$threadId", params: { threadId: t.id } },
      });
    }
    for (const r of receipts) {
      items.push({
        ts: r.created_at,
        kind: "receipt",
        label: getReceiptDisplayName(r),
        sub: `${r.tool_used} · ${getWorkflowTypeLabel(r)}`,
        href: { to: "/admin/receipts/$receiptId", params: { receiptId: r.id } },
      });
    }
    for (const m of (detail.sessions ?? []) as any[]) {
      if (m.joined_at) items.push({ ts: m.joined_at, kind: "session_join", label: `Joined ${m.session?.name ?? "session"}`, sub: m.session?.status });
      if (m.withdrawn_at) items.push({ ts: m.withdrawn_at, kind: "session_withdraw", label: `Withdrew from ${m.session?.name ?? "session"}` });
    }
    items.sort((a, b) => +new Date(b.ts) - +new Date(a.ts));
    return items;
  })();

  return (
    <div className="space-y-4">
      <Link to="/admin/users" className="text-xs text-muted-foreground hover:underline">← Back to users</Link>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="text-xl">{headerName}</CardTitle>
            {identity?.email && (
              <p className="text-sm text-muted-foreground">
                {identity.email}{identity.organization ? ` · ${identity.organization}` : ""}
              </p>
            )}
            <p className="text-xs text-muted-foreground font-mono mt-1">{userId}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {(detail.roles ?? []).map((r: string) => (
                <Badge key={r} variant={r === "admin" ? "default" : "secondary"}>{r}</Badge>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2 items-end">
            <Button variant="outline" size="sm" onClick={toggleReveal}>
              {identity ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
              {identity ? "Hide identity" : "Reveal identity"}
            </Button>
            <Button
              variant="outline" size="sm"
              onClick={async () => {
                if (!confirm("Mark every Lab Work receipt for this participant as admin-verified? This is logged in the audit trail.")) return;
                try {
                  const r = await verifyAllFn({ data: { userId } });
                  toast.success(`Verified ${r.changed} receipt${r.changed === 1 ? "" : "s"} (scanned ${r.scanned}).`);
                  router.invalidate();
                } catch (e: any) { toast.error(e?.message ?? "Verify failed"); }
              }}
            >
              Verify all lab work
            </Button>
            <Button
              variant="outline" size="sm"
              onClick={async () => {
                try {
                  const r = await exportBenchmarkFn({ data: { goldTierOnly: false, sinceDays: 365, limit: 5000 } });
                  if (!r.rows.length) { toast.warning("No rows matched."); return; }
                  const headers = Object.keys(r.rows[0]);
                  const escape = (v: any) => {
                    if (v == null) return "";
                    const s = Array.isArray(v) ? v.join("|") : typeof v === "object" ? JSON.stringify(v) : String(v);
                    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
                  };
                  const csv = [headers.join(","), ...r.rows.map(row => headers.map(h => escape((row as any)[h])).join(","))].join("\n");
                  const blob = new Blob([csv], { type: "text/csv" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = `benchmark-${new Date().toISOString().slice(0,10)}.csv`;
                  a.click();
                  URL.revokeObjectURL(a.href);
                  toast.success(`Exported ${r.count} rows.`);
                } catch (e: any) { toast.error(e?.message ?? "Export failed"); }
              }}
            >
              <Download className="h-4 w-4 mr-1" />
              Export benchmark CSV
            </Button>
            <label className="flex items-center gap-2 text-xs text-muted-foreground border rounded-md px-2 py-1.5">
              <span>Template Picker (beta)</span>
              <Switch
                checked={!!detail?.templatePickerEnabled}
                onCheckedChange={async (checked) => {
                  try {
                    await toggleTemplatePickerFn({ data: { targetUserId: userId, enabled: checked } });
                    setDetail((d: any) => d ? { ...d, templatePickerEnabled: checked } : d);
                    toast.success(`Template picker ${checked ? "enabled" : "disabled"} for this user.`);
                  } catch (e: any) { toast.error(e?.message ?? "Failed to update"); }
                }}
              />
            </label>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <Stat label="Threads" value={detail.threadCount} />
          <Stat label="Workflows" value={detail.receiptCount} />
          <Stat label="Sessions" value={detail.sessions?.length ?? 0} />
          <Stat label="Active sessions" value={(detail.sessions ?? []).filter((s: any) => !s.withdrawn_at).length} />
        </CardContent>
      </Card>

      {decisionsCount > 0 && (
        <p className="text-xs text-muted-foreground">{decisionsCount} admin decision{decisionsCount === 1 ? "" : "s"} on this user's receipts.</p>
      )}

      <Tabs defaultValue="activity">
        <TabsList>
          <TabsTrigger value="activity">Activity ({activity.length})</TabsTrigger>
          <TabsTrigger value="threads">Threads ({threads.length})</TabsTrigger>
          <TabsTrigger value="receipts">Workflows ({receipts.length})</TabsTrigger>
          <TabsTrigger value="profile">Profile history ({history.length})</TabsTrigger>
          <TabsTrigger value="sessions">Sessions ({detail.sessions?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="activity">
          <Card>
            <CardHeader><CardTitle className="text-base">Chronological activity</CardTitle></CardHeader>
            <CardContent>
              {activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity yet.</p>
              ) : (
                <ol className="relative border-l border-border ml-2 space-y-3">
                  {activity.map((it, i) => (
                    <li key={i} className="ml-4">
                      <span className={`absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border border-background ${
                        it.kind === "thread" ? "bg-blue-500" :
                        it.kind === "receipt" ? "bg-emerald-500" :
                        it.kind === "session_join" ? "bg-amber-500" : "bg-muted-foreground"
                      }`} />
                      <div className="text-xs text-muted-foreground">{format(new Date(it.ts), "MMM d, yyyy · h:mm a")}</div>
                      <div className="text-sm">
                        <Badge variant="outline" className="mr-2 text-[10px] uppercase">
                          {it.kind === "thread" ? "thread" : it.kind === "receipt" ? "workflow" : it.kind === "session_join" ? "joined" : "withdrew"}
                        </Badge>
                        {it.href ? (
                          <Link to={it.href.to as any} params={it.href.params} className="hover:underline">{it.label}</Link>
                        ) : it.label}
                        {it.sub && <span className="text-muted-foreground"> — {it.sub}</span>}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="threads">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">{selThreads.size} selected</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" disabled={exporting || selThreads.size === 0} onClick={() => exportThreads(Array.from(selThreads))}>
                  <Download className="h-4 w-4 mr-1" />Selected TXT
                </Button>
                <Button variant="outline" size="sm" disabled={exporting || selThreads.size === 0} onClick={() => exportThreadsAsJson(Array.from(selThreads))}>
                  <FileJson className="h-4 w-4 mr-1" />Selected JSON
                </Button>
                <Button variant="default" size="sm" disabled={exporting || threads.length === 0} onClick={() => exportThreads(threads.map((t) => t.id))}>
                  <Download className="h-4 w-4 mr-1" />All TXT
                </Button>
                <Button variant="default" size="sm" disabled={exporting || threads.length === 0} onClick={() => exportThreadsAsJson(threads.map((t) => t.id))}>
                  <FileJson className="h-4 w-4 mr-1" />All JSON
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {threads.length === 0 ? <p className="text-sm text-muted-foreground">No threads.</p> : (
                <table className="w-full text-sm">
                  <tbody>
                    {threads.map((t) => (
                      <tr key={t.id} className="border-t hover:bg-muted/30">
                        <td className="py-2 pr-2 w-8">
                          <Checkbox checked={selThreads.has(t.id)}
                            onCheckedChange={(c) => setSelThreads((s) => {
                              const n = new Set(s); c ? n.add(t.id) : n.delete(t.id); return n;
                            })} />
                        </td>
                        <td className="py-2 pr-2 w-20"><Badge variant="outline">{t.tool}</Badge></td>
                        <td className="py-2 pr-2 max-w-md">
                          <Link to="/admin/threads/$threadId" params={{ threadId: t.id }} className="hover:underline">
                            {getThreadDisplayName(t)}
                          </Link>
                        </td>
                        <td className="py-2 pr-2 text-xs text-muted-foreground">{t.turn_count} msgs</td>
                        <td className="py-2 pr-2 text-xs text-muted-foreground">
                          {format(new Date(t.last_captured_at), "MMM d, h:mm a")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="receipts">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">{selReceipts.size} selected</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" disabled={exporting || selReceipts.size === 0} onClick={() => exportReceipts(Array.from(selReceipts))}>
                  <Download className="h-4 w-4 mr-1" />Selected TXT
                </Button>
                <Button variant="outline" size="sm" disabled={exporting || selReceipts.size === 0} onClick={() => exportReceiptsAsJson(Array.from(selReceipts))}>
                  <FileJson className="h-4 w-4 mr-1" />Selected JSON
                </Button>
                <Button variant="default" size="sm" disabled={exporting || receipts.length === 0} onClick={() => exportReceipts(receipts.map((r) => r.id))}>
                  <Download className="h-4 w-4 mr-1" />All TXT
                </Button>
                <Button variant="default" size="sm" disabled={exporting || receipts.length === 0} onClick={() => exportReceiptsAsJson(receipts.map((r) => r.id))}>
                  <FileJson className="h-4 w-4 mr-1" />All JSON
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {receipts.length === 0 ? <p className="text-sm text-muted-foreground">No receipts.</p> : (
                <table className="w-full text-sm">
                  <tbody>
                    {receipts.map((r) => (
                      <tr key={r.id} className="border-t hover:bg-muted/30">
                        <td className="py-2 pr-2 w-8">
                          <Checkbox checked={selReceipts.has(r.id)}
                            onCheckedChange={(c) => setSelReceipts((s) => {
                              const n = new Set(s); c ? n.add(r.id) : n.delete(r.id); return n;
                            })} />
                        </td>
                        <td className="py-2 pr-2 w-20"><Badge variant="outline">{r.tool_used}</Badge></td>
                        <td className="py-2 pr-2 max-w-md">
                          <div className="flex items-center gap-2">
                            <ProvenanceVial variant={getProvenance(r)} verified={isVerifiedLab(r)} size="sm" />
                            <Link to="/admin/receipts/$receiptId" params={{ receiptId: r.id }} className="hover:underline">
                              {getReceiptDisplayName(r)}
                            </Link>
                          </div>
                          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                            <Badge variant="outline" className="text-[10px]">{PROVENANCE_LABELS[getProvenance(r)]}{isVerifiedLab(r) ? " ✓" : ""}</Badge>
                            <Badge variant="secondary" className="text-[10px]">{getWorkflowTypeLabel(r)}</Badge>
                            {(() => { const p = getWorkflowPurpose(r); return p ? <Badge variant="outline" className="text-[10px]">{PURPOSE_LABELS[p]}</Badge> : null; })()}
                            {getWorkflowTags(r).map((t) => <span key={t} className="text-[10px] text-muted-foreground">#{t}</span>)}
                          </div>
                          {receiptDeltas[r.id] && (
                            <div className="flex items-center gap-1 mt-1 flex-wrap">
                              {PROFILE_DIMS.map((dim) => {
                                const v = receiptDeltas[r.id]?.[dim];
                                if (v === undefined || Math.abs(v) < 0.005) return null;
                                const pos = v > 0;
                                return (
                                  <span key={dim} className={`text-[10px] tabular-nums px-1 rounded ${pos ? "text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950" : "text-rose-700 bg-rose-50 dark:text-rose-300 dark:bg-rose-950"}`}>
                                    Δ{DIM_SHORT[dim]} {pos ? "+" : ""}{v.toFixed(2)}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </td>
                        <td className="py-2 pr-2 text-xs text-muted-foreground">
                          {format(new Date(r.created_at), "MMM d, h:mm a")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profile history</CardTitle>
              <p className="text-xs text-muted-foreground">Every post-receipt EMA snapshot, oldest → newest. Use this to verify the engine adapts.</p>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No history snapshots yet.</p>
              ) : (
                <div className="overflow-auto">
                  <table className="w-full text-xs tabular-nums">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="text-left py-1 pr-3">When</th>
                        <th className="text-left py-1 pr-3">Receipt</th>
                        {PROFILE_DIMS.map((d) => <th key={d} className="text-right py-1 pr-3">{DIM_SHORT[d]}</th>)}
                        <th className="text-right py-1 pr-3">N</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...history].reverse().map((h: any) => (
                        <tr key={h.id} className="border-t">
                          <td className="py-1 pr-3 text-muted-foreground">{format(new Date(h.created_at), "MMM d, HH:mm")}</td>
                          <td className="py-1 pr-3">
                            {h.receipt_id ? (
                              <Link to="/admin/receipts/$receiptId" params={{ receiptId: h.receipt_id }} className="hover:underline font-mono text-[10px]">
                                {h.receipt_id.slice(0, 8)}
                              </Link>
                            ) : "—"}
                          </td>
                          {PROFILE_DIMS.map((d) => {
                            const v = h[`${d}_score_profile`];
                            return <td key={d} className="text-right py-1 pr-3">{typeof v === "number" ? v.toFixed(2) : "—"}</td>;
                          })}
                          <td className="text-right py-1 pr-3 text-muted-foreground">{h.receipt_count_total ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sessions">
          <Card>
            <CardContent className="pt-4">
              {(detail.sessions ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No session memberships.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted-foreground">
                    <tr><th className="py-2 pr-4">Session</th><th className="py-2 pr-4">Status</th><th className="py-2 pr-4">Joined</th><th className="py-2 pr-4">Withdrawn</th></tr>
                  </thead>
                  <tbody>
                    {detail.sessions.map((m: any) => (
                      <tr key={m.session_id} className="border-t">
                        <td className="py-2 pr-4">{m.session?.name ?? m.session_id.slice(0, 8)}</td>
                        <td className="py-2 pr-4"><Badge variant="secondary">{m.session?.status ?? "—"}</Badge></td>
                        <td className="py-2 pr-4 text-muted-foreground">{m.joined_at ? format(new Date(m.joined_at), "MMM d, yyyy") : "—"}</td>
                        <td className="py-2 pr-4 text-muted-foreground">{m.withdrawn_at ? format(new Date(m.withdrawn_at), "MMM d, yyyy") : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
