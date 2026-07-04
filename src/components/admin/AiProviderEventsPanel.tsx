import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, CheckCircle2, ArrowRightLeft } from "lucide-react";

interface ProviderEvent {
  id: string;
  created_at: string;
  label: string;
  provider: string;
  model: string | null;
  status: "ok" | "fallback" | "error" | "content_filter";
  http_status: number | null;
  latency_ms: number | null;
  error_message: string | null;
  receipt_id: string | null;
}

export function AiProviderEventsPanel() {
  const [events, setEvents] = useState<ProviderEvent[] | null>(null);
  const [counts, setCounts] = useState<{ fallback24h: number; error24h: number }>({ fallback24h: 0, error24h: 0 });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [{ data: recent }, { count: fbCount }, { count: errCount }] = await Promise.all([
        supabase.from("ai_provider_events" as any)
          .select("id, created_at, label, provider, model, status, http_status, latency_ms, error_message, receipt_id")
          .order("created_at", { ascending: false })
          .limit(20),
        supabase.from("ai_provider_events" as any)
          .select("id", { count: "exact", head: true })
          .eq("status", "fallback")
          .gte("created_at", dayAgo),
        supabase.from("ai_provider_events" as any)
          .select("id", { count: "exact", head: true })
          .in("status", ["error", "content_filter"])
          .gte("created_at", dayAgo),
      ]);
      if (cancelled) return;
      setEvents((recent ?? []) as unknown as ProviderEvent[]);
      setCounts({ fallback24h: fbCount ?? 0, error24h: errCount ?? 0 });
    };
    load();
    const id = window.setInterval(load, 60_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, []);

  const statusBadge = (s: ProviderEvent["status"]) => {
    if (s === "ok") return <Badge variant="secondary"><CheckCircle2 className="mr-1 h-3 w-3" />ok</Badge>;
    if (s === "fallback") return <Badge variant="default"><ArrowRightLeft className="mr-1 h-3 w-3" />fallback</Badge>;
    if (s === "content_filter") return <Badge variant="destructive">content filter</Badge>;
    return <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" />error</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">AI Provider Health</CardTitle>
        <CardDescription>
          OpenAI primary, Lovable AI Gateway fallback. Last 24h:
          {" "}<span className="font-medium">{counts.fallback24h}</span> fallbacks,
          {" "}<span className={counts.error24h > 0 ? "font-medium text-destructive" : "font-medium"}>{counts.error24h}</span> errors.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {events === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No provider events recorded yet — OpenAI is handling everything cleanly.</p>
        ) : (
          <div className="space-y-2">
            {events.map(e => (
              <div key={e.id} className="flex items-start justify-between gap-3 rounded border bg-card p-2 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {statusBadge(e.status)}
                    <span className="font-mono text-[11px] text-muted-foreground">{e.label}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">{e.provider}{e.model ? ` (${e.model})` : ""}</span>
                  </div>
                  {e.error_message && (
                    <p className="mt-1 truncate text-muted-foreground" title={e.error_message}>{e.error_message}</p>
                  )}
                </div>
                <div className="shrink-0 text-right text-muted-foreground">
                  <div>{formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}</div>
                  {e.latency_ms != null && <div>{e.latency_ms} ms</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
