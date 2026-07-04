import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Briefcase, FlaskConical, MessageSquare, Receipt, ChevronRight, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { listMyWorkspaces } from "@/serverfn/workspaces";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/participant/workspaces")({
  component: WorkspacesPage,
});

type Workspace = {
  id: string;
  name: string;
  description: string | null;
  kind: "research" | "personal";
  status: string;
  joinCode: string;
  threadCount: number;
  receiptCount: number;
};

function WorkspacesPage() {
  const { user } = useAuth();
  const listFn = useServerFn(listMyWorkspaces);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    listFn()
      .then((r: any) => setWorkspaces(r.workspaces ?? []))
      .catch(() => setWorkspaces([]))
      .finally(() => setLoading(false));
  }, [user, listFn]);

  const personal = workspaces.filter((w) => w.kind === "personal");
  const research = workspaces.filter((w) => w.kind === "research");

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Workspaces</h1>
        <p className="text-sm text-muted-foreground">
          Captures land in your Personal Workspace by default. Join a research study to contribute captures there instead.
        </p>
      </header>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Personal</h2>
            {personal.length === 0 ? (
              <p className="text-sm text-muted-foreground">No personal workspace yet.</p>
            ) : (
              personal.map((w) => <WorkspaceCard key={w.id} w={w} />)
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Research studies</h2>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/participant">
                        Join proctored session
                        <Info className="ml-1.5 h-3 w-3 text-muted-foreground" />
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    If you are part of a GenAI Bootcamp, Vibe Code workshop, or classroom a proctor may have a special workspace code for you to submit your work.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            {research.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  You haven't joined any research studies yet.
                </CardContent>
              </Card>
            ) : (
              research.map((w) => <WorkspaceCard key={w.id} w={w} />)
            )}
          </section>
        </>
      )}
    </div>
  );
}

function WorkspaceCard({ w }: { w: Workspace }) {
  const Icon = w.kind === "personal" ? Briefcase : FlaskConical;
  const linkProps = w.kind === "personal"
    ? ({ to: "/participant/threads" } as const)
    : ({ to: "/participant/workspaces/$workspaceId", params: { workspaceId: w.id } } as const);
  return (
    <Link {...linkProps}>
      <Card className="transition hover:border-primary/40 hover:shadow-sm">
        <CardContent className="flex items-center gap-4 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-medium">{w.name}</h3>
              {w.kind === "personal" && <Badge variant="secondary">Default</Badge>}
              {w.kind === "research" && <Badge variant="outline">{w.status}</Badge>}
            </div>
            {w.description && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{w.description}</p>
            )}
            <div className="mt-1.5 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {w.threadCount} threads</span>
              <span className="flex items-center gap-1"><Receipt className="h-3 w-3" /> {w.receiptCount} receipts</span>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </CardContent>
      </Card>
    </Link>
  );
}
