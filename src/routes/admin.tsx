import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Building2, Users, MessageSquare, Receipt as ReceiptIcon, MessagesSquare, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getDepartmentOverview } from "@/serverfn/admin-overview";
import { getReceiptDisplayName, anonymousLabel } from "@/lib/displayNames";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Department View — Charlotte Labs" },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.session.user.id);
    if (!(roles ?? []).some((r) => r.role === "admin")) {
      throw redirect({ to: "/participant" });
    }
  },
  component: AdminDashboard,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">Failed to load: {error.message}</div>
  ),
});

function AdminDashboard() {
  const fetchOverview = useServerFn(getDepartmentOverview);
  const [data, setData] = useState<Awaited<ReturnType<typeof getDepartmentOverview>> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchOverview()
      .then(setData)
      .catch((e) => setErr(e?.message ?? String(e)));
  }, [fetchOverview]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-6 py-4">
          <Building2 className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold tracking-tight">Department View</h1>
          <span className="text-xs text-muted-foreground">Admin-only research surface</span>
          <div className="ml-auto">
            <Link to="/participant">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" /> Back to participant
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        {err && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="p-4 text-sm text-destructive">{err}</CardContent>
          </Card>
        )}

        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard icon={<Users className="h-4 w-4" />} label="Participants" value={data?.counts.participants} />
          <StatCard icon={<MessageSquare className="h-4 w-4" />} label="Threads" value={data?.counts.threads} />
          <StatCard icon={<ReceiptIcon className="h-4 w-4" />} label="Receipts" value={data?.counts.receipts} />
          <StatCard icon={<MessagesSquare className="h-4 w-4" />} label="Conversations" value={data?.counts.conversations} />
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Recent receipts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {!data && <div className="text-muted-foreground">Loading…</div>}
              {data?.recentReceipts.length === 0 && (
                <div className="text-muted-foreground">No receipts yet.</div>
              )}
              {data?.recentReceipts.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between gap-3 border-b pb-2 last:border-0">
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {getReceiptDisplayName({ metadata: r.metadata, created_at: r.created_at })}
                    </div>
                    <div className="text-xs text-muted-foreground">{anonymousLabel(r.user_id)}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Recent threads</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {!data && <div className="text-muted-foreground">Loading…</div>}
              {data?.recentThreads.length === 0 && (
                <div className="text-muted-foreground">No threads yet.</div>
              )}
              {data?.recentThreads.map((t: any) => (
                <div key={t.id} className="flex items-center justify-between gap-3 border-b pb-2 last:border-0">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{t.title || "Untitled thread"}</div>
                    <div className="text-xs text-muted-foreground">{anonymousLabel(t.user_id)}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(t.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <p className="text-xs text-muted-foreground">
          All identities are anonymized (Participant-XXXX). Reveal is admin-only and audited.
        </p>
      </main>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | undefined }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-md bg-primary/10 p-2 text-primary">{icon}</div>
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold">{value ?? "—"}</div>
        </div>
      </CardContent>
    </Card>
  );
}
