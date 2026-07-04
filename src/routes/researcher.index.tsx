import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Copy, Plus, Square } from "lucide-react";
import { toast } from "sonner";
import { CreateSessionDialog } from "@/components/CreateSessionDialog";
import { format } from "date-fns";

export const Route = createFileRoute("/researcher/")({ component: ResearcherSessions });

interface Session {
  id: string;
  name: string;
  description: string | null;
  join_code: string;
  status: "draft" | "active" | "closed";
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}

function ResearcherSessions() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("research_sessions")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setSessions((data ?? []) as Session[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success(`Code ${code} copied`);
  };

  const endSession = async (id: string) => {
    const { error } = await supabase
      .from("research_sessions")
      .update({ status: "closed", ends_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Session ended"); load(); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Research Sessions</h1>
          <p className="text-sm text-muted-foreground">Create a session and share the join code with participants.</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" />New session</Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : sessions.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No sessions yet. Create your first one.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {sessions.map((s) => (
            <Card key={s.id}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0">
                <Link to="/researcher/sessions/$sessionId" params={{ sessionId: s.id }} className="min-w-0 flex-1 hover:opacity-80">
                  <CardTitle className="flex items-center gap-2">
                    {s.name}
                    <Badge variant={s.status === "active" ? "default" : s.status === "closed" ? "secondary" : "outline"}>
                      {s.status}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {s.description || "No description"} · created {format(new Date(s.created_at), "MMM d, yyyy")}
                  </CardDescription>
                </Link>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => copyCode(s.join_code)}>
                    <Copy className="mr-1 h-3.5 w-3.5" />
                    {s.join_code}
                  </Button>
                  {s.status !== "closed" && (
                    <Button variant="ghost" size="sm" onClick={() => endSession(s.id)}>
                      <Square className="mr-1 h-3.5 w-3.5" />End
                    </Button>
                  )}
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      <CreateSessionDialog open={open} onOpenChange={setOpen} onCreated={load} />
    </div>
  );
}
