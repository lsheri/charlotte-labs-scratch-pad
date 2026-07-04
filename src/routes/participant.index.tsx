import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
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
import { formatDistanceToNow } from "date-fns";
import { Trash2, ShieldAlert, Target, MessageSquare, GraduationCap, ChevronRight } from "lucide-react";
import { ToolLogo } from "@/components/ToolLogo";
import { deleteMyData, createPersonalSession, getCaptureTarget } from "@/serverfn/participant";
import { listMyThreads } from "@/serverfn/threads";
import { sendEnrollmentConfirmation } from "@/serverfn/study-lifecycle";
import { getOpenVerificationItems, getRecentStudyGaps } from "@/serverfn/study-analyses";
import { OverallFluencyCard } from "@/components/participant/OverallFluencyCard";
import { WelcomeTourDialog } from "@/components/WelcomeTourDialog";

export const Route = createFileRoute("/participant/")({ component: ParticipantHome });

interface PendingSession { id: string; name: string; consent_text: string; status: string; }
interface CaptureTarget { sessionId: string; name: string; joinCode: string; status: string; isPersonal: boolean; }

const RISK_STYLES: Record<string, string> = {
  high: "bg-red-50 text-red-800 border-red-200",
  medium_high: "bg-orange-50 text-orange-800 border-orange-200",
  medium: "bg-amber-50 text-amber-800 border-amber-200",
  low: "bg-emerald-50 text-emerald-800 border-emerald-200",
};

