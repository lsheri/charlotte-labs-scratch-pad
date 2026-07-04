import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Receipt as ReceiptIcon, TrendingUp, X, Fingerprint } from "lucide-react";
import { ToolLogo } from "@/components/ToolLogo";
import { getWorkflowTypeLabel, getProvenance, isVerifiedLab } from "@/lib/displayNames";
import { ProvenanceVial } from "@/components/provenance/ProvenanceVial";
import { PendingReceiptJobCard } from "@/components/receipt/PendingReceiptJobCard";
import { IncompleteJobsPanel } from "@/components/receipt/IncompleteJobsPanel";
import { EditableReceiptTitle } from "@/components/receipt/EditableReceiptTitle";
import { useActiveWorkspaceId } from "@/lib/activeWorkspace";

export const Route = createFileRoute("/participant/receipts/")({
  component: ReceiptsRoute,
});

function ReceiptsRoute() {
  const [activeWorkspaceId] = useActiveWorkspaceId();
  return <ReceiptsList classId={activeWorkspaceId ?? undefined} />;
}

interface R { id: string; tool_used: string; prompt_preview: string | null; created_at: string; metadata: any; }

const NOTE_KEY = "receipts_directional_note_dismissed_v1";

function DirectionalNote() {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setHidden(window.localStorage.getItem(NOTE_KEY) === "1");
  }, []);
  if (hidden) return null;
  return (
    <Card className="border-brand-mint/40 bg-brand-mint/5">
      <CardContent className="flex items-start gap-3 py-4 pr-2">
        <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-brand-navy" />
        <div className="flex-1 space-y-2 text-sm">
          <p className="font-semibold text-foreground">
            One receipt is a single data point — not a verdict.
          </p>
          <p className="text-muted-foreground">
            Your AI fingerprint is built from many receipts over time. Each one
            is <em>directional</em> — a snapshot of how you collaborated with
            AI in that moment. Keep generating receipts as you naturally work,
            and your Fingerprint will sharpen into a real picture of how you
            think with AI.
          </p>
          <Button asChild size="sm" variant="outline" className="border-brand-mint/50 text-brand-navy hover:bg-brand-mint/10">
            <Link to="/participant/fingerprint">
              <Fingerprint className="mr-1.5 h-3.5 w-3.5" />
              View your Fingerprint
            </Link>
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground"
          aria-label="Dismiss"
          onClick={() => {
            window.localStorage.setItem(NOTE_KEY, "1");
            setHidden(true);
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

export function ReceiptsList({ classId }: { classId?: string } = {}) {
  const { user } = useAuth();
  const [receipts, setReceipts] = useState<R[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) return;
    let receiptIdFilter: string[] | null = null;
    if (classId) {
      const { data: subs } = await supabase
        .from("assignment_submissions")
        .select("receipt_id, assignments!inner(class_id)")
        .eq("participant_id", user.id)
        .eq("assignments.class_id", classId);
      receiptIdFilter = Array.from(
        new Set(((subs ?? []) as any[]).map((s) => s.receipt_id).filter(Boolean)),
      );
      if (receiptIdFilter.length === 0) {
        setReceipts([]);
        setLoading(false);
        return;
      }
    }
    let q = supabase.from("receipts")
      .select("id, tool_used, prompt_preview, created_at, metadata")
      .eq("participant_id", user.id)
      .order("created_at", { ascending: false }).limit(200);
    if (receiptIdFilter) q = q.in("id", receiptIdFilter);
    const { data } = await q;
    setReceipts((data ?? []) as R[]);
    setLoading(false);
  }, [user, classId]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <ReceiptIcon className="h-6 w-6" /> Receipts
        </h1>
        <p className="text-sm text-muted-foreground">
          {classId
            ? "Scoped to your current workspace — only receipts submitted to this class's assignments."
            : "Analyzed AI fluency receipts you've generated from your threads."}
        </p>
      </div>
      <DirectionalNote />
      <IncompleteJobsPanel onChange={refresh} />
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : receipts.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">
          No receipts yet. Go to <Link to="/participant/threads" className="underline">Threads</Link>, select 1+ and click "Generate Receipt".
        </CardContent></Card>
      ) : (
        <div className="grid gap-2">
          {receipts.map(r => (
            <Link key={r.id} to="/participant/receipts/$receiptId" params={{ receiptId: r.id }}>
              <Card className="transition hover:border-primary/60 hover:bg-secondary/30">
                <CardContent className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0 flex items-center gap-3">
                    <ProvenanceVial variant={getProvenance(r as any)} verified={isVerifiedLab(r as any)} size="md" />
                    <ToolLogo tool={r.tool_used} size={32} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="capitalize">{r.tool_used}</Badge>
                        <Badge variant="secondary">{getWorkflowTypeLabel(r as any)}</Badge>
                        <span className="text-xs text-muted-foreground">{format(new Date(r.created_at), "MMM d, yyyy · h:mm a")}</span>
                      </div>
                      <p className="mt-1 truncate text-sm font-medium"><EditableReceiptTitle receipt={r as any} /></p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <PendingReceiptJobCard onCompleted={() => refresh()} />
    </div>
  );
}
