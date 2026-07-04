import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getThread } from "@/serverfn/threads";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TurnBlock } from "@/components/conversation/TurnBlock";
import { ThreadSummaryChip } from "@/components/conversation/ThreadSummaryChip";
import { SourceBadge } from "@/components/conversation/SourceBadge";
import { format } from "date-fns";

export const Route = createFileRoute("/participant/threads/$threadId")({
  component: ThreadDetail,
});

function ThreadDetail() {
  const { threadId } = Route.useParams();
  const fn = useServerFn(getThread);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fn({ data: { threadId } }).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
    import("@/lib/posthog").then(({ posthog }) => posthog.capture("thread_viewed", { thread_id: threadId })).catch(() => {});
  }, [threadId]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!data?.thread) return <p className="text-sm text-muted-foreground">Thread not found.</p>;

  const { thread, captures, turns } = data;
  return (
    <div className="space-y-4">
      <Link to="/participant/threads" className="text-xs text-muted-foreground hover:underline">← Back to threads</Link>
      <div>
        <h1 className="text-2xl font-semibold">
          {format(new Date(thread.first_captured_at), "MMM d, yyyy · h:mm a")}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="capitalize">{thread.tool}</Badge>
          <SourceBadge source={captures[0]?.source} />
          <span className="text-xs text-muted-foreground">
            {captures.length} capture{captures.length === 1 ? "" : "s"} · last {format(new Date(thread.last_captured_at), "MMM d, h:mm a")}
          </span>
          {thread.last_url && (
            <a href={thread.last_url} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground underline">source</a>
          )}
        </div>
        <div className="mt-2">
          <ThreadSummaryChip summary={thread.summary} seed={thread.id} truncate={false} />
        </div>
        {thread.title && (
          <p className="mt-2 text-xs text-muted-foreground">Original title: {thread.title}</p>
        )}
      </div>
      <Card>
        <CardHeader><CardTitle className="text-sm">Latest snapshot ({turns.length} turns)</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {turns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No content captured.</p>
          ) : turns.map((t: any) => (
            <TurnBlock key={t.id} role={t.role} content={t.content} showCopy />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
