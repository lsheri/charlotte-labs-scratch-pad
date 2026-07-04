import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ChevronDown, ChevronRight } from "lucide-react";
import { TurnBlock } from "@/components/conversation/TurnBlock";

export const Route = createFileRoute("/researcher/conversations/$convId")({ component: ConversationViewer });

interface Conv {
  id: string; tool: string; title: string | null; ai_summary: string | null;
  captured_at: string; prompt_text: string; session_id: string; participant_id: string;
  raw_payload: any; url: string | null;
}
interface Turn { id: string; role: string; content: string; idx: number }

function ConversationViewer() {
  const { convId } = Route.useParams();
  const [conv, setConv] = useState<Conv | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [participantName, setParticipantName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: c }, { data: t }] = await Promise.all([
        supabase.from("ai_conversations").select("*").eq("id", convId).maybeSingle(),
        supabase.from("conversation_turns").select("id, role, content, idx").eq("conversation_id", convId).order("idx"),
      ]);
      setConv(c as any);
      setTurns((t ?? []) as Turn[]);
      if (c?.participant_id) {
        const { data: p } = await supabase.from("profiles").select("display_name").eq("id", c.participant_id).maybeSingle();
        setParticipantName(p?.display_name ?? null);
      }
      setLoading(false);
    })();
  }, [convId]);

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!conv) return <p className="text-sm text-muted-foreground">Conversation not found.</p>;

  return (
    <div className="space-y-4">
      <Link to="/researcher/sessions/$sessionId" params={{ sessionId: conv.session_id }} className="text-xs text-muted-foreground hover:underline">
        ← Back to session
      </Link>
      <div className="flex items-center gap-2">
        <Badge variant="outline">{conv.tool}</Badge>
        <span className="text-xs text-muted-foreground">{format(new Date(conv.captured_at), "PPpp")}</span>
        <span className="text-xs text-muted-foreground">· {participantName ?? conv.participant_id.slice(0, 8)}</span>
        {conv.url && (
          <a href={conv.url} target="_blank" rel="noreferrer" className="text-xs text-muted-foreground underline">
            source
          </a>
        )}
      </div>
      <h1 className="text-xl font-semibold">{conv.title || conv.prompt_text.slice(0, 80)}</h1>
      {conv.ai_summary && (
        <Card><CardHeader><CardTitle className="text-sm">AI summary</CardTitle></CardHeader>
          <CardContent><p className="text-sm">{conv.ai_summary}</p></CardContent></Card>
      )}
      <div className="space-y-3">
        {turns.length === 0 ? <p className="text-sm text-muted-foreground">No turns recorded.</p> :
          turns.map(t => (
            <TurnBlock key={t.id} role={t.role} content={t.content} showCopy />
          ))
        }
      </div>

      <Card>
        <CardHeader className="pb-2">
          <Button variant="ghost" size="sm" className="w-fit -ml-2" onClick={() => setShowRaw(s => !s)}>
            {showRaw ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Raw payload
          </Button>
        </CardHeader>
        {showRaw && (
          <CardContent>
            <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">
              {JSON.stringify(conv.raw_payload, null, 2)}
            </pre>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
