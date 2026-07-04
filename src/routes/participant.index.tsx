import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { Trash2, Sparkles, Target, GraduationCap, MessageSquare, Receipt, Wrench } from "lucide-react";
import { ToolLogo } from "@/components/ToolLogo";
import { ToolCoverageRow } from "@/components/participant/ToolCoverageRow";
import { useQuery } from "@tanstack/react-query";
import { deleteMyData, createPersonalSession, getCaptureTarget } from "@/serverfn/participant";
import { listMyThreads } from "@/serverfn/threads";
import { sendEnrollmentConfirmation, withdrawFromStudy } from "@/serverfn/study-lifecycle";
import { getMyToolHistory } from "@/serverfn/fluency-profile";
import { OverallFluencyCard } from "@/components/participant/OverallFluencyCard";
import { WelcomeTourDialog } from "@/components/WelcomeTourDialog";

export const Route = createFileRoute("/participant/")({ component: ParticipantHome });

interface ReceiptRow { id: string; tool_used: string; prompt_preview: string | null; created_at: string; }
interface SessionRow { id: string; name: string; join_code: string; status: string; researcher_id: string; }
interface PendingSession { id: string; name: string; consent_text: string; status: string; }
interface CaptureTarget { sessionId: string; name: string; joinCode: string; status: string; isPersonal: boolean; }

