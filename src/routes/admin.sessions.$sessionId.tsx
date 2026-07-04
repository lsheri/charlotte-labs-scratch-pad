import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getSessionDetailForAdmin, exportThreadsTxt, exportReceiptsTxt, exportThreadsJson, exportReceiptsJson } from "@/serverfn/admin-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Loader2, Download, FileJson, FileText } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { anonymousLabel, getThreadDisplayName, getReceiptDisplayName, getWorkflowTypeLabel, getWorkflowType, safeFilename, getProvenance, PROVENANCE_LABELS } from "@/lib/displayNames";

export const Route = createFileRoute("/admin/sessions/$sessionId")({ component: AdminSessionDetail });

function AdminSessionDetail() {
  const { sessionId } = Route.useParams();
  const detailFn = useServerFn(getSessionDetailForAdmin);
  const expThreadsTxt = useServerFn(exportThreadsTxt);
  const expReceiptsTxt = useServerFn(exportReceiptsTxt);
  const expThreadsJson = useServerFn(exportThreadsJson);
  const expReceiptsJson = useServerFn(exportReceiptsJson);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [selT, setSelT] = useState<Set<string>>(new Set());
  const [selR, setSelR] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      setLoading(true);
      try { setData(await detailFn({ data: { sessionId } })); }
      catch (e: any) { toast.error(e.message); }
      finally { setLoading(false); }
    })();
  }, [sessionId]);

  const dl = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const stamp = () => format(new Date(), "yyyyMMdd-HHmm");
  const slug = data?.session ? safeFilename(data.session.name) : "session";

  const zipTxt = async (files: { filename: string; content: string }[], name: string) => {
    if (files.length === 0) return toast.error("Nothing to export");
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    files.forEach((f) => zip.file(f.filename, f.content));
    dl(await zip.generateAsync({ type: "blob" }), name);
  };

  const exportThreads = async (ids: string[], fmt: "txt" | "json") => {
    if (ids.length === 0) return toast.error("Nothing to export");
    setBusy(true);
    try {
      if (fmt === "txt") {
        const { files } = await expThreadsTxt({ data: { threadIds: ids } }) as any;
        await zipTxt(files, `threads_${slug}_${stamp()}.zip`);
      } else {
        const { json } = await expThreadsJson({ data: { threadIds: ids } }) as any;
        dl(new Blob([json], { type: "application/json" }), `threads_${slug}_${stamp()}.json`);
      }
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const exportReceipts = async (ids: string[], fmt: "txt" | "json") => {
    if (ids.length === 0) return toast.error("Nothing to export");
    setBusy(true);
    try {
      if (fmt === "txt") {
        const { files } = await expReceiptsTxt({ data: { receiptIds: ids } }) as any;
        await zipTxt(files, `receipts_${slug}_${stamp()}.zip`);
      } else {
        const { json } = await expReceiptsJson({ data: { receiptIds: ids } }) as any;
        dl(new Blob([json], { type: "application/json" }), `receipts_${slug}_${stamp()}.json`);
      }
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const filteredThreads = useMemo(() => {
    if (!data) return [];
    const n = q.trim().toLowerCase();
    return (data.threads as any[]).filter((t) =>
      !n || t.tool?.toLowerCase().includes(n) || getThreadDisplayName(t).toLowerCase().includes(n) || anonymousLabel(t.participant_id).toLowerCase().includes(n)
    );
  }, [data, q]);

  const filteredReceipts = useMemo(() => {
    if (!data) return [];
    const n = q.trim().toLowerCase();
    return (data.receipts as any[]).filter((r) =>
      !n || r.tool_used?.toLowerCase().includes(n) || getReceiptDisplayName(r).toLowerCase().includes(n) || getWorkflowTypeLabel(r).toLowerCase().includes(n) || anonymousLabel(r.participant_id).toLowerCase().includes(n)
    );
  }, [data, q]);

  const threadsByTool = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const t of filteredThreads) { const k = t.tool ?? "other"; (m.get(k) ?? m.set(k, []).get(k))!.push(t); }
    return Array.from(m.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [filteredThreads]);

  const receiptsByType = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const r of filteredReceipts) { const k = getWorkflowType(r); (m.get(k) ?? m.set(k, []).get(k))!.push(r); }
    return Array.from(m.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [filteredReceipts]);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!data) return <p className="text-sm text-muted-foreground">Session not found.</p>;

  const s = data.session;

  return (
    <div className="space-y-4">
      <Link to="/admin/sessions" className="text-xs text-muted-foreground hover:underline">← Back to sessions</Link>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{s.name}</CardTitle>
          <p className="text-xs text-muted-foreground">code <span className="font-mono">{s.join_code}</span> · status {s.status} · created {format(new Date(s.created_at), "MMM d, yyyy")}</p>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <Stat label="Participants" value={data.members.length} />
          <Stat label="Active" value={data.members.filter((m: any) => !m.withdrawn_at).length} />
          <Stat label="Threads" value={data.threads.length} />
          <Stat label="Receipts" value={data.receipts.length} />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => exportThreads(data.threads.map((t: any) => t.id), "txt")}>
            <FileText className="h-4 w-4 mr-1" />All threads (TXT)
          </Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => exportThreads(data.threads.map((t: any) => t.id), "json")}>
            <FileJson className="h-4 w-4 mr-1" />All threads (JSON)
          </Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => exportReceipts(data.receipts.map((r: any) => r.id), "txt")}>
            <FileText className="h-4 w-4 mr-1" />All receipts (TXT)
          </Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => exportReceipts(data.receipts.map((r: any) => r.id), "json")}>
            <FileJson className="h-4 w-4 mr-1" />All receipts (JSON)
          </Button>
        </div>
      </div>

      <Tabs defaultValue="threads">
        <TabsList>
          <TabsTrigger value="threads">Threads ({filteredThreads.length})</TabsTrigger>
          <TabsTrigger value="receipts">Receipts ({filteredReceipts.length})</TabsTrigger>
          <TabsTrigger value="participants">Participants ({data.members.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="threads" className="space-y-4">
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={busy || selT.size === 0} onClick={() => exportThreads(Array.from(selT), "txt")}>
              <Download className="h-4 w-4 mr-1" />Selected TXT ({selT.size})
            </Button>
            <Button size="sm" variant="outline" disabled={busy || selT.size === 0} onClick={() => exportThreads(Array.from(selT), "json")}>
              <Download className="h-4 w-4 mr-1" />Selected JSON ({selT.size})
            </Button>
          </div>
          {threadsByTool.map(([tool, list]) => (
            <Card key={tool}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base"><Badge variant="outline" className="mr-2">{tool}</Badge>{list.length} thread{list.length === 1 ? "" : "s"}</CardTitle>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => exportThreads(list.map((t) => t.id), "json")}>
                  <FileJson className="h-3 w-3 mr-1" />Export group
                </Button>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <tbody>
                    {list.map((t) => (
                      <tr key={t.id} className="border-t hover:bg-muted/30">
                        <td className="py-2 pr-2 w-8">
                          <Checkbox checked={selT.has(t.id)} onCheckedChange={(c) => setSelT((s) => { const n = new Set(s); c ? n.add(t.id) : n.delete(t.id); return n; })} />
                        </td>
                        <td className="py-2 pr-2 max-w-md">
                          <Link to="/admin/threads/$threadId" params={{ threadId: t.id }} className="hover:underline">{getThreadDisplayName(t)}</Link>
                        </td>
                        <td className="py-2 pr-2 font-mono text-xs text-muted-foreground">{anonymousLabel(t.participant_id)}</td>
                        <td className="py-2 pr-2 text-xs text-muted-foreground">{t.turn_count} msgs</td>
                        <td className="py-2 pr-2 text-xs text-muted-foreground">{format(new Date(t.last_captured_at), "MMM d, h:mm a")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="receipts" className="space-y-4">
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={busy || selR.size === 0} onClick={() => exportReceipts(Array.from(selR), "txt")}>
              <Download className="h-4 w-4 mr-1" />Selected TXT ({selR.size})
            </Button>
            <Button size="sm" variant="outline" disabled={busy || selR.size === 0} onClick={() => exportReceipts(Array.from(selR), "json")}>
              <Download className="h-4 w-4 mr-1" />Selected JSON ({selR.size})
            </Button>
          </div>
          {receiptsByType.map(([type, list]) => (
            <Card key={type}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base"><Badge variant="secondary" className="mr-2">{type}</Badge>{list.length} receipt{list.length === 1 ? "" : "s"}</CardTitle>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => exportReceipts(list.map((r) => r.id), "json")}>
                  <FileJson className="h-3 w-3 mr-1" />Export group
                </Button>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <tbody>
                    {list.map((r) => (
                      <tr key={r.id} className="border-t hover:bg-muted/30">
                        <td className="py-2 pr-2 w-8">
                          <Checkbox checked={selR.has(r.id)} onCheckedChange={(c) => setSelR((s) => { const n = new Set(s); c ? n.add(r.id) : n.delete(r.id); return n; })} />
                        </td>
                        <td className="py-2 pr-2 w-20"><Badge variant="outline">{r.tool_used}</Badge></td>
                        <td className="py-2 pr-2 max-w-md">
                          <Link to="/admin/receipts/$receiptId" params={{ receiptId: r.id }} className="hover:underline">{getReceiptDisplayName(r)}</Link>
                          <div className="text-[10px] text-muted-foreground mt-0.5">{PROVENANCE_LABELS[getProvenance(r)]}</div>
                        </td>
                        <td className="py-2 pr-2 font-mono text-xs text-muted-foreground">{anonymousLabel(r.participant_id)}</td>
                        <td className="py-2 pr-2 text-xs text-muted-foreground">{format(new Date(r.created_at), "MMM d, h:mm a")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="participants">
          <Card>
            <CardContent className="pt-4">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="py-2 pr-4">Participant</th><th className="py-2 pr-4">Joined</th><th className="py-2 pr-4">Consent</th><th className="py-2 pr-4">Withdrawn</th><th></th></tr>
                </thead>
                <tbody>
                  {data.members.map((m: any) => (
                    <tr key={m.participant_id} className="border-t">
                      <td className="py-2 pr-4 font-mono">{anonymousLabel(m.participant_id)}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{m.joined_at ? format(new Date(m.joined_at), "MMM d, yyyy") : "—"}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{m.consent_accepted_at ? "✓" : "—"}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{m.withdrawn_at ? format(new Date(m.withdrawn_at), "MMM d, yyyy") : "—"}</td>
                      <td className="py-2 pr-4"><Link to="/admin/users/$userId" params={{ userId: m.participant_id }} className="text-xs hover:underline">open</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
