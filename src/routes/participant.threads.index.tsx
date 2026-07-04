import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import {
  Trash2, FileText, MessageSquare, Upload, GraduationCap, ChevronDown,
  Plus, X, Sparkles,
} from "lucide-react";
import { ToolLogo } from "@/components/ToolLogo";
import { ThreadSummaryChip } from "@/components/conversation/ThreadSummaryChip";
import {
  listMyThreads, deleteThread, createReceiptFromThreads, getDailyWorkflowUsage,
} from "@/serverfn/threads";
import {
  listClassSidebar, listMyAssignmentMappings, mapThreadToAssignment,
  unmapThreadFromAssignment,
} from "@/serverfn/assignments";
import {
  NewReceiptDialog, type NewReceiptDialogValue,
} from "@/components/receipt/NewReceiptDialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuLabel, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import charlotteMascot from "@/assets/charlotte-mascot.png";
import { setPendingReceiptJob } from "@/lib/pendingReceiptJob";

export const Route = createFileRoute("/participant/threads/")({
  component: () => <ThreadsInbox />,
});

type SidebarClass = {
  id: string; name: string; courseCode: string | null;
  assignments: { id: string; code: string; title: string; dueAt: string | null }[];
};

export function ThreadsInbox({ classId }: { classId?: string } = {}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const listFn = useServerFn(listMyThreads);
  const delFn = useServerFn(deleteThread);
  const createFn = useServerFn(createReceiptFromThreads);
  const usageFn = useServerFn(getDailyWorkflowUsage);
  const classesFn = useServerFn(listClassSidebar);
  const mappingsFn = useServerFn(listMyAssignmentMappings);
  const mapFn = useServerFn(mapThreadToAssignment);
  const unmapFn = useServerFn(unmapThreadFromAssignment);
  

  const [threads, setThreads] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [splash, setSplash] = useState<"idle" | "starting">("idle");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [usage, setUsage] = useState({ used: 0, limit: 7, exempt: false });
  const [classes, setClasses] = useState<SidebarClass[]>([]);
  const [mappings, setMappings] = useState<{ assignment_id: string; thread_id: string }[]>([]);
  const [focusedAssignment, setFocusedAssignment] = useState<string | null>(null);
  const [assignmentSubmitTarget, setAssignmentSubmitTarget] = useState<string | null>(null);

  const loadThreads = async () => {
    setLoading(true);
    try { setThreads(((await listFn()) as any).threads ?? []); }
    catch { setThreads([]); }
    setLoading(false);
  };
  const loadMappings = async () => {
    try { setMappings(((await mappingsFn()) as any).mappings ?? []); }
    catch {}
  };
  useEffect(() => {
    if (!user) return;
    loadThreads();
    loadMappings();
    classesFn().then((r) => setClasses((r.classes ?? []) as any)).catch(() => {});
  }, [user]);
  useEffect(() => {
    if (!user) return;
    usageFn().then((r: any) => setUsage({ used: r.used ?? 0, limit: r.limit ?? 7, exempt: !!r.exempt })).catch(() => {});
  }, [user, dialogOpen]);

  const visibleClasses = useMemo(
    () => (classId ? classes.filter((c) => c.id === classId) : classes),
    [classes, classId],
  );
  const scopedClass = classId ? visibleClasses[0] ?? null : null;
  const allAssignments = useMemo(
    () => visibleClasses.flatMap((c) => c.assignments.map((a) => ({ ...a, classId: c.id, className: c.courseCode ?? c.name }))),
    [visibleClasses],
  );
  const assignmentById = useMemo(
    () => new Map(allAssignments.map((a) => [a.id, a])),
    [allAssignments],
  );
  const mappedThreadIdsByAssignment = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const row of mappings) {
      const arr = m.get(row.assignment_id) ?? [];
      arr.push(row.thread_id);
      m.set(row.assignment_id, arr);
    }
    return m;
  }, [mappings]);
  const assignmentIdsByThread = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const row of mappings) {
      const arr = m.get(row.thread_id) ?? [];
      arr.push(row.assignment_id);
      m.set(row.thread_id, arr);
    }
    return m;
  }, [mappings]);

  const focusedMappedThreadIds = focusedAssignment
    ? new Set(mappedThreadIdsByAssignment.get(focusedAssignment) ?? [])
    : null;
  const orderedThreads = useMemo(() => {
    if (!focusedMappedThreadIds) return threads;
    const mapped = threads.filter((t) => focusedMappedThreadIds.has(t.id));
    const rest = threads.filter((t) => !focusedMappedThreadIds.has(t.id));
    return [...mapped, ...rest];
  }, [threads, focusedMappedThreadIds]);

  const toggle = (id: string) =>
    setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () =>
    setSelected((p) => (p.size === threads.length ? new Set() : new Set(threads.map((t) => t.id))));

  const doMap = async (threadId: string, assignmentId: string) => {
    // optimistic
    setMappings((prev) => prev.some((m) => m.assignment_id === assignmentId && m.thread_id === threadId)
      ? prev : [...prev, { assignment_id: assignmentId, thread_id: threadId }]);
    try { await mapFn({ data: { threadId, assignmentId } }); }
    catch (e: any) { toast.error(e.message); loadMappings(); }
  };
  const doUnmap = async (threadId: string, assignmentId: string) => {
    setMappings((prev) => prev.filter((m) => !(m.assignment_id === assignmentId && m.thread_id === threadId)));
    try { await unmapFn({ data: { threadId, assignmentId } }); }
    catch (e: any) { toast.error(e.message); loadMappings(); }
  };

  const openDialog = (opts?: { assignmentId?: string; threadIds?: string[] }) => {
    if (opts?.assignmentId) {
      const ids = opts.threadIds ?? [];
      if (!ids.length) return;
      setSelected(new Set(ids));
      setAssignmentSubmitTarget(opts.assignmentId);
    } else {
      setAssignmentSubmitTarget(null);
      if (!selected.size) return;
    }
    setDialogOpen(true);
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
    if (!v.goal) toast.info("Tip: adding a goal makes your recommendations more personal.");
    const startedAt = Date.now();
    const { posthog } = await import("@/lib/posthog");
    posthog.capture("receipt_requested", {
      thread_count: selected.size, templates: v.templates, has_goal: !!v.goal,
      assignment_id: assignmentSubmitTarget ?? undefined,
    });
    try {
      const targetAssignmentId = assignmentSubmitTarget;
      const targetAssignmentCode = targetAssignmentId ? assignmentById.get(targetAssignmentId)?.code : null;
      const r = await createFn({
        data: {
          threadIds: Array.from(selected),
          label: v.name || (targetAssignmentCode ? `${targetAssignmentCode} — ${v.name ?? ""}`.trim() : undefined),
          goal: v.goal || undefined,
          workflowType: "study",
        },
      });
      const jobId = (r as any).jobId as string;
      const jobIds = ((r as any).jobIds ?? [jobId]) as string[];
      const splitCount = (r as any).splitCount as number | undefined;
      try {
        for (const id of jobIds) {
          localStorage.setItem(`receipt-templates:${id}`, JSON.stringify(v.templates));
          if (targetAssignmentId) {
            localStorage.setItem(`assignment-attach:${id}`, targetAssignmentId);
          }
        }
      } catch {}
      if (targetAssignmentCode) {
        toast.success(`Receipt queued for ${targetAssignmentCode} — it'll attach once ready.`);
      }
      setSelected(new Set());
      setAssignmentSubmitTarget(null);
      if (splitCount && splitCount > 1) {
        toast.success(`Split into ${splitCount} receipts (one per workspace).`);
        posthog.capture("receipt_split_cross_workspace", { split_count: splitCount });
      }
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, 3000 - elapsed);
      window.setTimeout(() => {
        setPendingReceiptJob({ jobId, startedAt: Date.now() });
        setSplash("idle"); setBusy(false);
        navigate({ to: "/participant/receipts" });
      }, remaining);
    } catch (e: any) {
      setSplash("idle"); setBusy(false);
      posthog.capture("receipt_request_failed", { error: e?.message ?? String(e) });
      toast.error(e.message);
    }
  };

  const remove = async (id: string, title: string) => {
    if (!confirm(`Delete thread "${title}"?`)) return;
    try { await delFn({ data: { threadId: id } }); toast.success("Deleted"); loadThreads(); loadMappings(); }
    catch (e: any) { toast.error(e.message); }
  };

  const hasClasses = classes.length > 0;
  const focused = focusedAssignment ? assignmentById.get(focusedAssignment) : null;
  const focusedMappedIds = focused ? (mappedThreadIdsByAssignment.get(focused.id) ?? []) : [];

  // Refs + geometry for the dashed navy connection lines
  const gridRef = useRef<HTMLDivElement | null>(null);
  const assignmentRefs = useRef<Map<string, HTMLElement>>(new Map());
  const threadRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [lines, setLines] = useState<{ id: string; d: string }[]>([]);

  useLayoutEffect(() => {
    const compute = () => {
      const grid = gridRef.current;
      if (!grid) return;
      const gb = grid.getBoundingClientRect();
      const next: { id: string; d: string }[] = [];
      for (const m of mappings) {
        const aEl = assignmentRefs.current.get(m.assignment_id);
        const tEl = threadRefs.current.get(m.thread_id);
        if (!aEl || !tEl) continue;
        const ab = aEl.getBoundingClientRect();
        const tb = tEl.getBoundingClientRect();
        const x1 = ab.right - gb.left;
        const y1 = ab.top + ab.height / 2 - gb.top;
        const x2 = tb.left - gb.left;
        const y2 = tb.top + tb.height / 2 - gb.top;
        const cx = (x1 + x2) / 2;
        next.push({
          id: `${m.assignment_id}:${m.thread_id}`,
          d: `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`,
        });
      }
      setLines(next);
    };
    compute();
    const ro = new ResizeObserver(compute);
    if (gridRef.current) ro.observe(gridRef.current);
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, [mappings, threads, classes, focusedAssignment]);

  return (
    <div className="space-y-6 relative">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <MessageSquare className="h-6 w-6" /> Threads
          </h1>
          <p className="text-sm text-muted-foreground">
            Captured AI conversations. Map them to assignments, or select and generate a standalone receipt.
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
          <Button size="sm" disabled={!selected.size || busy} onClick={() => openDialog()}>
            <FileText className="mr-1 h-4 w-4" /> Generate Receipt ({selected.size})
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : threads.length === 0 && !hasClasses ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No threads yet. Install the extension and start chatting — or{" "}
            <Link to="/participant/threads/new" className="text-primary underline">add a thread manually</Link>.
          </CardContent>
        </Card>
      ) : hasClasses ? (
        <div
          ref={gridRef}
          className="relative grid gap-6 lg:grid-cols-[360px_minmax(320px,1fr)_minmax(0,3fr)]"
        >
          {/* SVG overlay for dashed navy connection lines */}
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            style={{ zIndex: 1 }}
            aria-hidden
          >
            {lines.map((l) => (
              <path
                key={l.id}
                d={l.d}
                fill="none"
                stroke="#1e3a8a"
                strokeWidth={3}
                strokeDasharray="8 6"
                strokeLinecap="round"
              />
            ))}
          </svg>

          {/* Left column: Assignments */}
          <aside className="relative space-y-3" style={{ zIndex: 2 }}>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Assignments
            </h2>
            {classes.map((c) => (
              <div key={c.id} className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <GraduationCap className="h-3.5 w-3.5" />
                  {c.courseCode ?? c.name}
                </div>
                <div className="space-y-1">
                  {c.assignments.map((a) => {
                    const mappedIds = mappedThreadIdsByAssignment.get(a.id) ?? [];
                    const mappedCount = mappedIds.length;
                    const active = focusedAssignment === a.id;
                    return (
                      <div key={a.id} className="flex items-stretch gap-2">
                        <Button
                          size="sm"
                          variant="default"
                          disabled={!mappedCount || busy}
                          onClick={() => openDialog({ assignmentId: a.id, threadIds: mappedIds })}
                          className="h-auto shrink-0 gap-1 px-2 py-1 text-[11px]"
                          title={mappedCount ? "Generate receipt from mapped threads" : "Map threads first"}
                        >
                          <Sparkles className="h-3 w-3" />
                          Receipt
                        </Button>
                        <button
                          ref={(el) => {
                            if (el) assignmentRefs.current.set(a.id, el);
                            else assignmentRefs.current.delete(a.id);
                          }}
                          onClick={() => setFocusedAssignment(active ? null : a.id)}
                          className={`flex-1 min-w-0 text-left rounded-md border bg-background px-3 py-2 text-sm transition ${
                            active ? "border-primary bg-primary/5" : "hover:bg-accent"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium truncate">{a.code}</span>
                            <Badge variant={mappedCount > 0 ? "default" : "outline"} className="text-[10px]">
                              {mappedCount}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {a.title.replace(/^.*—\s*/, "")}
                          </div>
                          {a.dueAt && (
                            <div className="mt-0.5 text-[10px] text-muted-foreground">
                              Due {format(new Date(a.dueAt), "MMM d")}
                            </div>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </aside>

          {/* Center column: empty spacer for connection lines */}
          <div className="hidden lg:block" aria-hidden />

          {/* Right column: Threads */}
          <div className="relative space-y-2" style={{ zIndex: 2 }}>
            {threads.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  No threads yet.{" "}
                  <Link to="/participant/threads/new" className="text-primary underline">Add one manually</Link>.
                </CardContent>
              </Card>
            ) : (
              orderedThreads.map((th) => {
                const isMappedToFocused = focusedAssignment
                  ? (assignmentIdsByThread.get(th.id) ?? []).includes(focusedAssignment)
                  : false;
                const threadAssignments = assignmentIdsByThread.get(th.id) ?? [];
                return (
                  <Card
                    key={th.id}
                    ref={(el) => {
                      if (el) threadRefs.current.set(th.id, el as unknown as HTMLElement);
                      else threadRefs.current.delete(th.id);
                    }}
                    className={`bg-background ${selected.has(th.id) ? "border-primary" : ""} ${
                      isMappedToFocused ? "ring-1 ring-primary/40" : ""
                    }`}
                  >
                    <CardContent className="flex items-start gap-3 py-3">
                      <Checkbox className="mt-1" checked={selected.has(th.id)} onCheckedChange={() => toggle(th.id)} />
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
                          <Badge variant="outline" className="capitalize">{th.tool}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {th.turn_count} msg{th.turn_count === 1 ? "" : "s"} · updated{" "}
                            {formatDistanceToNow(new Date(th.last_captured_at), { addSuffix: true })}
                          </span>
                        </div>
                        <div className="mt-1.5 min-w-0">
                          <ThreadSummaryChip summary={th.summary} seed={th.id} />
                        </div>
                        {threadAssignments.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {threadAssignments.map((aid) => {
                              const a = assignmentById.get(aid);
                              if (!a) return null;
                              return (
                                <span
                                  key={aid}
                                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-medium"
                                  onClick={(e) => { e.preventDefault(); }}
                                >
                                  {a.code}
                                  <button
                                    aria-label={`Unmap ${a.code}`}
                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); doUnmap(th.id, aid); }}
                                    className="hover:text-destructive"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </Link>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-1">
                            <Plus className="h-3.5 w-3.5" /> Assign
                            <ChevronDown className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-64">
                          {classes.map((c) => (
                            <div key={c.id}>
                              <DropdownMenuLabel className="text-xs">
                                {c.courseCode ?? c.name}
                              </DropdownMenuLabel>
                              {c.assignments.map((a) => {
                                const mapped = (assignmentIdsByThread.get(th.id) ?? []).includes(a.id);
                                return (
                                  <DropdownMenuItem
                                    key={a.id}
                                    onSelect={(e) => {
                                      e.preventDefault();
                                      mapped ? doUnmap(th.id, a.id) : doMap(th.id, a.id);
                                    }}
                                    className="flex items-center gap-2"
                                  >
                                    <Checkbox checked={mapped} />
                                    <span className="font-medium">{a.code}</span>
                                    <span className="text-xs text-muted-foreground truncate">
                                      {a.title.replace(/^.*—\s*/, "")}
                                    </span>
                                  </DropdownMenuItem>
                                );
                              })}
                              <DropdownMenuSeparator />
                            </div>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button
                        variant="ghost" size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => remove(th.id, th.title || "Untitled")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-2">
          {threads.map((th) => (
            <Card key={th.id} className={selected.has(th.id) ? "border-primary" : ""}>
              <CardContent className="flex items-start gap-3 py-3">
                <Checkbox className="mt-1" checked={selected.has(th.id)} onCheckedChange={() => toggle(th.id)} />
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
                    <Badge variant="outline" className="capitalize">{th.tool}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {th.turn_count} msg{th.turn_count === 1 ? "" : "s"} · updated{" "}
                      {formatDistanceToNow(new Date(th.last_captured_at), { addSuffix: true })}
                    </span>
                  </div>
                  <div className="mt-1.5 min-w-0">
                    <ThreadSummaryChip summary={th.summary} seed={th.id} />
                  </div>
                </Link>
                <Button
                  variant="ghost" size="sm"
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
        onCancel={() => { setDialogOpen(false); setAssignmentSubmitTarget(null); }}
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
