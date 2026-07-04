import { useEffect, useState } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  Home, MessageSquare, Receipt, Plug, Fingerprint, LogOut, Plus,
  Briefcase, GraduationCap, ChevronRight, FileText, Check, ChevronsUpDown, User,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { CharlotteLogo } from "@/components/CharlotteLogo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { getExtensionHealth } from "@/serverfn/extension";
import { listClassSidebar } from "@/serverfn/assignments";
import { useActiveWorkspaceId } from "@/lib/activeWorkspace";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubItem,
  SidebarMenuSubButton, SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";

const toolsGroup = {
  label: "Tools",
  items: [
    { title: "Extension", url: "/participant/extension", icon: Plug, hasHealthDot: true },
    { title: "Fingerprint", url: "/participant/fingerprint", icon: Fingerprint },
  ],
};

type SidebarClass = {
  id: string;
  name: string;
  courseCode: string | null;
  assignments: { id: string; code: string; title: string; dueAt: string | null }[];
};

export function ParticipantSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const fetchHealth = useServerFn(getExtensionHealth);
  const fetchClasses = useServerFn(listClassSidebar);
  const [healthStatus, setHealthStatus] = useState<"green" | "amber" | "red" | "unknown" | null>(null);
  const [classes, setClasses] = useState<SidebarClass[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useActiveWorkspaceId();

  useEffect(() => {
    fetchHealth().then((h) => setHealthStatus(h.status)).catch(() => {});
    fetchClasses().then((r) => {
      const list = (r.classes ?? []) as SidebarClass[];
      setClasses(list);
      // Default to first class workspace if user hasn't explicitly chosen one
      try {
        const chosen = window.localStorage.getItem("charlotte:workspaceChosen");
        if (!chosen && list.length > 0 && !activeWorkspaceId) {
          setActiveWorkspaceId(list[0].id);
        }
      } catch {}
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchHealth, fetchClasses]);

  useEffect(() => {
    const m = path.match(/^\/participant\/department\/([^/]+)/);
    if (m && m[1] !== activeWorkspaceId) setActiveWorkspaceId(m[1]);
  }, [path, activeWorkspaceId, setActiveWorkspaceId]);


  const activeClass = activeWorkspaceId
    ? classes.find((c) => c.id === activeWorkspaceId) ?? null
    : null;
  const activeLabel = activeClass ? (activeClass.courseCode ?? activeClass.name) : "Personal";
  const threadsUrl = activeClass ? `/participant/department/${activeClass.id}/threads` : "/participant/threads";
  const receiptsUrl = activeClass ? `/participant/department/${activeClass.id}/receipts` : "/participant/receipts";
  const homeUrl = activeClass ? `/participant/department/${activeClass.id}` : "/participant";

  const workspaceGroup = {
    label: "Workspace",
    items: [
      { title: "Home", url: homeUrl, icon: Home, exact: !activeClass },
      { title: "Workspaces", url: "/participant/workspaces", icon: Briefcase },
      { title: activeClass ? "Threads" : "All Threads", url: threadsUrl, icon: MessageSquare },
      { title: activeClass ? "Receipts" : "All Receipts", url: receiptsUrl, icon: Receipt },
    ],
  };

  const isActive = (url: string, exact?: boolean) =>
    exact ? path === url : path === url || path.startsWith(url + "/");

  const dotColor = (s: typeof healthStatus) =>
    s === "green" ? "bg-emerald-500"
    : s === "amber" ? "bg-amber-500"
    : s === "red" ? "bg-destructive"
    : "bg-muted-foreground/40";

  const pickWorkspace = (id: string | null) => {
    try { window.localStorage.setItem("charlotte:workspaceChosen", "1"); } catch {}
    setActiveWorkspaceId(id);
    if (id) navigate({ to: `/participant/department/${id}` as any });
    else navigate({ to: "/participant" });
  };


  const renderGroup = (g: typeof workspaceGroup) => (
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
  );

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader>
        <Link to="/participant" className="flex items-center gap-2 px-2 py-2">
          <CharlotteLogo className="h-7 w-7 shrink-0" />
          {!collapsed && <span className="font-semibold tracking-tight">Charlotte Labs</span>}
        </Link>
        {!collapsed && (
          <div className="px-2 pb-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="w-full rounded-md border bg-background px-2.5 py-2 text-left transition hover:bg-accent"
                  aria-label="Switch workspace"
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Working in
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    {activeClass ? (
                      <GraduationCap className="h-4 w-4 shrink-0 text-primary" />
                    ) : (
                      <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="flex-1 truncate text-sm font-semibold">{activeLabel}</span>
                    <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel className="text-xs">Switch workspace</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => pickWorkspace(null)} className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">Personal</span>
                  {!activeClass && <Check className="h-4 w-4 text-primary" />}
                </DropdownMenuItem>
                {classes.length > 0 && <DropdownMenuSeparator />}
                {classes.map((c) => (
                  <DropdownMenuItem
                    key={c.id}
                    onSelect={() => pickWorkspace(c.id)}
                    className="flex items-center gap-2"
                  >
                    <GraduationCap className="h-4 w-4 text-primary" />
                    <span className="flex-1 truncate">{c.courseCode ?? c.name}</span>
                    {activeWorkspaceId === c.id && <Check className="h-4 w-4 text-primary" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        {!collapsed && (
          <Link to="/participant/extension" className="px-2">
            <Button size="sm" className="w-full justify-start gap-2">
              <Plus className="h-4 w-4" /> Log AI Session
            </Button>
          </Link>
        )}
      </SidebarHeader>
      <SidebarContent>
        {renderGroup(workspaceGroup)}

        {classes.length > 0 && (
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel>Classes</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {classes.map((c) => {
                  const overviewUrl = `/participant/department/${c.id}`;
                  const inClass = path.startsWith(overviewUrl);
                  return (
                    <ClassEntry
                      key={c.id}
                      c={c}
                      collapsed={collapsed}
                      defaultOpen={inClass}
                      overviewUrl={overviewUrl}
                      isActive={isActive}
                    />
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {renderGroup(toolsGroup)}
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

function ClassEntry({
  c, collapsed, defaultOpen, overviewUrl, isActive,
}: {
  c: SidebarClass;
  collapsed: boolean;
  defaultOpen: boolean;
  overviewUrl: string;
  isActive: (url: string, exact?: boolean) => boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => { if (defaultOpen) setOpen(true); }, [defaultOpen]);

  if (collapsed) {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton asChild isActive={isActive(overviewUrl)}>
          <Link to={overviewUrl} className="flex items-center gap-3">
            <GraduationCap className="h-4 w-4 shrink-0" />
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton className="w-full">
            <GraduationCap className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">{c.courseCode ?? c.name}</span>
            <ChevronRight
              className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`}
            />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            <SidebarMenuSubItem>
              <SidebarMenuSubButton asChild isActive={isActive(overviewUrl, true)}>
                <Link to={overviewUrl}>Overview</Link>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
            <SidebarMenuSubItem>
              <SidebarMenuSubButton asChild isActive={isActive(`${overviewUrl}/threads`)}>
                <Link to={`${overviewUrl}/threads` as any} className="flex items-center gap-2">
                  <MessageSquare className="h-3 w-3 shrink-0 opacity-60" />
                  <span>Threads</span>
                </Link>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
            <SidebarMenuSubItem>
              <SidebarMenuSubButton asChild isActive={isActive(`${overviewUrl}/receipts`)}>
                <Link to={`${overviewUrl}/receipts` as any} className="flex items-center gap-2">
                  <Receipt className="h-3 w-3 shrink-0 opacity-60" />
                  <span>Receipts</span>
                </Link>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
            {c.assignments.length > 0 && (
              <div className="mt-1 px-2 pt-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                Assignments
              </div>
            )}
            {c.assignments.map((a) => {
              const url = `/participant/department/${c.id}/assignments/${a.id}`;
              return (
                <SidebarMenuSubItem key={a.id}>
                  <SidebarMenuSubButton asChild isActive={isActive(url)}>
                    <Link to={url} className="flex items-center gap-2">
                      <FileText className="h-3 w-3 shrink-0 opacity-60" />
                      <span className="font-medium">{a.code}</span>
                      <span className="truncate text-muted-foreground">{a.title.replace(/^.*—\s*/, "")}</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}
