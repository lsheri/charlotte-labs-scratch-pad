import { createFileRoute, Outlet, Link, useNavigate } from "@tanstack/react-router";
import { useAdminGuard } from "@/lib/guards";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, LogOut, LayoutDashboard, Users, FolderKanban, MessageSquare, Mail, Megaphone, Activity } from "lucide-react";
import { CharlotteLogo } from "@/components/CharlotteLogo";

export const Route = createFileRoute("/admin")({ component: AdminLayout });

function AdminLayout() {
  const { ready } = useAdminGuard();
  const { signOut } = useAuth();
  const navigate = useNavigate();

  if (!ready) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const navCls = "rounded-md px-3 py-1.5 text-sm hover:bg-accent";

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3">
          <Link to="/admin" className="flex items-center gap-2 font-semibold">
            <CharlotteLogo className="h-8 w-8" />
            Charlotte Admin
            <Badge variant="secondary" className="ml-1">admin</Badge>
          </Link>
          <nav className="hidden gap-1 md:flex">
            <Link to="/admin" activeOptions={{ exact: true }} activeProps={{ className: "bg-accent" }} className={navCls}>
              <LayoutDashboard className="mr-1 inline h-4 w-4" />Overview
            </Link>
            <Link to="/admin/users" activeProps={{ className: "bg-accent" }} className={navCls}>
              <Users className="mr-1 inline h-4 w-4" />Users
            </Link>
            <Link to="/admin/sessions" activeProps={{ className: "bg-accent" }} className={navCls}>
              <FolderKanban className="mr-1 inline h-4 w-4" />Sessions
            </Link>
            <Link to="/admin/conversations" activeProps={{ className: "bg-accent" }} className={navCls}>
              <MessageSquare className="mr-1 inline h-4 w-4" />Conversations
            </Link>
            <Link to="/admin/receipt-runs" activeProps={{ className: "bg-accent" }} className={navCls}>
              <Activity className="mr-1 inline h-4 w-4" />Run diagnostics
            </Link>
            <Link to="/admin/emails" activeProps={{ className: "bg-accent" }} className={navCls}>
              <Mail className="mr-1 inline h-4 w-4" />Emails
            </Link>
            <Link to="/admin/team-outreach" activeProps={{ className: "bg-accent" }} className={navCls}>
              <Megaphone className="mr-1 inline h-4 w-4" />Outreach
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/researcher" className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent">Researcher view</Link>
            <Link to="/participant" className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent">Participant view</Link>
            <Button variant="ghost" size="sm" onClick={async () => { await signOut(); navigate({ to: "/auth" }); }}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
