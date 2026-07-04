import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/admin/sessions")({ component: AdminSessions });

interface Row {
  id: string;
  name: string;
  status: string;
  join_code: string;
  researcher_id: string;
  created_at: string;
  participants: number;
  conversations: number;
}

function AdminSessions() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [sessions, participants, convs] = await Promise.all([
        supabase.from("research_sessions").select("id, name, status, join_code, researcher_id, created_at").order("created_at", { ascending: false }),
        supabase.from("session_participants").select("session_id"),
        supabase.from("ai_conversations").select("session_id"),
      ]);
      const pCount = new Map<string, number>();
      for (const r of (participants.data ?? []) as { session_id: string }[]) pCount.set(r.session_id, (pCount.get(r.session_id) ?? 0) + 1);
      const cCount = new Map<string, number>();
      for (const r of (convs.data ?? []) as { session_id: string }[]) cCount.set(r.session_id, (cCount.get(r.session_id) ?? 0) + 1);
      const merged: Row[] = ((sessions.data ?? []) as Omit<Row, "participants" | "conversations">[]).map((s) => ({
        ...s,
        participants: pCount.get(s.id) ?? 0,
        conversations: cCount.get(s.id) ?? 0,
      }));
      setRows(merged);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">All sessions</h1>
      <Card>
        <CardHeader><CardTitle>{rows.length} session{rows.length === 1 ? "" : "s"}</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Code</th>
                    <th className="py-2 pr-4">Participants</th>
                    <th className="py-2 pr-4">Conversations</th>
                    <th className="py-2 pr-4">Owner</th>
                    <th className="py-2 pr-4">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="py-2 pr-4">
                        <Link to="/admin/sessions/$sessionId" params={{ sessionId: s.id }} className="hover:underline">{s.name}</Link>
                      </td>
                      <td className="py-2 pr-4"><Badge variant={s.status === "active" ? "default" : s.status === "closed" ? "secondary" : "outline"}>{s.status}</Badge></td>
                      <td className="py-2 pr-4 font-mono">{s.join_code}</td>
                      <td className="py-2 pr-4">{s.participants}</td>
                      <td className="py-2 pr-4">{s.conversations}</td>
                      <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">{s.researcher_id.slice(0, 8)}…</td>
                      <td className="py-2 pr-4 text-muted-foreground">{format(new Date(s.created_at), "MMM d, yyyy")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
