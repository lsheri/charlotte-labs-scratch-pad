import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  Building2, Users, MessageSquare, Receipt as ReceiptIcon, ArrowLeft,
  AlertTriangle, Sparkles, ChevronsUpDown, GraduationCap, Wrench, ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listDepartments, getDepartmentDashboard } from "@/serverfn/admin-overview";
import { anonymousLabel } from "@/lib/displayNames";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

type Dashboard = Awaited<ReturnType<typeof getDepartmentDashboard>>;

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Department View — Charlotte Labs" },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.session.user.id);
    if (!(roles ?? []).some((r) => r.role === "admin")) {
      throw redirect({ to: "/participant" });
    }
  },
  component: AdminDashboard,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">Failed to load: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-8">Not found</div>,
});

function AdminDashboard() {
  const fetchDepartments = useServerFn(listDepartments);
  const fetchDashboard = useServerFn(getDepartmentDashboard);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string; join_code: string | null }>>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [data, setData] = useState<Dashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchDepartments()
      .then((r) => {
        setDepartments(r.departments as any);
        if (r.departments.length > 0) setSessionId(r.departments[0].id);
      })
      .catch((e: any) => setErr(e?.message ?? String(e)));
  }, [fetchDepartments]);

  useEffect(() => {
    if (!sessionId) return;
    setData(null);
    fetchDashboard({ data: { sessionId } })
      .then(setData)
      .catch((e: any) => setErr(e?.message ?? String(e)));
  }, [sessionId, fetchDashboard]);

  const activeDept = departments.find((d) => d.id === sessionId);

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-6 py-4">
          <Building2 className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Department View</h1>
            <p className="text-xs text-muted-foreground">
              AI Fluency insights for department leaders · anonymized by default
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <GraduationCap className="h-4 w-4 text-primary" />
                  {activeDept?.join_code ?? activeDept?.name ?? "Select department"}
                  <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {departments.map((d) => (
                  <DropdownMenuItem key={d.id} onSelect={() => setSessionId(d.id)}>
                    <GraduationCap className="mr-2 h-4 w-4" />
                    {d.join_code ?? d.name}
                  </DropdownMenuItem>
                ))}
                {departments.length === 0 && (
                  <DropdownMenuItem disabled>No departments</DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Link to="/participant">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" /> Participant view
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        {err && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="p-4 text-sm text-destructive">{err}</CardContent>
          </Card>
        )}

        {!data && !err && (
          <div className="py-24 text-center text-sm text-muted-foreground">Loading department signals…</div>
        )}

        {data && <DashboardBody data={data} />}
      </main>
    </div>
  );
}

