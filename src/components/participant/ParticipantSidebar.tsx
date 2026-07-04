import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Home, MessageSquare, Receipt, Plug, Fingerprint, LogOut, Plus, Workflow, Briefcase, Sparkles } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { CharlotteLogo } from "@/components/CharlotteLogo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { getExtensionHealth } from "@/serverfn/extension";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";

const groups = [
  {
    label: "Workspace",
    items: [
      { title: "Home", url: "/participant", icon: Home, exact: true },
      { title: "Workspaces", url: "/participant/workspaces", icon: Briefcase },
      { title: "Threads", url: "/participant/threads", icon: MessageSquare },
      { title: "Receipts", url: "/participant/receipts", icon: Receipt },
      { title: "Workflows", url: "/participant/workflows", icon: Workflow },
      { title: "Demo", url: "/participant/demo", icon: Sparkles },
    ],
  },
  {
    label: "Tools",
    items: [
      { title: "Extension", url: "/participant/extension", icon: Plug, hasHealthDot: true },
      { title: "Fingerprint", url: "/participant/fingerprint", icon: Fingerprint },
    ],
  },
];

export function ParticipantSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { user, signOut, hasRole } = useAuth();
  const fetchHealth = useServerFn(getExtensionHealth);
  const [healthStatus, setHealthStatus] = useState<"green" | "amber" | "red" | "unknown" | null>(null);

  useEffect(() => {
    fetchHealth().then((h) => setHealthStatus(h.status)).catch(() => {});
  }, [fetchHealth]);

  const isActive = (url: string, exact?: boolean) =>
    exact ? path === url : path === url || path.startsWith(url + "/");

  const dotColor = (s: typeof healthStatus) =>
    s === "green" ? "bg-emerald-500"
    : s === "amber" ? "bg-amber-500"
    : s === "red" ? "bg-destructive"
    : "bg-muted-foreground/40";

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader>
        <Link to="/participant" className="flex items-center gap-2 px-2 py-2">
          <CharlotteLogo className="h-7 w-7 shrink-0" />
          {!collapsed && <span className="font-semibold tracking-tight">Charlotte Labs</span>}
        </Link>
        {!collapsed && (
          <Link to="/participant/extension" className="px-2">
            <Button size="sm" className="w-full justify-start gap-2">
              <Plus className="h-4 w-4" /> Log AI Session
            </Button>
          </Link>
        )}
      </SidebarHeader>
      <SidebarContent>
        {groups.map((g) => (
          <SidebarGroup key={g.label}>
            {!collapsed && <SidebarGroupLabel>{g.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map((it: any) => (
                  <SidebarMenuItem key={it.url}>
                    <SidebarMenuButton asChild isActive={isActive(it.url, it.exact)}>
                      <Link to={it.url} className="flex items-center gap-3">
                        <it.icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span className="flex-1">{it.title}</span>}
                        {it.hasHealthDot && healthStatus && healthStatus !== "green" && (
                          <span
                            className={`h-2 w-2 rounded-full ${dotColor(healthStatus)} ${collapsed ? "ml-0" : "ml-auto"}`}
                            aria-label={`Extension status: ${healthStatus}`}
                          />
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
        {(hasRole("admin") || hasRole("researcher")) && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel>Role</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {hasRole("researcher") && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <Link to="/researcher">{collapsed ? "P" : "Proctor"}</Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {hasRole("admin") && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <Link to="/admin">{collapsed ? "A" : "Admin"}</Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
            {(user?.email ?? "?").slice(0, 1).toUpperCase()}
          </div>
          {!collapsed && (
            <div className="flex-1 truncate text-xs">
              <div className="truncate font-medium">{user?.email}</div>
            </div>
          )}
          <Button variant="ghost" size="icon" onClick={() => signOut()} aria-label="Log out">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
