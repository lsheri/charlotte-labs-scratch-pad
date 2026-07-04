import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/admin/conversations")({ component: AdminThreads });

import { getThreadDisplayName, anonymousLabel } from "@/lib/displayNames";

interface Thread {
  id: string; participant_id: string; tool: string; title: string | null;
  summary: string | null; first_captured_at: string;
  turn_count: number; last_captured_at: string; session_id: string;
}

function AdminThreads() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [openUser, setOpenUser] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("chat_threads")
        .select("id, participant_id, tool, title, summary, turn_count, first_captured_at, last_captured_at, session_id")
        .order("last_captured_at", { ascending: false })
        .limit(1000);
      const rows = (data ?? []) as Thread[];
      setThreads(rows);
      // Default to anonymous labels — admins can drill into a user to reveal.
      const map: Record<string, string> = {};
      rows.forEach((r) => { map[r.participant_id] = anonymousLabel(r.participant_id); });
      setProfiles(map);
      setLoading(false);
    })();
  }, []);

  const grouped = useMemo(() => {
    const filtered = q.trim()
      ? threads.filter(t => {
          const n = q.toLowerCase();
          return t.tool.toLowerCase().includes(n)
            || getThreadDisplayName(t).toLowerCase().includes(n)
            || (profiles[t.participant_id] ?? "").toLowerCase().includes(n)
            || t.participant_id.toLowerCase().includes(n);
        })
      : threads;
    const map = new Map<string, Thread[]>();
    for (const t of filtered) {
      const arr = map.get(t.participant_id) ?? [];
      arr.push(t);
      map.set(t.participant_id, arr);
    }
    return Array.from(map.entries()).sort((a, b) =>
      new Date(b[1][0].last_captured_at).getTime() - new Date(a[1][0].last_captured_at).getTime()
    );
  }, [threads, q, profiles]);

  const toggle = (uid: string) => setOpenUser(s => {
    const n = new Set(s); n.has(uid) ? n.delete(uid) : n.add(uid); return n;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Threads by user</h1>
        <Input placeholder="Filter by user, tool, title…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
      </div>
      <Card>
        <CardHeader><CardTitle>{grouped.length} users · {threads.length} threads</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <div className="space-y-2">
              {grouped.map(([uid, list]) => {
                const open = openUser.has(uid);
                return (
                  <div key={uid} className="rounded-md border">
                    <div className="flex w-full items-center justify-between gap-2 px-3 py-2 hover:bg-muted/50">
                      <button onClick={() => toggle(uid)} className="flex items-center gap-2 text-left flex-1">
                        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        <span className="font-medium font-mono">{profiles[uid] ?? anonymousLabel(uid)}</span>
                        <span className="text-xs text-muted-foreground font-mono">{uid.slice(0, 8)}…</span>
                      </button>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{list.length} thread{list.length === 1 ? "" : "s"}</Badge>
                        <Link to="/admin/users/$userId" params={{ userId: uid }} className="text-xs hover:underline">open user</Link>
                      </div>
                    </div>
                    {open && (
                      <div className="border-t">
                        <table className="w-full text-sm">
                          <tbody>
                            {list.map(th => (
                              <tr key={th.id} className="border-t hover:bg-muted/30">
                                <td className="py-2 px-3 w-24"><Badge variant="outline">{th.tool}</Badge></td>
                                <td className="py-2 px-3 max-w-md truncate">{getThreadDisplayName(th)}</td>
                                <td className="py-2 px-3 text-xs text-muted-foreground">{th.turn_count} msgs</td>
                                <td className="py-2 px-3 text-xs text-muted-foreground">{formatDistanceToNow(new Date(th.last_captured_at), { addSuffix: true })}</td>
                                <td className="py-2 px-3 text-right">
                                  <Link to="/admin/threads/$threadId" params={{ threadId: th.id }}
                                    className="text-xs hover:underline">open</Link>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
