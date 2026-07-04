import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Bug, MessageCircle, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/admin/team-outreach")({ component: TeamOutreachAdmin });

interface Row {
  id: string;
  kind: string;
  name: string;
  email: string;
  reason: string;
  message: string | null;
  page_url: string | null;
  referrer: string | null;
  user_agent: string | null;
  viewport: string | null;
  user_id: string | null;
  created_at: string;
}

function TeamOutreachAdmin() {
  const [filter, setFilter] = useState<"all" | "outreach" | "bug">("all");

  const { data: rows, isLoading } = useQuery({
    queryKey: ["team-outreach", filter],
    queryFn: async () => {
      let q = supabase.from("team_outreach").select("*").order("created_at", { ascending: false }).limit(500);
      if (filter !== "all") q = q.eq("kind", filter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Team outreach & bug reports</h1>
          <p className="text-sm text-muted-foreground">Submissions from the research banner.</p>
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="outreach"><MessageCircle className="mr-1 h-3 w-3" />Outreach</TabsTrigger>
            <TabsTrigger value="bug"><Bug className="mr-1 h-3 w-3" />Bugs</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : !rows || rows.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No submissions yet.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">{r.name}</CardTitle>
                  <a href={`mailto:${r.email}`} className="text-xs text-muted-foreground hover:underline">{r.email}</a>
                  <Badge variant={r.kind === "bug" ? "destructive" : "secondary"}>
                    {r.kind === "bug" ? <Bug className="mr-1 h-3 w-3" /> : <MessageCircle className="mr-1 h-3 w-3" />}
                    {r.kind}
                  </Badge>
                  <Badge variant="outline">{r.reason}</Badge>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {r.message && <p className="whitespace-pre-wrap">{r.message}</p>}
                <div className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
                  {r.page_url && (
                    <div className="truncate">
                      Page:{" "}
                      <a href={r.page_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">
                        {r.page_url}<ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                  {r.viewport && <div>Viewport: {r.viewport}</div>}
                  {r.referrer && <div className="truncate">Referrer: {r.referrer}</div>}
                  {r.user_agent && <div className="truncate" title={r.user_agent}>UA: {r.user_agent}</div>}
                  {r.user_id && <div className="truncate">User: {r.user_id}</div>}
                </div>
                {r.kind === "bug" && (
                  <Button asChild size="sm" variant="outline">
                    <a href={`mailto:${r.email}?subject=Re: your bug report`}>Reply</a>
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
