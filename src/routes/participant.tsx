import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useParticipantGuard } from "@/lib/guards";
import { Loader2 } from "lucide-react";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { ParticipantSidebar } from "@/components/participant/ParticipantSidebar";
import { ExtensionHealthBanner } from "@/components/participant/ExtensionHealthBanner";
import { WorkspaceProvider } from "@/lib/workspace";

export const Route = createFileRoute("/participant")({ component: ParticipantLayout });

function ParticipantLayout() {
  const { ready } = useParticipantGuard();
  if (!ready) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  return (
    <WorkspaceProvider>
        <SidebarProvider>
          <div className="flex min-h-screen w-full bg-background">
            <ParticipantSidebar />
            <SidebarInset>
              <ExtensionHealthBanner />
              <header className="flex h-12 items-center gap-2 border-b bg-background px-4">
                <SidebarTrigger />
              </header>
              <main className="w-full flex-1 px-2 py-6">
                <Outlet />
              </main>
            </SidebarInset>
          </div>
        </SidebarProvider>
    </WorkspaceProvider>
  );
}
