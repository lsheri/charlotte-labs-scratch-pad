import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { GraduationCap, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listMyClasses } from "@/serverfn/department";

export const Route = createFileRoute("/participant/department")({
  component: DepartmentIndex,
});

function DepartmentIndex() {
  const listFn = useServerFn(listMyClasses);
  const [classes, setClasses] = useState<any[] | null>(null);

  useEffect(() => {
    listFn().then((r) => setClasses(r.classes)).catch(() => setClasses([]));
  }, [listFn]);

  if (classes === null) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  if (classes.length === 1) {
    return <Navigate to="/participant/department/$classId" params={{ classId: classes[0].id }} />;
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Department</h1>
        <p className="text-sm text-muted-foreground">Classes you're part of.</p>
      </header>
      {classes.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          You're not in any class workspaces yet.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {classes.map((c) => (
            <Link key={c.id} to="/participant/department/$classId" params={{ classId: c.id }}>
              <Card className="transition hover:border-primary/40">
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                    <GraduationCap className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-medium">{c.name}</h3>
                      {c.courseCode && <Badge variant="outline">{c.courseCode}</Badge>}
                    </div>
                    {c.term && <p className="text-xs text-muted-foreground">{c.term}</p>}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
