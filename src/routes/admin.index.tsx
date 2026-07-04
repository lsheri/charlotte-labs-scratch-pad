import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowRight, AlertTriangle } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { AdminReceiptJobsPanel } from "@/components/receipt/AdminReceiptJobsPanel";
import { AiProviderEventsPanel } from "@/components/admin/AiProviderEventsPanel";
import { getCronHeartbeat } from "@/serverfn/threads";

export const Route = createFileRoute("/admin/")({ component: AdminOverview });

interface Stats {
  users: number;
  admins: number;
  researchers: number;
  participants: number;
  sessionsActive: number;
  sessionsTotal: number;
  conversations24h: number;
  conversationsTotal: number;
  receipts: number;
  fluencyRuns: number;
  // health additions
  activeParticipants7d: number;
  receiptJobsInflight: number;
  receiptJobsRateLimited: number;
  receiptJobsFailed: number;
  receiptJobsDead: number;
  staleSessions: number;
  closingSoon: number;
  receiptsTotal: number;
  receiptsWithAnalysis: number;
}

interface RecentConv {
  id: string;
  tool: string;
  captured_at: string;
  participant_id: string;
  session_id: string;
  title: string | null;
}

interface EmailKpis { sent: number; failed: number; suppressed: number; bounced: number; total: number; deliveryRate: number }

