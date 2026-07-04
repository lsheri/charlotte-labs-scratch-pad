import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, GraduationCap, Users, AlertTriangle, Calendar, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToolLogo } from "@/components/ToolLogo";
import { FluencyRadar } from "@/components/FluencyRadar";
import {
  getDepartmentOverview,
  getDepartmentToolTrends,
  getDepartmentFluencyTrends,
  getDepartmentAssignmentTrends,
} from "@/serverfn/department";
import { anonymousLabel } from "@/lib/displayNames";
import { formatDistanceToNow, format } from "date-fns";

export const Route = createFileRoute("/participant/department/$classId")({
  component: ClassDashboard,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-2xl p-6">
      <p className="text-sm text-muted-foreground">{error.message}</p>
      <Button asChild variant="link" className="mt-2 px-0">
        <Link to="/participant/department"><ArrowLeft className="mr-1 h-4 w-4" /> All classes</Link>
      </Button>
    </div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl p-6 text-sm text-muted-foreground">Class not found.</div>
  ),
});

function ClassDashboard() {
  const { classId } = Route.useParams();
  const fetchFn = useServerFn(getDepartmentOverview);
  const fetchTools = useServerFn(getDepartmentToolTrends);
  const fetchFluency = useServerFn(getDepartmentFluencyTrends);
  const fetchAssignments = useServerFn(getDepartmentAssignmentTrends);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [trends, setTrends] = useState<any>(null);

  useEffect(() => {
    fetchFn({ data: { classId } })
      .then(setData)
      .catch((e) => setError(e?.message ?? "Failed to load class"));
    Promise.all([
      fetchTools({ data: { classId } }).catch(() => ({ weeks: [], series: [] })),
      fetchFluency({ data: { classId } }).catch(() => ({ weeks: [], series: [] })),
      fetchAssignments({ data: { classId } }).catch(() => ({ assignments: [] })),
    ]).then(([tools, fluency, assignments]) => setTrends({ tools, fluency, assignments }));
  }, [classId, fetchFn, fetchTools, fetchFluency, fetchAssignments]);

  if (error) return <div className="p-6 text-sm text-muted-foreground">{error}</div>;
  if (!data) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  const { class: cls, memberCount, tools, fluency, assignments } = data;
  const maxToolCount = Math.max(1, ...tools.map((t: any) => t.count));
  const hasFluency = fluency.some((d: any) => d.value > 0);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 p-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/participant/department"><ArrowLeft className="mr-1 h-4 w-4" /> All classes</Link>
      </Button>

      <header className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-secondary">
          <GraduationCap className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{cls.name}</h1>
            {cls.courseCode && <Badge variant="outline">{cls.courseCode}</Badge>}
            {cls.term && <Badge variant="secondary">{cls.term}</Badge>}
          </div>
          {cls.description && <p className="mt-1 text-sm text-muted-foreground">{cls.description}</p>}
          <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {memberCount} members</span>
            <span>Join code: <span className="font-mono">{cls.joinCode}</span></span>
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Class tools</CardTitle></CardHeader>
          <CardContent>
            {tools.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tool usage captured yet.</p>
            ) : (
              <div className="space-y-3">
                {tools.slice(0, 8).map((t: any) => (
                  <div key={t.tool} className="flex items-center gap-3">
                    <ToolLogo tool={t.tool} className="h-5 w-5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="truncate font-medium capitalize">{t.tool}</span>
                        <span className="text-muted-foreground">{t.count}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                        <div className="h-full bg-primary" style={{ width: `${(t.count / maxToolCount) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Class fluency</CardTitle></CardHeader>
          <CardContent>
            {hasFluency ? (
              <FluencyRadar dimensions={fluency.map((d: any) => ({ canonical_name: d.label, display_name: d.label, score: d.value }))} size={320} />
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">No class fluency scores yet.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Assignments</h2>
        {assignments.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
            No assignments yet.
          </CardContent></Card>
        ) : (
          <div className="space-y-2">
            {assignments.map((a: any) => (
              <Card key={a.id}>
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="font-mono">{a.code}</Badge>
                        <h3 className="font-medium">{a.title}</h3>
                      </div>
                      {a.description && <p className="mt-1 text-sm text-muted-foreground">{a.description}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                        {a.dueAt && (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> Due {format(new Date(a.dueAt), "MMM d")}
                          </span>
                        )}
                        <span>{a.submittedCount} submitted</span>
                        {a.atRiskCount > 0 && (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="h-3 w-3" /> {a.atRiskCount} at risk
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  {a.atRiskSubmissions.length > 0 && (
                    <div className="mt-3 space-y-1 border-t pt-3">
                      <p className="text-xs font-medium text-muted-foreground">At risk of trivial AI use</p>
                      {a.atRiskSubmissions.map((s: any) => (
                        <div key={s.id} className="flex items-center justify-between text-xs">
                          <span className="font-mono">{anonymousLabel(s.participantId)}</span>
                          <div className="flex items-center gap-2">
                            <Badge variant={s.risk.level === "high" ? "destructive" : "secondary"}>
                              {s.risk.level} risk · {s.risk.score}
                            </Badge>
                            {s.receiptId && (
                              <Link
                                to="/participant/receipts/$receiptId"
                                params={{ receiptId: s.receiptId }}
                                className="text-muted-foreground hover:underline"
                              >
                                view receipt
                              </Link>
                            )}
                            <span className="text-muted-foreground">
                              {formatDistanceToNow(new Date(s.submittedAt), { addSuffix: true })}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
