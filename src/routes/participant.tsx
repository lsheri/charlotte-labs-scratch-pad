import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { useParticipantGuard } from "@/lib/guards";
import { HelpCircle, Loader2 } from "lucide-react";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { ParticipantSidebar } from "@/components/participant/ParticipantSidebar";
import { ExtensionHealthBanner } from "@/components/participant/ExtensionHealthBanner";
import { Button } from "@/components/ui/button";
import { WorkspaceProvider, useWorkspace } from "@/lib/workspace";
import { TourProvider, useTour } from "@/components/tour/TourProvider";

export const Route = createFileRoute("/participant")({ component: ParticipantLayout });

const TOUR_SEEN_KEY = "charlotte:tour_seen_v1";

function TourLauncher() {
  const { start, active } = useTour();
  const { ready, activeClass } = useWorkspace();

  // Only auto-start once the account's real workspace data is confirmed loaded.
  useEffect(() => {
    if (!ready || !activeClass) return;
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(TOUR_SEEN_KEY) === "1") return;
    window.localStorage.setItem(TOUR_SEEN_KEY, "1");
    const t = window.setTimeout(() => start("participant"), 600);
    return () => window.clearTimeout(t);
  }, [ready, activeClass, start]);

  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1.5 text-muted-foreground"
      disabled={!ready || !!active}
      onClick={() => start("participant")}
    >
      <HelpCircle className="h-4 w-4" />
      Take the tour
    </Button>
  );
}

function ParticipantLayout() {
  const { ready } = useParticipantGuard();
  if (!ready) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  return (
    <WorkspaceProvider>
      <TourProvider>
        <SidebarProvider>
          <div className="flex min-h-screen w-full bg-background">
            <ParticipantSidebar />
            <SidebarInset>
              <ExtensionHealthBanner />
              <header className="flex h-12 items-center gap-2 border-b bg-background px-4">
                <SidebarTrigger />
                <div className="ml-auto">
                  <TourLauncher />
                </div>
              </header>
              <main className="w-full flex-1 px-2 py-6">
                <Outlet />
              </main>
            </SidebarInset>
          </div>
        </SidebarProvider>
      </TourProvider>
    </WorkspaceProvider>
  );
}
