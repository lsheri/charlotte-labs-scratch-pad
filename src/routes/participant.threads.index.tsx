import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Trash2, FileText, MessageSquare, Upload } from "lucide-react";
import { ToolLogo } from "@/components/ToolLogo";
import { ThreadSummaryChip } from "@/components/conversation/ThreadSummaryChip";
import { format } from "date-fns";
import {
  listMyThreads,
  deleteThread,
  createReceiptFromThreads,
  getDailyWorkflowUsage,
} from "@/serverfn/threads";
import {
  NewReceiptDialog,
  type NewReceiptDialogValue,
} from "@/components/receipt/NewReceiptDialog";
import charlotteMascot from "@/assets/charlotte-mascot.png";
import { setPendingReceiptJob } from "@/lib/pendingReceiptJob";

export const Route = createFileRoute("/participant/threads/")({ component: ThreadsInbox });

function ThreadsInbox() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const listFn = useServerFn(listMyThreads);
  const delFn = useServerFn(deleteThread);
  const createFn = useServerFn(createReceiptFromThreads);
  const usageFn = useServerFn(getDailyWorkflowUsage);
  const [threads, setThreads] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [splash, setSplash] = useState<"idle" | "starting">("idle");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [usage, setUsage] = useState<{ used: number; limit: number; exempt: boolean }>({
    used: 0,
    limit: 7,
    exempt: false,
  });

  const load = async () => {
    setLoading(true);
    try {
      const r = await listFn();
      setThreads((r as any).threads ?? []);
    } catch {
      setThreads([]);
    }
    setLoading(false);
  };
  useEffect(() => {
    if (user) load();
  }, [user]);
  useEffect(() => {
    if (!user) return;
    usageFn()
      .then((r: any) => setUsage({ used: r.used ?? 0, limit: r.limit ?? 7, exempt: !!r.exempt }))
      .catch(() => {});
  }, [user, dialogOpen]);

  const toggle = (id: string) =>
    setSelected((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const toggleAll = () =>
    setSelected((p) => (p.size === threads.length ? new Set() : new Set(threads.map((t) => t.id))));

  const openDialog = () => {
    if (selected.size) setDialogOpen(true);
  };

  const inSession = Array.from(selected).some((id) => {
    const t = threads.find((x) => x.id === id);
    return Boolean((t as any)?.session_id);
  });

  const generate = async (v: NewReceiptDialogValue) => {
    if (!selected.size) return;
    setDialogOpen(false);
    setBusy(true);
    setSplash("starting");
    if (!v.goal) {
      toast.info("Tip: adding a goal makes your recommendations more personal.");
    }
    const startedAt = Date.now();
    const { posthog } = await import("@/lib/posthog");
    posthog.capture("receipt_requested", {
      thread_count: selected.size,
      workflow_type: v.workflowType,
      workflow_type_set: v.workflowTypeSet,
      workflow_type_extras: v.workflowTypeExtras,
      workflow_type_count: 1 + (v.workflowTypeExtras?.length ?? 0),
      workflow_type_custom: v.workflowTypeCustom ?? null,
      provenance: v.provenance,
      has_goal: !!v.goal,
      tag_count: (v.tags ?? []).length,
      save_as_template: !!v.saveAsTemplate,
    });
    try {
      const r = await createFn({
        data: {
          threadIds: Array.from(selected),
          label: v.name || undefined,
          goal: v.goal || undefined,
          workflowType: v.workflowType,
          workflowTypeSet: v.workflowTypeSet,
          workflowTypeExtras: v.workflowTypeExtras,
          workflowTypeCustom: v.workflowTypeCustom,
          purpose: v.purpose ?? undefined,
          tags: v.tags,
          saveAsTemplate: v.saveAsTemplate,
          provenance: v.provenance,
          provenanceUserOverride: v.provenanceUserOverride,
        },
      });
      const jobId = (r as any).jobId as string;
      const splitCount = (r as any).splitCount as number | undefined;
      setSelected(new Set());
      if (splitCount && splitCount > 1) {
        toast.success(
          `Split into ${splitCount} receipts (one per workspace) so research and personal work stay separate.`,
        );
        posthog.capture("receipt_split_cross_workspace", { split_count: splitCount });
      }
      // Hold the spider splash for at least 3s, then hand off to the receipts page.
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, 3000 - elapsed);
      window.setTimeout(() => {
        setPendingReceiptJob({ jobId, startedAt: Date.now() });
        setSplash("idle");
        setBusy(false);
        navigate({ to: "/participant/receipts" });
      }, remaining);
    } catch (e: any) {
      setSplash("idle");
      setBusy(false);
      posthog.capture("receipt_request_failed", { error: e?.message ?? String(e) });
      toast.error(e.message);
    }
  };

  const remove = async (id: string, title: string) => {
    if (!confirm(`Delete thread "${title}"?`)) return;
    try {
      await delFn({ data: { threadId: id } });
      toast.success("Deleted");
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-6 relative">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <MessageSquare className="h-6 w-6" /> Threads
          </h1>
          <p className="text-sm text-muted-foreground">
            Captured AI conversations. Select threads and generate a single receipt for analysis.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/participant/threads/new">
              <Upload className="mr-1 h-4 w-4" /> Add thread manually
            </Link>
          </Button>
          {threads.length > 0 && (
            <Button variant="ghost" size="sm" onClick={toggleAll}>
              {selected.size === threads.length ? "Clear" : "Select all"}
            </Button>
          )}
          <Button size="sm" disabled={!selected.size || busy} onClick={openDialog}>
            <FileText className="mr-1 h-4 w-4" /> Generate Receipt ({selected.size})
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : threads.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No threads yet. Install the extension and start chatting — or{" "}
            <Link to="/participant/threads/new" className="text-primary underline">
              add a thread manually
            </Link>
            .
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {threads.map((th) => (
            <Card key={th.id} className={selected.has(th.id) ? "border-primary" : ""}>
              <CardContent className="flex items-start gap-3 py-3">
                <Checkbox
                  className="mt-1"
                  checked={selected.has(th.id)}
                  onCheckedChange={() => toggle(th.id)}
                />
                <ToolLogo tool={th.tool} size={28} />
                <Link
                  to="/participant/threads/$threadId"
                  params={{ threadId: th.id }}
                  className="flex-1 min-w-0"
                  title={th.title || "Untitled chat"}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold">
                      {format(new Date(th.first_captured_at), "MMM d, yyyy · h:mm a")}
                    </span>
                    <Badge variant="outline" className="capitalize">
                      {th.tool}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {th.turn_count} message{th.turn_count === 1 ? "" : "s"} · updated{" "}
                      {formatDistanceToNow(new Date(th.last_captured_at), { addSuffix: true })}
                    </span>
                  </div>
                  <div className="mt-1.5 min-w-0">
                    <ThreadSummaryChip summary={th.summary} seed={th.id} />
                  </div>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => remove(th.id, th.title || "Untitled")}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <NewReceiptDialog
        open={dialogOpen}
        threadCount={selected.size}
        busy={busy}
        inSession={inSession}
        dailyUsed={usage.used}
        dailyLimit={usage.limit}
        dailyLimitExempt={usage.exempt}
        onCancel={() => setDialogOpen(false)}
        onSubmit={generate}
      />

      {splash === "starting" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <Card className="max-w-sm">
            <CardContent className="py-8 text-center space-y-4">
              <img
                src={charlotteMascot}
                alt="Charlotte"
                className="h-20 w-20 mx-auto animate-spin-slow"
                style={{ animation: "spin 2.4s linear infinite" }}
              />
              <div>
                <p className="font-semibold">Generating your receipt…</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Spinning up — we'll move this to the corner so you can keep working.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