function ParticipantHome() {
  const { user } = useAuth();
  const deleteFn = useServerFn(deleteMyData);
  const enrollFn = useServerFn(sendEnrollmentConfirmation);
  const withdrawFn = useServerFn(withdrawFromStudy);
  const personalFn = useServerFn(createPersonalSession);
  const targetFn = useServerFn(getCaptureTarget);
  const listThreadsFn = useServerFn(listMyThreads);

  const fetchToolHistory = useServerFn(getMyToolHistory);
  const { data: toolHistoryData } = useQuery({
    queryKey: ['tool-history', user?.id],
    queryFn: () => fetchToolHistory(),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [threadCount, setThreadCount] = useState(0);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [target, setTarget] = useState<CaptureTarget | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingSession | null>(null);

  const load = async () => {
    if (!user) return;
    const [{ data: r }, { data: m }, t, th] = await Promise.all([
      supabase.from("receipts").select("id, tool_used, prompt_preview, created_at")
        .eq("participant_id", user.id).order("created_at", { ascending: false }).limit(6),
      supabase.from("session_participants").select("session_id").eq("participant_id", user.id),
      targetFn().catch(() => ({ target: null })),
      listThreadsFn().catch(() => ({ threads: [] })),
    ]);
    setReceipts((r ?? []) as ReceiptRow[]);
    setTarget((t as any)?.target ?? null);
    setThreadCount(((th as any)?.threads ?? []).length);
    const ids = (m ?? []).map(x => x.session_id);
    if (ids.length) {
      const { data: s } = await supabase.from("research_sessions")
        .select("id, name, join_code, status, researcher_id").in("id", ids);
      setSessions((s ?? []) as SessionRow[]);
    } else setSessions([]);
  };
  useEffect(() => { load(); }, [user]);

  const startPersonal = async () => {
    setBusy(true);
    try { await personalFn(); toast.success("Personal log ready."); load(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  const lookup = async () => {
    if (!user || !joinCode.trim()) return;
    setBusy(true);
    const code = joinCode.trim().toUpperCase();
    const { data: s } = await supabase.from("research_sessions")
      .select("id, name, status, consent_text").eq("join_code", code).maybeSingle();
    setBusy(false);
    if (!s) { toast.error("Session not found"); return; }
    if (s.status === "closed") { toast.error("Session closed"); return; }
    const { data: existing } = await supabase.from("session_participants")
      .select("id, consent_accepted_at").eq("session_id", s.id).eq("participant_id", user.id).maybeSingle();
    if (existing?.consent_accepted_at) { toast.success(`Already joined "${s.name}"`); setJoinCode(""); load(); return; }
    setPending({ id: s.id, name: s.name, consent_text: s.consent_text, status: s.status });
  };
  const accept = async () => {
    if (!user || !pending) return;
    setBusy(true);
    const { error } = await supabase.from("session_participants").insert({
      session_id: pending.id, participant_id: user.id, consent_accepted_at: new Date().toISOString(),
    });
    setBusy(false);
    if (error && !/duplicate/i.test(error.message)) { toast.error(error.message); return; }
    toast.success(`Joined "${pending.name}"`);
    enrollFn({ data: { sessionId: pending.id } }).catch(() => {});
    setPending(null); setJoinCode(""); load();
  };
  const handleWithdraw = async (sessionId: string, name: string) => {
    if (!confirm(`Withdraw from "${name}"?`)) return;
    try { await withdrawFn({ data: { sessionId } }); toast.success(`Withdrew`); load(); }
    catch (e: any) { toast.error(e.message); }
  };
  const handleDelete = async () => {
    setBusy(true);
    try { const r = await deleteFn(); toast.success(`Deleted ${r.deleted.conversations} captures and ${r.deleted.receipts} receipts.`); load(); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  if (pending) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Consent — {pending.name}</CardTitle>
          <CardDescription>Please read and accept before joining.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-secondary/40 p-4 text-sm whitespace-pre-wrap">{pending.consent_text}</div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPending(null)} disabled={busy}>Cancel</Button>
            <Button onClick={accept} disabled={busy}>I consent and want to join</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  })();
  const name = user?.email?.split("@")[0] ?? "there";

  return (
    <div className="space-y-6">
      <WelcomeTourDialog userId={user?.id} />
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{greeting}, {name}.</h1>
        <p className="text-sm text-muted-foreground">AI Collaboration Portfolio · Powered by Charlotte Labs</p>
      </div>

      {/* Connect / target row */}
      {target ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-3">
              <Target className="h-5 w-5 text-accent" />
              <div>
                <div className="text-sm font-medium">
                  Captures land in <span className="font-semibold">{target.name}</span>
                  {target.isPersonal && <Badge variant="outline" className="ml-2">Personal</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">Code <code className="font-mono">{target.joinCode}</code></div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-3">
              <GraduationCap className="h-5 w-5 text-accent" />
              <div>
                <div className="text-sm font-medium">Connect to your class</div>
                <div className="text-xs text-muted-foreground">Enter a join code, or start a personal log.</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="JOIN CODE" maxLength={8} className="max-w-[160px] uppercase" />
              <Button size="sm" onClick={lookup} disabled={busy || !joinCode.trim()}>Continue</Button>
              <Button size="sm" variant="outline" onClick={startPersonal} disabled={busy}>Personal log</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Hero: overall fluency radar — the only thing only we can show */}
      <OverallFluencyCard />

      {/* Thin stat strip — counts support the chart, not vice versa */}
      <div className="grid gap-3 sm:grid-cols-3">
        <KPI label="Receipts" value={receipts.length} icon={Receipt} />
        <KPI label="Threads" value={threadCount} icon={MessageSquare} />
        <KPI label="Workspaces" value={sessions.length} icon={Wrench} />
      </div>

      {/* Tool Coverage */}
      <Card>
        <CardContent className="py-4">
          <ToolCoverageRow history={(toolHistoryData?.history ?? []) as any} />
        </CardContent>
      </Card>

      {/* Recent receipts */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent receipts</h2>
          <Link to="/participant/receipts" className="text-xs text-muted-foreground hover:text-foreground">View all →</Link>
        </div>
        {receipts.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
            No receipts yet. <Link to="/participant/threads" className="underline">Pick threads</Link> to generate one.
          </CardContent></Card>
        ) : (
          <div className="grid gap-2">
            {receipts.map(r => (
              <Link key={r.id} to="/participant/receipts/$receiptId" params={{ receiptId: r.id }}>
                <Card className="transition hover:border-primary/60 hover:bg-secondary/30">
                  <CardContent className="flex items-center gap-3 py-3">
                    <ToolLogo tool={r.tool_used} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium capitalize">{r.tool_used}</span>
                        <span className="text-xs text-muted-foreground">{format(new Date(r.created_at), "MMM d, yyyy")}</span>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{r.prompt_preview ?? "—"}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Workspaces */}
      {sessions.length > 0 && (
        <div>
          <h2 className="mb-2 text-lg font-semibold">Workspaces</h2>
          <div className="grid gap-2 md:grid-cols-2">
            {sessions.map(s => {
              const isPersonal = s.name === "My personal log" && s.researcher_id === user?.id;
              return (
                <Card key={s.id}>
                  <CardContent className="flex items-center justify-between gap-2 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{s.join_code} · {s.status}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      {isPersonal && <Badge variant="outline">Personal</Badge>}
                      <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-destructive"
                        onClick={() => handleWithdraw(s.id, s.name)} disabled={busy}>
                        {isPersonal ? "Delete" : "Withdraw"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base">Delete my data</CardTitle>
          <CardDescription>Permanently remove all receipts, captures, fluency analyses, and tokens.</CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={busy}><Trash2 className="mr-1 h-4 w-4" />Delete all my data</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete everything?</AlertDialogTitle>
                <AlertDialogDescription>This removes all your captures, fluency runs, session memberships, and tokens. Account remains.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>Yes, delete everything</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}

function KPI({ label, value, icon: Icon }: { label: string; value: number; icon: any; highlight?: boolean }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 py-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</div>
        </div>
        <Icon className="h-5 w-5 text-muted-foreground/60" />
      </CardContent>
    </Card>
  );
}
