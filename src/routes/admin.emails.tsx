import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import { resolveEmailRoles } from "@/serverfn/email-admin";

export const Route = createFileRoute("/admin/emails")({ component: AdminEmails });

interface LogRow {
  id: string;
  message_id: string | null;
  template_name: string;
  recipient_email: string;
  status: string;
  error_message: string | null;
  created_at: string;
}
interface SuppressedRow {
  id: string;
  email: string;
  reason: string;
  created_at: string;
}

const RANGES: Record<string, number> = { "24h": 1, "7d": 7, "30d": 30 };

const STATUS_VARIANT: Record<string, "default" | "destructive" | "secondary" | "outline"> = {
  sent: "default",
  pending: "secondary",
  suppressed: "secondary",
  failed: "destructive",
  dlq: "destructive",
  bounced: "destructive",
  complained: "destructive",
};

function StatusBadge({ status }: { status: string }) {
  return <Badge variant={STATUS_VARIANT[status] ?? "outline"}>{status}</Badge>;
}

function AdminEmails() {
  const [range, setRange] = useState<keyof typeof RANGES>("7d");
  const [templateFilter, setTemplateFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [recipientQ, setRecipientQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<LogRow[]>([]);
  const [suppressed, setSuppressed] = useState<SuppressedRow[]>([]);
  const [roleMap, setRoleMap] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const resolveRoles = useServerFn(resolveEmailRoles);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - RANGES[range] * 24 * 60 * 60 * 1000).toISOString();
      const [{ data: logs }, { data: supp }] = await Promise.all([
        supabase
          .from("email_send_log")
          .select("id, message_id, template_name, recipient_email, status, error_message, created_at")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(5000),
        supabase
          .from("suppressed_emails")
          .select("id, email, reason, created_at")
          .order("created_at", { ascending: false })
          .limit(500),
      ]);
      setRows((logs ?? []) as LogRow[]);
      setSuppressed((supp ?? []) as SuppressedRow[]);
      setLoading(false);

      // Resolve recipient roles
      const emails = Array.from(
        new Set((logs ?? []).map((r: any) => (r.recipient_email || "").toLowerCase()).filter(Boolean)),
      );
      if (emails.length > 0) {
        try {
          const result = await resolveRoles({ data: { emails } });
          const m: Record<string, string[]> = {};
          for (const [email, info] of Object.entries(result as any)) {
            m[email] = (info as any).roles;
          }
          setRoleMap(m);
        } catch {
          // ignore
        }
      }
    })();
  }, [range, resolveRoles]);

  // Deduplicate by message_id, keeping the latest row (rows already sorted desc)
  const deduped = useMemo(() => {
    const seen = new Set<string>();
    const out: LogRow[] = [];
    for (const r of rows) {
      const key = r.message_id ?? r.id;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
    return out;
  }, [rows]);

  const templates = useMemo(
    () => Array.from(new Set(deduped.map((r) => r.template_name))).sort(),
    [deduped],
  );

  const filtered = useMemo(() => {
    const needle = recipientQ.trim().toLowerCase();
    return deduped.filter((r) => {
      if (templateFilter !== "all" && r.template_name !== templateFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (needle && !r.recipient_email.toLowerCase().includes(needle)) return false;
      if (roleFilter !== "all") {
        const roles = roleMap[r.recipient_email.toLowerCase()] ?? [];
        if (roleFilter === "unknown") {
          if (roles.length > 0) return false;
        } else if (!roles.includes(roleFilter)) return false;
      }
      return true;
    });
  }, [deduped, templateFilter, statusFilter, recipientQ, roleFilter, roleMap]);

  // Stats
  const stats = useMemo(() => {
    const counts = { total: filtered.length, sent: 0, failed: 0, suppressed: 0, bounced: 0, complained: 0, pending: 0 };
    for (const r of filtered) {
      if (r.status === "sent") counts.sent++;
      else if (r.status === "failed" || r.status === "dlq") counts.failed++;
      else if (r.status === "suppressed") counts.suppressed++;
      else if (r.status === "bounced") counts.bounced++;
      else if (r.status === "complained") counts.complained++;
      else if (r.status === "pending") counts.pending++;
    }
    const deliverable = counts.total - counts.suppressed;
    const deliveryRate = deliverable > 0 ? (counts.sent / deliverable) * 100 : 0;
    const bounceRate = counts.total > 0 ? (counts.bounced / counts.total) * 100 : 0;
    const complaintRate = counts.total > 0 ? (counts.complained / counts.total) * 100 : 0;
    return { ...counts, deliveryRate, bounceRate, complaintRate };
  }, [filtered]);

  // By template
  const byTemplate = useMemo(() => {
    const m = new Map<string, { template: string; total: number; sent: number; failed: number; suppressed: number; lastSent: string | null }>();
    for (const r of filtered) {
      const cur = m.get(r.template_name) ?? { template: r.template_name, total: 0, sent: 0, failed: 0, suppressed: 0, lastSent: null };
      cur.total++;
      if (r.status === "sent") cur.sent++;
      if (r.status === "failed" || r.status === "dlq") cur.failed++;
      if (r.status === "suppressed") cur.suppressed++;
      if (!cur.lastSent || r.created_at > cur.lastSent) cur.lastSent = r.created_at;
      m.set(r.template_name, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }, [filtered]);

  // By recipient (top 25)
  const byRecipient = useMemo(() => {
    const m = new Map<string, { email: string; total: number; lastStatus: string; lastSent: string }>();
    for (const r of filtered) {
      const key = r.recipient_email.toLowerCase();
      const cur = m.get(key) ?? { email: r.recipient_email, total: 0, lastStatus: r.status, lastSent: r.created_at };
      cur.total++;
      if (r.created_at > cur.lastSent) {
        cur.lastSent = r.created_at;
        cur.lastStatus = r.status;
      }
      m.set(key, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.total - a.total).slice(0, 25);
  }, [filtered]);

  const failures = useMemo(
    () =>
      filtered
        .filter((r) => ["failed", "dlq", "bounced", "complained"].includes(r.status))
        .slice(0, 20),
    [filtered],
  );

  const PAGE_SIZE = 50;
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  useEffect(() => { setPage(0); }, [templateFilter, statusFilter, recipientQ, roleFilter, range]);

  const filteredSuppressed = useMemo(() => {
    const needle = recipientQ.trim().toLowerCase();
    if (!needle) return suppressed;
    return suppressed.filter((s) => s.email.toLowerCase().includes(needle));
  }, [suppressed, recipientQ]);

  const kpi = (label: string, value: number | string, sub?: string, danger?: boolean) => (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-semibold ${danger ? "text-destructive" : ""}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Email health</h1>
          <p className="text-sm text-muted-foreground">Drill into delivery, recipients, templates, and failures.</p>
        </div>
        <Link to="/admin" className="text-sm text-muted-foreground hover:underline">← Back to overview</Link>
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Range</label>
            <div className="flex gap-1">
              {(Object.keys(RANGES) as Array<keyof typeof RANGES>).map((k) => (
                <Button key={k} size="sm" variant={range === k ? "default" : "outline"} onClick={() => setRange(k)}>
                  {k}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Template</label>
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={templateFilter} onChange={(e) => setTemplateFilter(e.target.value)}>
              <option value="all">All</option>
              {templates.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Status</label>
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All</option>
              {["sent", "pending", "failed", "dlq", "suppressed", "bounced", "complained"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Role</label>
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="participant">Participant</option>
              <option value="researcher">Researcher</option>
              <option value="admin">Admin</option>
              <option value="unknown">Unknown / external</option>
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-muted-foreground mb-1">Recipient search</label>
            <Input placeholder="email contains…" value={recipientQ} onChange={(e) => setRecipientQ(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpi("Total emails", stats.total, `${stats.deliveryRate.toFixed(1)}% delivery rate`)}
        {kpi("Sent", stats.sent)}
        {kpi("Failed", stats.failed, stats.failed > 0 ? "needs attention" : undefined, stats.failed > 0)}
        {kpi("Suppressed", stats.suppressed)}
        {kpi("Bounced", stats.bounced, `${stats.bounceRate.toFixed(2)}%`, stats.bounceRate > 2)}
        {kpi("Complained", stats.complained, `${stats.complaintRate.toFixed(2)}%`, stats.complaintRate > 0.1)}
        {kpi("Pending", stats.pending)}
        {kpi("Suppression list", suppressed.length, "all-time")}
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : (
        <>
          {/* Breakdowns */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>By template</CardTitle>
                <CardDescription>Volume and delivery per template.</CardDescription>
              </CardHeader>
              <CardContent>
                {byTemplate.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No data.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase text-muted-foreground">
                      <tr><th className="py-1 pr-2">Template</th><th>Total</th><th>Sent</th><th>Failed</th><th>Suppr.</th><th>Last</th></tr>
                    </thead>
                    <tbody>
                      {byTemplate.map((t) => (
                        <tr key={t.template} className="border-t">
                          <td className="py-1.5 pr-2 truncate max-w-[180px]">{t.template}</td>
                          <td>{t.total}</td>
                          <td>{t.sent}</td>
                          <td className={t.failed > 0 ? "text-destructive" : ""}>{t.failed}</td>
                          <td>{t.suppressed}</td>
                          <td className="text-xs text-muted-foreground">{t.lastSent ? format(new Date(t.lastSent), "MMM d HH:mm") : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top recipients</CardTitle>
                <CardDescription>Top 25 by volume in range. Click to filter.</CardDescription>
              </CardHeader>
              <CardContent>
                {byRecipient.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No data.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase text-muted-foreground">
                      <tr><th className="py-1 pr-2">Email</th><th>Role</th><th>Total</th><th>Last</th></tr>
                    </thead>
                    <tbody>
                      {byRecipient.map((r) => {
                        const roles = roleMap[r.email.toLowerCase()] ?? [];
                        return (
                          <tr key={r.email} className="border-t">
                            <td className="py-1.5 pr-2">
                              <button className="text-left hover:underline truncate max-w-[200px]" onClick={() => setRecipientQ(r.email)}>{r.email}</button>
                            </td>
                            <td>
                              {roles.length === 0 ? <span className="text-xs text-muted-foreground">external</span>
                                : roles.map((rl) => <Badge key={rl} variant="outline" className="mr-1 text-xs">{rl}</Badge>)}
                            </td>
                            <td>{r.total}</td>
                            <td><StatusBadge status={r.lastStatus} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent failures */}
          <Card>
            <CardHeader>
              <CardTitle>Recent failures</CardTitle>
              <CardDescription>Latest 20 failed, dlq, bounced, or complained.</CardDescription>
            </CardHeader>
            <CardContent>
              {failures.length === 0 ? (
                <p className="text-sm text-muted-foreground">No failures in range. 🎉</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted-foreground">
                    <tr><th className="py-1 pr-2">When</th><th>Template</th><th>Recipient</th><th>Status</th><th>Error</th></tr>
                  </thead>
                  <tbody>
                    {failures.map((f) => (
                      <tr key={f.id} className="border-t align-top">
                        <td className="py-1.5 pr-2 text-xs text-muted-foreground whitespace-nowrap">{format(new Date(f.created_at), "MMM d HH:mm")}</td>
                        <td className="pr-2">{f.template_name}</td>
                        <td className="pr-2">{f.recipient_email}</td>
                        <td className="pr-2"><StatusBadge status={f.status} /></td>
                        <td className="text-xs text-muted-foreground" title={f.error_message ?? ""}>{f.error_message ? f.error_message.slice(0, 80) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {/* Full log */}
          <Card>
            <CardHeader>
              <CardTitle>Email log</CardTitle>
              <CardDescription>{filtered.length} unique email{filtered.length === 1 ? "" : "s"} · page {page + 1}/{pageCount}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted-foreground">
                    <tr><th className="py-1 pr-2">When</th><th>Template</th><th>Recipient</th><th>Role</th><th>Status</th><th>Error</th></tr>
                  </thead>
                  <tbody>
                    {paged.map((r) => {
                      const roles = roleMap[r.recipient_email.toLowerCase()] ?? [];
                      return (
                        <tr key={r.id} className="border-t">
                          <td className="py-1.5 pr-2 text-xs text-muted-foreground whitespace-nowrap">{format(new Date(r.created_at), "MMM d HH:mm")}</td>
                          <td className="pr-2">{r.template_name}</td>
                          <td className="pr-2">{r.recipient_email}</td>
                          <td className="pr-2">
                            {roles.length === 0 ? <span className="text-xs text-muted-foreground">—</span>
                              : roles.map((rl) => <Badge key={rl} variant="outline" className="mr-1 text-xs">{rl}</Badge>)}
                          </td>
                          <td className="pr-2"><StatusBadge status={r.status} /></td>
                          <td className="text-xs text-muted-foreground max-w-[300px] truncate" title={r.error_message ?? ""}>{r.error_message ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex items-center justify-end gap-2">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</Button>
                <Button size="sm" variant="outline" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </CardContent>
          </Card>

          {/* Suppression list */}
          <Card>
            <CardHeader>
              <CardTitle>Suppression list</CardTitle>
              <CardDescription>{filteredSuppressed.length} suppressed address{filteredSuppressed.length === 1 ? "" : "es"}.</CardDescription>
            </CardHeader>
            <CardContent>
              {filteredSuppressed.length === 0 ? (
                <p className="text-sm text-muted-foreground">No suppressions.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted-foreground">
                    <tr><th className="py-1 pr-2">Email</th><th>Reason</th><th>Added</th></tr>
                  </thead>
                  <tbody>
                    {filteredSuppressed.slice(0, 100).map((s) => (
                      <tr key={s.id} className="border-t">
                        <td className="py-1.5 pr-2">{s.email}</td>
                        <td className="pr-2">{s.reason}</td>
                        <td className="text-xs text-muted-foreground">{format(new Date(s.created_at), "MMM d, yyyy")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
