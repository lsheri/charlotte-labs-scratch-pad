import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { format, formatDistanceToNow } from "date-fns";
import { FileText, ArrowLeft, MessageSquare, Receipt as ReceiptIcon } from "lucide-react";
import { getAssignmentDetail } from "@/serverfn/assignments";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToolLogo } from "@/components/ToolLogo";

export const Route = createFileRoute(
  "/participant/department/$classId/assignments/$assignmentId",
)({ component: AssignmentDetail });

function AssignmentDetail() {
  const { classId, assignmentId } = Route.useParams();
  const fetchFn = useServerFn(getAssignmentDetail);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchFn({ data: { assignmentId } })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [assignmentId, fetchFn]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!data) return <div className="p-6 text-sm text-muted-foreground">Assignment not found.</div>;

  const a = data.assignment;
  const rubric = (a.rubric ?? {}) as any;

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/participant/department/$classId" params={{ classId }}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to {a.courseCode ?? a.className}
          </Link>
        </Button>
      </div>

      <header className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <FileText className="h-4 w-4" />
          <span>{a.courseCode ?? a.className}</span>
          <span>·</span>
          <span className="font-medium">{a.code}</span>
        </div>
        <h1 className="text-2xl font-semibold">{a.title}</h1>
        {a.dueAt && (
          <p className="text-sm text-muted-foreground">
            Due {format(new Date(a.dueAt), "MMM d, yyyy · h:mm a")}
          </p>
        )}
        {a.description && <p className="text-sm text-muted-foreground max-w-3xl">{a.description}</p>}
        <div className="flex flex-wrap gap-2 pt-1">
          {(a.expectedTools ?? []).map((t: string) => (
            <Badge key={t} variant="outline" className="capitalize">{t}</Badge>
          ))}
        </div>
      </header>

      {rubric.parts && (
        <Card>
          <CardHeader><CardTitle className="text-base">Rubric</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {rubric.parts.map((p: any) => (
              <div key={p.name}>
                <div className="font-medium">
                  {p.name} <span className="text-muted-foreground">· {p.points} pts</span>
                </div>
                <ul className="mt-1 ml-4 list-disc text-muted-foreground">
                  {(p.questions ?? []).map((q: any) => (
                    <li key={q.id}>Q{q.id} ({q.points} pts) — {q.topic}</li>
                  ))}
                </ul>
              </div>
            ))}
            {rubric.weights && (
              <div className="pt-2">
                <div className="font-medium">Grading weights</div>
                <ul className="mt-1 ml-4 list-disc text-muted-foreground">
                  {rubric.weights.map((w: any) => (
                    <li key={w.component}>{w.component} — {Math.round(w.weight * 100)}%</li>
                  ))}
                </ul>
              </div>
            )}
            {rubric.portableTakeaway && (
              <p className="pt-2 italic text-muted-foreground">"{rubric.portableTakeaway}"</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> Your mapped threads ({data.mappedThreads.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.mappedThreads.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No threads mapped yet. Head to{" "}
              <Link to="/participant/threads" className="text-primary underline">Threads</Link>{" "}
              and map conversations to this assignment.
            </p>
          ) : (
            <div className="space-y-2">
              {data.mappedThreads.map((t: any) => (
                <Link
                  key={t.id}
                  to="/participant/threads/$threadId"
                  params={{ threadId: t.id }}
                  className="flex items-center gap-3 rounded-md border p-2 hover:bg-accent"
                >
                  <ToolLogo tool={t.tool} size={24} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {t.title || format(new Date(t.first_captured_at), "MMM d, yyyy · h:mm a")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t.turn_count} msgs · updated {formatDistanceToNow(new Date(t.last_captured_at), { addSuffix: true })}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ReceiptIcon className="h-4 w-4" /> Submissions ({data.submissions.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.submissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No receipts submitted yet.</p>
          ) : (
            <div className="space-y-2">
              {data.submissions.map((s: any) => (
                <Link
                  key={s.id}
                  to="/participant/receipts/$receiptId"
                  params={{ receiptId: s.receipt_id }}
                  className="flex items-center gap-3 rounded-md border p-2 hover:bg-accent"
                >
                  <ReceiptIcon className="h-4 w-4 text-muted-foreground" />
                  <div className="text-sm">
                    Submitted {format(new Date(s.submitted_at), "MMM d, yyyy · h:mm a")}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
