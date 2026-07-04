import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TurnBlock } from "@/components/conversation/TurnBlock";
import { ThreadSummaryChip } from "@/components/conversation/ThreadSummaryChip";
import { SourceBadge } from "@/components/conversation/SourceBadge";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { anonymousLabel, getThreadDisplayName } from "@/lib/displayNames";

export const Route = createFileRoute("/admin/threads/$threadId")({ component: AdminThreadDetail });

function AdminThreadDetail() {
  const { threadId } = Route.useParams();
  const [thread, setThread] = useState<any>(null);
  const [captures, setCaptures] = useState<any[]>([]);
  const [turnsByCap, setTurnsByCap] = useState<Record<string, any[]>>({});
  
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: t } = await supabase.from("chat_threads").select("*").eq("id", threadId).maybeSingle();
      setThread(t);
      if (t) {
        const { data: caps } = await supabase
          .from("ai_conversations")
          .select("id, captured_at, title, url, transcript_hash, source")
          .eq("thread_id", threadId).order("captured_at", { ascending: false });
        const capList = caps ?? [];
        setCaptures(capList);
        if (capList.length) {
          const { data: turns } = await supabase
            .from("conversation_turns").select("id, conversation_id, role, content, idx")
            .in("conversation_id", capList.map(c => c.id)).order("idx");
          const map: Record<string, any[]> = {};
          (turns ?? []).forEach((tr: any) => {
            (map[tr.conversation_id] = map[tr.conversation_id] ?? []).push(tr);
          });
          setTurnsByCap(map);
        }
      }
      setLoading(false);
    })();
  }, [threadId]);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!thread) return <p className="text-sm text-muted-foreground">Thread not found.</p>;

  return (
    <div className="space-y-4">
      <Link to="/admin/conversations" className="text-xs text-muted-foreground hover:underline">← Back to threads</Link>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{thread.tool}</Badge>
          <SourceBadge source={captures[0]?.source} />
          <Link to="/admin/users/$userId" params={{ userId: thread.participant_id }}
            className="text-sm font-medium font-mono hover:underline">
            {anonymousLabel(thread.participant_id)}
          </Link>
          <span className="text-xs text-muted-foreground font-mono">{thread.participant_id.slice(0, 8)}…</span>
          {thread.last_url && (
            <a href={thread.last_url} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground underline">source</a>
          )}
        </div>
        <h1 className="mt-1 text-xl font-semibold">
          {getThreadDisplayName(thread)}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <ThreadSummaryChip summary={thread.summary} seed={thread.id} truncate={false} />
          {thread.summary_generated_at && (
            <span className="text-[10px] text-muted-foreground font-mono">
              summary @ {format(new Date(thread.summary_generated_at), "PPp")}
            </span>
          )}
        </div>
        {thread.title && (
          <p className="mt-1 text-xs text-muted-foreground">Original title: {thread.title}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          {captures.length} capture{captures.length === 1 ? "" : "s"} · first {format(new Date(thread.first_captured_at), "PPp")} · last {format(new Date(thread.last_captured_at), "PPp")}
        </p>
      </div>

      {captures.map((c, i) => {
        const turns = turnsByCap[c.id] ?? [];
        return (
          <Card key={c.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                Capture {captures.length - i} of {captures.length}
                <span className="text-xs font-normal text-muted-foreground">
                  {format(new Date(c.captured_at), "PPpp")} · {turns.length} turns
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {turns.length === 0 ? (
                <p className="text-sm text-muted-foreground">No turns recorded.</p>
              ) : turns.map(t => (
                <TurnBlock key={t.id} role={t.role} content={t.content} showCopy />
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
