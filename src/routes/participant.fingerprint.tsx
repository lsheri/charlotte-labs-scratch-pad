import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Briefcase, GraduationCap } from "lucide-react";
import { CharlotteWeb } from "@/components/web/CharlotteWeb";
import { WorkflowsSection } from "@/components/web/WorkflowsSection";

export const Route = createFileRoute("/participant/fingerprint")({ component: FingerprintPage });

interface SessionOpt { id: string; name: string; join_code: string }

const MEDIA_LEGEND = [
  { label: "Text", color: "hsl(213 80% 55%)" },
  { label: "Code", color: "hsl(145 63% 45%)" },
  { label: "Image", color: "hsl(330 80% 60%)" },
  { label: "Data", color: "hsl(174 70% 42%)" },
  { label: "App", color: "hsl(240 55% 58%)" },
];

function FingerprintPage() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<SessionOpt[]>([]);
  const [sessionId, setSessionId] = useState<string>("all");

  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data: m } = await supabase
        .from("session_participants")
        .select("session_id, joined_at")
        .eq("participant_id", user.id)
        .not("consent_accepted_at", "is", null)
        .order("joined_at", { ascending: false });
      const ids = (m ?? []).map(x => x.session_id);
      if (!ids.length) return;
      const { data: s } = await supabase
        .from("research_sessions").select("id, name, join_code").in("id", ids);
      setSessions((s ?? []) as SessionOpt[]);
    })();
  }, [user]);

  const effectiveSessionId = sessionId === "all" ? null : sessionId;

  return (
    <div className="space-y-6">
      <header className="text-center pt-2 md:pt-4 pb-2">
        <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-3">
          Your AI Fingerprint
        </h1>
        <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Every tool you touch. Every project you build. One living map of how you collaborate with AI.
        </p>
      </header>

      {sessions.length > 0 && (
        <div className="flex justify-end">
          <div className="w-72">
            <Select value={sessionId} onValueChange={setSessionId}>
              <SelectTrigger><SelectValue placeholder="All sessions" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sessions</SelectItem>
                {sessions.map(s => <SelectItem key={s.id} value={s.id}>{s.name} ({s.join_code})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      <div style={{ height: "clamp(420px, 65vh, 760px)" }}>
        <CharlotteWeb participantId={user?.id ?? null} sessionId={effectiveSessionId} />
      </div>

      <div className="flex flex-wrap justify-center gap-4 py-2">
        {MEDIA_LEGEND.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full" style={{ background: item.color }} />
            <span className="text-xs text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
        <div className="flex items-start gap-3 bg-card border rounded-lg p-5">
          <Briefcase className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold">Show your AI study skills</p>
            <p className="text-xs text-muted-foreground mt-1">Evidence of how you learn with AI — verification habits, independent thinking, coverage.</p>
          </div>
        </div>
        <div className="flex items-start gap-3 bg-card border rounded-lg p-5">
          <GraduationCap className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold">Educators see where to coach you</p>
            <p className="text-xs text-muted-foreground mt-1">Clear signals on which AI collaboration skills to develop next.</p>
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground pb-2">
        Click any node to explore connections.
      </p>

      <WorkflowsSection participantId={user?.id ?? null} sessionId={effectiveSessionId} />
    </div>
  );
}