function AdminOverview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<RecentConv[]>([]);
  const [emailKpis, setEmailKpis] = useState<EmailKpis | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const sevenAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const fourteenAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      const sevenAhead = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const now = new Date().toISOString();

      const [
        roles,
        sessionsAll,
        sessionsActive,
        convAll,
        conv24h,
        receiptsCt,
        fluencyCt,
        recentConv,
        emailLogs,
        active7d,
        receiptJobs,
        activeSessionsForStale,
        convsLast14,
        closingSoonRows,
        analyzedReceipts,
      ] = await Promise.all([
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("research_sessions").select("id", { count: "exact", head: true }),
        supabase.from("research_sessions").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("ai_conversations").select("id", { count: "exact", head: true }),
        supabase.from("ai_conversations").select("id", { count: "exact", head: true }).gte("captured_at", dayAgo),
        supabase.from("receipts").select("id", { count: "exact", head: true }),
        supabase.from("fluency_analysis_runs").select("run_id", { count: "exact", head: true }),
        supabase.from("ai_conversations").select("id, tool, captured_at, participant_id, session_id, title").order("captured_at", { ascending: false }).limit(20),
        supabase.from("email_send_log").select("message_id, status, created_at").gte("created_at", sevenAgo).order("created_at", { ascending: false }).limit(5000),
        supabase.from("ai_conversations").select("participant_id").gte("captured_at", sevenAgo),
        supabase.from("receipt_jobs").select("status"),
        supabase.from("research_sessions").select("id").eq("status", "active"),
        supabase.from("ai_conversations").select("session_id").gte("captured_at", fourteenAgo),
        supabase.from("research_sessions").select("id, name, ends_at").eq("status", "active").not("ends_at", "is", null).gte("ends_at", now).lte("ends_at", sevenAhead),
        supabase.from("fluency_analysis_runs").select("receipt_id").not("receipt_id", "is", null),
      ]);

      const roleRows = (roles.data ?? []) as { user_id: string; role: string }[];
      const uniqUsers = new Set(roleRows.map((r) => r.user_id));

      // Email dedup
      const seen = new Set<string>();
      const dedup: { status: string }[] = [];
      for (const row of (emailLogs.data ?? []) as { message_id: string | null; status: string }[]) {
        const key = row.message_id ?? Math.random().toString();
        if (seen.has(key)) continue;
        seen.add(key);
        dedup.push({ status: row.status });
      }
      const ek: EmailKpis = { sent: 0, failed: 0, suppressed: 0, bounced: 0, total: dedup.length, deliveryRate: 0 };
      for (const r of dedup) {
        if (r.status === "sent") ek.sent++;
        else if (r.status === "failed" || r.status === "dlq") ek.failed++;
        else if (r.status === "suppressed") ek.suppressed++;
        else if (r.status === "bounced") ek.bounced++;
      }
      const deliverable = ek.total - ek.suppressed;
      ek.deliveryRate = deliverable > 0 ? (ek.sent / deliverable) * 100 : 0;
      setEmailKpis(ek);

      // Receipt jobs — vocabulary aligned with worker (processing/rate_limited/dead_letter).
      const jobs = (receiptJobs.data ?? []) as { status: string }[];
      const inflight = jobs.filter((j) =>
        ["queued", "processing", "running", "building", "analyzing"].includes(j.status)
      ).length;
      const rateLimited = jobs.filter((j) => j.status === "rate_limited").length;
      const failed = jobs.filter((j) => j.status === "failed" || j.status === "error").length;
      const dead = jobs.filter((j) => j.status === "dead_letter").length;

      // Analysis coverage
      const analyzedIds = new Set(((analyzedReceipts.data ?? []) as { receipt_id: string | null }[])
        .map((r) => r.receipt_id).filter(Boolean) as string[]);
      const receiptsTotal = receiptsCt.count ?? 0;
      const receiptsWithAnalysis = analyzedIds.size;

      // Stale active sessions
      const activeSessionIds = new Set(((activeSessionsForStale.data ?? []) as { id: string }[]).map((s) => s.id));
      const recentlyActive = new Set(((convsLast14.data ?? []) as { session_id: string }[]).map((c) => c.session_id));
      const stale = Array.from(activeSessionIds).filter((id) => !recentlyActive.has(id)).length;

      const activeParticipants = new Set(((active7d.data ?? []) as { participant_id: string }[]).map((r) => r.participant_id)).size;

      setStats({
        users: uniqUsers.size,
        admins: roleRows.filter((r) => r.role === "admin").length,
        researchers: roleRows.filter((r) => r.role === "researcher").length,
        participants: roleRows.filter((r) => r.role === "participant").length,
        sessionsActive: sessionsActive.count ?? 0,
        sessionsTotal: sessionsAll.count ?? 0,
        conversations24h: conv24h.count ?? 0,
        conversationsTotal: convAll.count ?? 0,
        receipts: receiptsCt.count ?? 0,
        fluencyRuns: fluencyCt.count ?? 0,
        activeParticipants7d: activeParticipants,
        receiptJobsInflight: inflight,
        receiptJobsRateLimited: rateLimited,
        receiptJobsFailed: failed,
        receiptJobsDead: dead,
        staleSessions: stale,
        closingSoon: (closingSoonRows.data ?? []).length,
        receiptsTotal,
        receiptsWithAnalysis,
      });

      setRecent((recentConv.data ?? []) as RecentConv[]);
      setLoading(false);
    })();
  }, []);

  if (loading || !stats) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const kpi = (label: string, value: number | string, sub?: string, danger?: boolean) => (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-semibold ${danger ? "text-destructive" : ""}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">System overview</h1>
        <p className="text-sm text-muted-foreground">Cross-tenant view of users, sessions, and activity.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpi("Users", stats.users, `${stats.admins} admin · ${stats.researchers} researcher · ${stats.participants} participant`)}
        {kpi("Sessions", stats.sessionsTotal, `${stats.sessionsActive} active`)}
        {kpi("Conversations", stats.conversationsTotal, `${stats.conversations24h} in last 24h`)}
        {kpi("Receipts", stats.receipts, `${stats.fluencyRuns} fluency runs`)}
      </div>

      {/* Platform health */}
      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Platform health</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {kpi("Active participants 7d", stats.activeParticipants7d, "captured ≥1 conversation")}
          {kpi(
            "Receipts in-flight",
            stats.receiptJobsInflight,
            stats.receiptJobsRateLimited > 0 ? `${stats.receiptJobsRateLimited} rate-limited` : "queued + processing",
            stats.receiptJobsInflight > 25,
          )}
          {kpi(
            "Receipts failed",
            stats.receiptJobsFailed,
            "will auto-retry",
            stats.receiptJobsFailed > 0,
          )}
          {kpi(
            "Dead-letter (needs attention)",
            stats.receiptJobsDead,
            stats.receiptJobsDead > 0 ? "exhausted retries — review below" : "no stuck jobs",
            stats.receiptJobsDead > 0,
          )}
          {kpi("Stale active sessions", stats.staleSessions, "no activity 14d", stats.staleSessions > 0)}
          {kpi("Studies closing ≤7d", stats.closingSoon)}
          {kpi(
            "Analysis coverage",
            stats.receiptsTotal === 0 ? "—" : `${Math.round((stats.receiptsWithAnalysis / stats.receiptsTotal) * 100)}%`,
            `${stats.receiptsWithAnalysis} of ${stats.receiptsTotal} receipts analyzed`,
            stats.receiptsTotal > 0 && stats.receiptsWithAnalysis < stats.receiptsTotal,
          )}
          <CronHeartbeatTile jobName="process-receipt-jobs" label="Receipt cron last tick" />
          <CronHeartbeatTile jobName="process-thread-jobs" label="Thread cron last tick" />
        </div>
      </div>

      <AdminReceiptJobsPanel />

      <AiProviderEventsPanel />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent conversations</CardTitle>
            <CardDescription>Latest 20 captures across all sessions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">No conversations yet.</p>
            ) : recent.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded border bg-card px-3 py-2 text-sm">
                <div className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{c.tool}</span>
                  <span className="ml-2 text-muted-foreground">{c.title || "(untitled)"}</span>
                </div>
                <span className="ml-3 shrink-0 text-xs text-muted-foreground">
                  {format(new Date(c.captured_at), "MMM d HH:mm")}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>Email health</CardTitle>
                <CardDescription>Last 7 days.</CardDescription>
              </div>
              <Link to="/admin/emails" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                Details <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!emailKpis || emailKpis.total === 0 ? (
              <p className="text-sm text-muted-foreground">No email activity.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded border bg-card p-2">
                    <p className="text-xs text-muted-foreground">Sent</p>
                    <p className="text-lg font-semibold">{emailKpis.sent}</p>
                  </div>
                  <div className="rounded border bg-card p-2">
                    <p className="text-xs text-muted-foreground">Failed</p>
                    <p className={`text-lg font-semibold ${emailKpis.failed > 0 ? "text-destructive" : ""}`}>{emailKpis.failed}</p>
                  </div>
                  <div className="rounded border bg-card p-2">
                    <p className="text-xs text-muted-foreground">Suppressed</p>
                    <p className="text-lg font-semibold">{emailKpis.suppressed}</p>
                  </div>
                  <div className="rounded border bg-card p-2">
                    <p className="text-xs text-muted-foreground">Bounced</p>
                    <p className="text-lg font-semibold">{emailKpis.bounced}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Delivery rate</span>
                  <Badge variant={emailKpis.deliveryRate >= 95 ? "default" : "destructive"}>
                    {emailKpis.deliveryRate.toFixed(1)}%
                  </Badge>
                </div>
                {emailKpis.failed > 0 && (
                  <div className="flex items-center gap-1 text-xs text-destructive">
                    <AlertTriangle className="h-3 w-3" /> Investigate failures in details view
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CronHeartbeatTile({ jobName, label }: { jobName: string; label: string }) {
  const fetchHeartbeat = useServerFn(getCronHeartbeat);
  const [hb, setHb] = useState<{ last_run_at: string; last_status: string; last_payload: any } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { heartbeat } = await fetchHeartbeat({ data: { jobName } });
        if (!cancelled) setHb(heartbeat as any);
      } catch {}
      finally { if (!cancelled) setLoaded(true); }
    };
    load();
    const id = window.setInterval(load, 30_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [fetchHeartbeat, jobName]);

  const ageMs = hb ? Date.now() - new Date(hb.last_run_at).getTime() : null;
  const stale = ageMs !== null && ageMs > 5 * 60_000;
  const value = !loaded ? "…" : !hb ? "never" : formatDistanceToNow(new Date(hb.last_run_at), { addSuffix: true });
  const sub = !hb ? "no heartbeat yet" : `${hb.last_status} · scanned ${hb.last_payload?.scanned ?? 0}, claimed ${hb.last_payload?.claimed ?? 0}`;

  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-semibold ${stale ? "text-destructive" : ""}`}>{value}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}