function ParticipantHome() {
  const { user } = useAuth();
  const deleteFn = useServerFn(deleteMyData);
  const enrollFn = useServerFn(sendEnrollmentConfirmation);
  
  const personalFn = useServerFn(createPersonalSession);
  const targetFn = useServerFn(getCaptureTarget);
  const listThreadsFn = useServerFn(listMyThreads);
  const fetchVerification = useServerFn(getOpenVerificationItems);
  const fetchGaps = useServerFn(getRecentStudyGaps);

  const [target, setTarget] = useState<CaptureTarget | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingSession | null>(null);

  useEffect(() => {
    if (!user) return;
    targetFn().then((t: any) => setTarget(t?.target ?? null)).catch(() => {});
  }, [user]);

  const verificationQuery = useQuery({
    queryKey: ["home-verification", user?.id],
    queryFn: () => fetchVerification(),
    enabled: !!user,
    staleTime: 60_000,
  });

  const gapsQuery = useQuery({
    queryKey: ["home-gaps", user?.id],
    queryFn: () => fetchGaps(),
    enabled: !!user,
    staleTime: 60_000,
  });

  const threadsQuery = useQuery({
    queryKey: ["home-threads", user?.id],
    queryFn: () => listThreadsFn(),
    enabled: !!user,
    staleTime: 60_000,
  });

  const openItems = (verificationQuery.data?.items ?? []) as any[];
  const gapTopics = (gapsQuery.data?.topics ?? []) as any[];
  const recentThreads = ((threadsQuery.data as any)?.threads ?? []).slice(0, 5);

  const startPersonal = async () => {
    setBusy(true);
    try {
      await personalFn();
      toast.success("Personal log ready.");
      const t: any = await targetFn();
      setTarget(t?.target ?? null);
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
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
    if (existing?.consent_accepted_at) { toast.success(`Already joined "${s.name}"`); setJoinCode(""); return; }
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
    setPending(null); setJoinCode("");
    const t: any = await targetFn();
    setTarget(t?.target ?? null);
  };
  const handleDelete = async () => {
    setBusy(true);
    try {
      const r = await deleteFn();
      toast.success(`Deleted ${r.deleted.conversations} captures and ${r.deleted.receipts} receipts.`);
      verificationQuery.refetch();
      gapsQuery.refetch();
      threadsQuery.refetch();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
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
        <p className="text-sm text-muted-foreground">Your study coach for AI-assisted work.</p>
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

      {/* 1. Open Verification & Risk items */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-red-600" />
            Open Verification & Risk items
            {openItems.length > 0 && (
              <Badge variant="destructive" className="ml-1">{openItems.length}</Badge>
            )}
          </CardTitle>
          <CardDescription>Unchecked claims and risky AI outputs across your recent receipts.</CardDescription>
        </CardHeader>
        <CardContent>
          {verificationQuery.isLoading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : openItems.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nothing to verify right now. Nice.</p>
          ) : (
            <div className="space-y-1.5">
              {openItems.slice(0, 5).map((it, i) => (
                <Link
                  key={`${it.receiptId}:${it.itemKey}:${i}`}
                  to="/participant/receipts/$receiptId"
                  params={{ receiptId: it.receiptId }}
                  search={{ template: "verification_risk" }}
                  className="flex items-center gap-2 rounded-md border p-2 hover:bg-secondary/50 text-sm"
                >
                  <Badge variant="outline" className="text-[10px]">
                    {it.kind === "risk_item" ? "risk" : "claim"}
                  </Badge>
                  <span className="flex-1 truncate">{it.title}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              ))}
              {openItems.length > 5 && (
                <p className="text-[11px] text-muted-foreground pl-1">
                  +{openItems.length - 5} more across your receipts.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Study Gaps summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-amber-600" />
            Study Gaps
            {(gapsQuery.data?.highRiskCount ?? 0) > 0 && (
              <Badge variant="destructive" className="ml-1">
                {gapsQuery.data?.highRiskCount} high risk
              </Badge>
            )}
          </CardTitle>
          <CardDescription>Top topics you still need to practice without AI.</CardDescription>
        </CardHeader>
        <CardContent>
          {gapsQuery.isLoading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : gapTopics.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No study gaps analyzed yet. Generate a receipt with the "Study Gaps" template.
            </p>
          ) : (
            <div className="space-y-1.5">
              {gapTopics.slice(0, 5).map((t, i) => (
                <Link
                  key={i}
                  to="/participant/receipts/$receiptId"
                  params={{ receiptId: t.receiptId }}
                  search={{ template: "study_gaps" }}
                  className="flex items-center gap-2 rounded-md border p-2 hover:bg-secondary/50 text-sm"
                >
                  <Badge variant="outline" className={RISK_STYLES[t.risk] ?? ""}>
                    {t.risk.replace("_", " ")}
                  </Badge>
                  <span className="flex-1 truncate">{t.name}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. Academic Fluency snapshot */}
      <OverallFluencyCard />

      {/* 4. Recent threads */}
      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> Recent threads
            </CardTitle>
            <CardDescription>Your last five captured AI conversations.</CardDescription>
          </div>
          <Link to="/participant/threads" className="text-xs text-muted-foreground hover:text-foreground">
            View all →
          </Link>
        </CardHeader>
        <CardContent>
          {threadsQuery.isLoading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : recentThreads.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No threads yet. Install the extension or{" "}
              <Link to="/participant/threads/new" className="underline">add one manually</Link>.
            </p>
          ) : (
            <div className="space-y-1.5">
              {recentThreads.map((th: any) => (
                <Link
                  key={th.id}
                  to="/participant/threads/$threadId"
                  params={{ threadId: th.id }}
                  className="flex items-center gap-3 rounded-md border p-2 hover:bg-secondary/50 text-sm"
                >
                  <ToolLogo tool={th.tool} size={22} />
                  <span className="flex-1 truncate">{th.title || "Untitled chat"}</span>
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(th.last_captured_at), { addSuffix: true })}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base">Delete my data</CardTitle>
          <CardDescription>Permanently remove all receipts, captures, and tokens.</CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={busy}><Trash2 className="mr-1 h-4 w-4" />Delete all my data</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete everything?</AlertDialogTitle>
                <AlertDialogDescription>This removes all your captures, analyses, session memberships, and tokens. Account remains.</AlertDialogDescription>
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