function DashboardBody({ data }: { data: Dashboard }) {
  const { overall, toolBreakdown, verifCounts, perAssignment, recentReceipts, session } = data;
  const totalTools = toolBreakdown.reduce((s, t) => s + t.count, 0);
  const totalVerif = Object.values(verifCounts).reduce((s, n) => s + n, 0);

  return (
    <>
      <section className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Kpi icon={<Users className="h-4 w-4" />} label="Students" value={overall.participantCount} />
        <Kpi icon={<GraduationCap className="h-4 w-4" />} label="Assignments" value={overall.assignmentCount} />
        <Kpi icon={<MessageSquare className="h-4 w-4" />} label="AI threads" value={overall.threadCount} sub={`${overall.totalTurns} turns`} />
        <Kpi icon={<ReceiptIcon className="h-4 w-4" />} label="Workflows logged" value={overall.receiptCount} />
        <RiskKpi score={overall.overallRiskScore} />
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">
              Assignments at risk of AI-trivialization — {session?.join_code ?? session?.name ?? "Department"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {perAssignment.length === 0 && (
              <div className="text-sm text-muted-foreground">No assignments in this department yet.</div>
            )}
            {perAssignment.map((a) => (
              <AssignmentRow key={a.id} a={a} />
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Wrench className="h-4 w-4 text-primary" /> Tools in use
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {toolBreakdown.length === 0 && (
                <div className="text-sm text-muted-foreground">No tool activity yet.</div>
              )}
              {toolBreakdown.map((t) => (
                <BarRow key={t.tool} label={t.tool} value={t.count} max={totalTools} />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <ShieldCheck className="h-4 w-4 text-primary" /> Verification pattern
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <BarRow label="High verification" value={verifCounts.high} max={totalVerif} tone="good" />
              <BarRow label="Partial verification" value={verifCounts.partial} max={totalVerif} tone="warn" />
              <BarRow label="No verification" value={verifCounts.none} max={totalVerif} tone="bad" />
              <BarRow label="Unclassified" value={verifCounts.unknown} max={totalVerif} tone="mute" />
              <p className="pt-2 text-xs text-muted-foreground">
                Whether students challenged, cross-checked, or accepted AI output.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4 text-primary" /> Recent AI collaboration workflows
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {recentReceipts.length === 0 && (
              <div className="text-muted-foreground">No workflows logged yet.</div>
            )}
            {recentReceipts.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 border-b py-2 last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{r.label ?? "Untitled workflow"}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{anonymousLabel(r.participantId)}</span>
                    <span>·</span>
                    <span className="capitalize">{r.tool}</span>
                    {r.workflowType && (
                      <>
                        <span>·</span>
                        <span className="capitalize">{r.workflowType}</span>
                      </>
                    )}
                  </div>
                </div>
                {r.provenance && (
                  <Badge variant={r.provenance === "lab" ? "default" : "outline"} className="capitalize">
                    {r.provenance}
                  </Badge>
                )}
                <div className="w-20 text-right text-xs text-muted-foreground">
                  {new Date(r.createdAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <p className="mt-4 text-xs text-muted-foreground">
          Identities are anonymized (Participant-XXXX). Reveal is admin-gated and audited.
        </p>
      </section>
    </>
  );
}

function Kpi({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number; sub?: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-md bg-primary/10 p-2 text-primary">{icon}</div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold leading-tight">{value}</div>
          {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

function RiskKpi({ score }: { score: number }) {
  const band = score >= 75 ? "Critical" : score >= 55 ? "High" : score >= 35 ? "Moderate" : "Low";
  const tone =
    score >= 75 ? "text-destructive bg-destructive/10"
    : score >= 55 ? "text-amber-600 bg-amber-500/10"
    : score >= 35 ? "text-yellow-600 bg-yellow-500/10"
    : "text-emerald-600 bg-emerald-500/10";
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`rounded-md p-2 ${tone}`}>
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">AI-triviality risk</div>
          <div className="text-2xl font-semibold leading-tight">{score}</div>
          <div className="text-xs text-muted-foreground">{band}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function AssignmentRow({ a }: { a: Dashboard["perAssignment"][number] }) {
  const bandTone =
    a.risk.band === "critical" ? "border-destructive/40 bg-destructive/5"
    : a.risk.band === "high" ? "border-amber-500/40 bg-amber-500/5"
    : a.risk.band === "moderate" ? "border-yellow-500/30 bg-yellow-500/5"
    : "border-emerald-500/30 bg-emerald-500/5";
  const dot =
    a.risk.band === "critical" ? "bg-destructive"
    : a.risk.band === "high" ? "bg-amber-500"
    : a.risk.band === "moderate" ? "bg-yellow-500"
    : "bg-emerald-500";

  return (
    <div className={`rounded-md border p-3 ${bandTone}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${dot}`} />
            <span className="text-xs font-semibold text-muted-foreground">{a.code}</span>
            <span className="truncate text-sm font-medium">{a.title.replace(/^.*—\s*/, "")}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{a.threadCount} threads · {a.uniqueStudents} students</span>
            <span>Avg {a.avgTurns} turns</span>
            <span>
              Tool coverage {a.toolsCoveredCount}/{a.expectedToolsCount || "—"}
              {a.toolsUsed.length > 0 && ` (${a.toolsUsed.join(", ")})`}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold leading-none">{a.risk.score}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{a.risk.band}</div>
        </div>
      </div>
      <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
        {a.risk.drivers.map((d) => (
          <li key={d}>· {d}</li>
        ))}
      </ul>
    </div>
  );
}

function BarRow({
  label, value, max, tone = "primary",
}: { label: string; value: number; max: number; tone?: "primary" | "good" | "warn" | "bad" | "mute" }) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  const bar =
    tone === "good" ? "bg-emerald-500"
    : tone === "warn" ? "bg-yellow-500"
    : tone === "bad" ? "bg-destructive"
    : tone === "mute" ? "bg-muted-foreground/40"
    : "bg-primary";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="capitalize">{label}</span>
        <span className="text-muted-foreground">{value}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
