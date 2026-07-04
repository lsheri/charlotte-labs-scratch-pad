import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Briefcase, FlaskConical, MessageSquare, Receipt } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToolLogo } from "@/components/ToolLogo";
import { getMyWorkspace } from "@/serverfn/workspaces";
import { getReceiptDisplayName } from "@/lib/displayNames";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/participant/workspaces/$workspaceId")({
  component: WorkspaceDetail,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-2xl p-6">
      <p className="text-sm text-muted-foreground">{error.message}</p>
      <Button asChild variant="link" className="mt-2 px-0">
        <Link to="/participant/workspaces"><ArrowLeft className="mr-1 h-4 w-4" /> Back to workspaces</Link>
      </Button>
    </div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl p-6">
      <p className="text-sm text-muted-foreground">Workspace not found.</p>
      <Button asChild variant="link" className="mt-2 px-0">
        <Link to="/participant/workspaces"><ArrowLeft className="mr-1 h-4 w-4" /> Back to workspaces</Link>
      </Button>
    </div>
  ),
});

function WorkspaceDetail() {
  const { workspaceId } = Route.useParams();
  const fetchFn = useServerFn(getMyWorkspace);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchFn({ data: { workspaceId } })
      .then((r) => setData(r))
      .catch((e) => setError(e?.message ?? "Failed to load workspace"))
      .finally(() => setLoading(false));
  }, [workspaceId, fetchFn]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (error) return <div className="p-6 text-sm text-muted-foreground">{error}</div>;
  if (!data) return null;

  const { workspace, threads, receipts } = data;
  const Icon = workspace.kind === "personal" ? Briefcase : FlaskConical;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 p-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/participant/workspaces"><ArrowLeft className="mr-1 h-4 w-4" /> All workspaces</Link>
      </Button>

      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-secondary">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{workspace.name}</h1>
              {workspace.kind === "personal" && <Badge variant="secondary">Default</Badge>}
              {workspace.kind === "research" && <Badge variant="outline">{workspace.status}</Badge>}
            </div>
            {workspace.description && (
              <p className="text-sm text-muted-foreground">{workspace.description}</p>
            )}
          </div>
        </div>
      </header>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <MessageSquare className="h-4 w-4" /> Threads ({threads.length})
          </h2>
          <Button asChild size="sm" variant="ghost">
            <Link to="/participant/threads">View all</Link>
          </Button>
        </div>
        {threads.length === 0 ? (
          <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">No threads in this workspace yet.</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {threads.slice(0, 20).map((t: any) => (
              <Link key={t.id} to="/participant/threads/$threadId" params={{ threadId: t.id }}>
                <Card className="transition hover:border-primary/40">
                  <CardContent className="flex items-center gap-3 p-3">
                    <ToolLogo tool={t.tool} className="h-5 w-5" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{t.title || "Untitled thread"}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.turn_count} turns · updated {formatDistanceToNow(new Date(t.last_captured_at), { addSuffix: true })}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <Receipt className="h-4 w-4" /> Receipts ({receipts.length})
          </h2>
          <Button asChild size="sm" variant="ghost">
            <Link to="/participant/receipts">View all</Link>
          </Button>
        </div>
        {receipts.length === 0 ? (
          <Card><CardContent className="py-6 text-center text-sm text-muted-foreground">No receipts in this workspace yet.</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {receipts.slice(0, 20).map((r: any) => (
              <Link key={r.id} to="/participant/receipts/$receiptId" params={{ receiptId: r.id }}>
                <Card className="transition hover:border-primary/40">
                  <CardContent className="flex items-center gap-3 p-3">
                    <ToolLogo tool={r.tool_used} className="h-5 w-5" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{getReceiptDisplayName(r)}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
