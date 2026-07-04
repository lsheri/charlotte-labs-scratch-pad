import { createFileRoute, Outlet, Link, useNavigate } from "@tanstack/react-router";
import { useResearcherGuard } from "@/lib/guards";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Loader2, LogOut } from "lucide-react";
import { CharlotteLogo } from "@/components/CharlotteLogo";

export const Route = createFileRoute("/researcher")({ component: ResearcherLayout });

function ResearcherLayout() {
  const { ready } = useResearcherGuard();
  const { signOut, hasRole } = useAuth();
  const navigate = useNavigate();

  if (!ready) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link to="/researcher" className="flex items-center gap-2 font-semibold">
            <CharlotteLogo className="h-8 w-8" />
            Charlotte Labs
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Researcher</span>
            {hasRole("admin") && (
              <Link to="/admin" className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent">
                Admin
              </Link>
            )}
            {hasRole("participant") && (
              <Link to="/participant" className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent">
                Use as participant
              </Link>
            )}
            <Button variant="ghost" size="sm" onClick={async () => { await signOut(); navigate({ to: "/auth" }); }}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
