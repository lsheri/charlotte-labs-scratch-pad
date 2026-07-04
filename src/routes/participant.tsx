import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useParticipantGuard } from "@/lib/guards";
import { HelpCircle, Loader2 } from "lucide-react";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { ParticipantSidebar } from "@/components/participant/ParticipantSidebar";
import { ExtensionHealthBanner } from "@/components/participant/ExtensionHealthBanner";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/participant")({ component: ParticipantLayout });

function ParticipantLayout() {
  const { ready } = useParticipantGuard();
  if (!ready) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <ParticipantSidebar />
        <SidebarInset>
          <ExtensionHealthBanner />
          <header className="flex h-12 items-center gap-2 border-b bg-background px-4">
            <SidebarTrigger />
            <div className="ml-auto">
              <Button
                asChild
                size="sm"
                variant="outline"
                className="border-brand-mint/50 text-brand-navy hover:bg-brand-mint/10 hover:text-brand-navy"
              >
                <Link to="/participant/how-it-works">
                  <HelpCircle className="mr-1.5 h-4 w-4" />
                  How it works
                </Link>
              </Button>
            </div>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-6">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
