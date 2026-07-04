import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { promoteToResearcher } from "@/serverfn/admin";
import { listUsersForAdmin } from "@/serverfn/admin-data";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/users/")({ component: AdminUsers });

interface Row {
  id: string;
  created_at: string;
  roles: string[];
  email: string | null;
  display_name: string | null;
  organization: string | null;
  thread_count: number;
  receipt_count: number;
  last_active_at: string | null;
}

type SortKey = "last_active" | "joined" | "threads" | "receipts" | "name";

function AdminUsers() {
  const listFn = useServerFn(listUsersForAdmin);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("last_active");

  const load = async () => {
    setLoading(true);
    try {
      const { users } = await listFn();
      setRows(users as Row[]);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const matched = needle
      ? rows.filter((r) =>
          (r.display_name ?? "").toLowerCase().includes(needle) ||
          (r.email ?? "").toLowerCase().includes(needle) ||
          (r.organization ?? "").toLowerCase().includes(needle) ||
          r.id.toLowerCase().includes(needle),
        )
      : rows;
    const sorted = [...matched];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case "joined": return +new Date(b.created_at) - +new Date(a.created_at);
        case "threads": return b.thread_count - a.thread_count;
        case "receipts": return b.receipt_count - a.receipt_count;
        case "name": return (a.display_name ?? a.email ?? "").localeCompare(b.display_name ?? b.email ?? "");
        case "last_active":
        default: {
          const av = a.last_active_at ? +new Date(a.last_active_at) : 0;
          const bv = b.last_active_at ? +new Date(b.last_active_at) : 0;
          return bv - av;
        }
      }
    });
    return sorted;
  }, [rows, q, sortBy]);

  const promoteFn = useServerFn(promoteToResearcher);
  const [promoteEmail, setPromoteEmail] = useState("");
  const [promoting, setPromoting] = useState(false);
  const handlePromote = async () => {
    const email = promoteEmail.trim();
    if (!email) return;
    setPromoting(true);
    try {
      await promoteFn({ data: { email } });
      toast.success(`Promoted ${email} to researcher`);
      setPromoteEmail("");
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setPromoting(false); }
  };

  const totalThreads = rows.reduce((s, r) => s + r.thread_count, 0);
  const totalReceipts = rows.reduce((s, r) => s + r.receipt_count, 0);
  const activeLast7 = rows.filter((r) => r.last_active_at && +new Date(r.last_active_at) > Date.now() - 7 * 24 * 3600 * 1000).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="text-xs text-muted-foreground">Identity-first admin view. Click any user to see their full activity.</p>
        </div>
        <Input placeholder="Search name, email, org…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total users" value={rows.length} />
        <KpiCard label="Active last 7 days" value={activeLast7} />
        <KpiCard label="Total threads" value={totalThreads} />
        <KpiCard label="Total workflows" value={totalReceipts} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Promote user to researcher</CardTitle></CardHeader>
        <CardContent className="flex gap-2">
          <Input type="email" placeholder="user@example.com" value={promoteEmail}
            onChange={(e) => setPromoteEmail(e.target.value)} className="max-w-sm" />
          <Button onClick={handlePromote} disabled={promoting || !promoteEmail.trim()}>Promote</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{filtered.length} user{filtered.length === 1 ? "" : "s"}</CardTitle>
          <div className="flex items-center gap-1 text-xs">
            <span className="text-muted-foreground mr-1">Sort:</span>
            {(["last_active","joined","threads","receipts","name"] as SortKey[]).map((k) => (
              <Button key={k} size="sm" variant={sortBy === k ? "default" : "ghost"} onClick={() => setSortBy(k)} className="h-7 px-2 text-xs">
                {k === "last_active" ? "Last active" : k === "joined" ? "Joined" : k === "threads" ? "Threads" : k === "receipts" ? "Workflows" : "Name"}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4">User</th>
                    <th className="py-2 pr-4">Roles</th>
                    <th className="py-2 pr-4">Threads</th>
                    <th className="py-2 pr-4">Workflows</th>
                    <th className="py-2 pr-4">Last active</th>
                    <th className="py-2 pr-4">Joined</th>
                    <th className="py-2 pr-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr key={r.id} className="border-t hover:bg-muted/30">
                      <td className="py-2 pr-4">
                        <Link to="/admin/users/$userId" params={{ userId: r.id }} className="block hover:underline">
                          <div className="font-medium">
                            {r.display_name || r.email || <span className="text-muted-foreground">(no name)</span>}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {r.email ?? "—"}{r.organization ? ` · ${r.organization}` : ""}
                          </div>
                        </Link>
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex flex-wrap gap-1">
                          {r.roles.length === 0 ? <span className="text-xs text-muted-foreground">—</span>
                            : r.roles.map((role) => (
                              <Badge key={role} variant={role === "admin" ? "default" : "secondary"}>{role}</Badge>
                            ))}
                        </div>
                      </td>
                      <td className="py-2 pr-4 tabular-nums">{r.thread_count}</td>
                      <td className="py-2 pr-4 tabular-nums">{r.receipt_count}</td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">
                        {r.last_active_at ? formatDistanceToNow(new Date(r.last_active_at), { addSuffix: true }) : "—"}
                      </td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">{format(new Date(r.created_at), "MMM d, yyyy")}</td>
                      <td className="py-2 pr-4">
                        <Link to="/admin/users/$userId" params={{ userId: r.id }}>
                          <Button variant="outline" size="sm">Open</Button>
                        </Link>
                      </td>
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

function KpiCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="py-3">
        <div className="text-xs uppercase text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}
