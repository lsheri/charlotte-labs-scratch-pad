import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import { listClassSidebar } from "@/serverfn/assignments";
import { getActiveWorkspaceId, setActiveWorkspaceId } from "@/lib/activeWorkspace";

export type WorkspaceClass = {
  id: string;
  name: string;
  courseCode: string | null;
  assignments: { id: string; code: string; title: string; dueAt: string | null }[];
};

interface WorkspaceState {
  classes: WorkspaceClass[];
  personalSessionId: string | null;
  /** Resolved class id for scoping queries — never a stale/unknown id. */
  activeWorkspaceId: string | null;
  activeClass: WorkspaceClass | null;
  /** True once the class list has been fetched (success or failure). */
  ready: boolean;
  error: string | null;
  reload: () => void;
  setWorkspace: (id: string | null) => void;
}

const Ctx = createContext<WorkspaceState | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const fetchClasses = useServerFn(listClassSidebar);
  const [classes, setClasses] = useState<WorkspaceClass[]>([]);
  const [personalSessionId, setPersonalSessionId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stored, setStored] = useState<string | null>(() => getActiveWorkspaceId());
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setError(null);
    fetchClasses()
      .then((r: any) => {
        if (cancelled) return;
        setClasses((r?.classes ?? []) as WorkspaceClass[]);
        setPersonalSessionId(r?.personalSessionId ?? null);
        setReady(true);
      })
      .catch((e: any) => {
        if (cancelled) return;
        // Surfacing this matters: a swallowed failure here used to leave every
        // class-scoped page silently empty.
        console.error("[workspace] failed to load classes", e);
        setError(e?.message ?? "Could not load your classes.");
        setReady(true);
      });
    return () => { cancelled = true; };
  }, [user, fetchClasses, nonce]);

  // Resolve the effective workspace against real data. A persisted id that is
  // not one of the account's classes (e.g. the Personal workspace id left over
  // from an older build) must never be used to scope class queries.
  const activeWorkspaceId = useMemo(() => {
    if (!ready) return null;
    if (classes.length === 1) return classes[0]!.id;
    if (stored && classes.some((c) => c.id === stored)) return stored;
    return classes[0]?.id ?? null;
  }, [ready, classes, stored]);

  useEffect(() => {
    if (!ready) return;
    if (activeWorkspaceId && activeWorkspaceId !== stored) {
      setActiveWorkspaceId(activeWorkspaceId);
      setStored(activeWorkspaceId);
    }
  }, [ready, activeWorkspaceId, stored]);

  const setWorkspace = useCallback((id: string | null) => {
    setActiveWorkspaceId(id);
    setStored(id);
  }, []);

  const activeClass = useMemo(
    () => classes.find((c) => c.id === activeWorkspaceId) ?? null,
    [classes, activeWorkspaceId],
  );

  return (
    <Ctx.Provider
      value={{
        classes, personalSessionId, activeWorkspaceId, activeClass,
        ready, error, reload, setWorkspace,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useWorkspace(): WorkspaceState {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useWorkspace must be used inside WorkspaceProvider");
  }
  return ctx;
}
