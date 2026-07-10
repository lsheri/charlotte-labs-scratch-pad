import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "researcher" | "participant";

interface AuthState {
  user: User | null;
  session: Session | null;
  /** All roles assigned to the current user. */
  roles: AppRole[];
  /** Primary role for default redirects: admin > researcher > participant. */
  role: AppRole | null;
  hasRole: (r: AppRole) => boolean;
  isAdmin: boolean;
  isResearcher: boolean;
  isParticipant: boolean;
  loading: boolean;
  refreshRole: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | undefined>(undefined);

function pickPrimary(roles: AppRole[]): AppRole | null {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("researcher")) return "researcher";
  if (roles.includes("participant")) return "participant";
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRoles = async (userId: string) => {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const list = ((data ?? []).map((r) => r.role) as AppRole[]).filter(Boolean);
    setRoles(list);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) {
        setTimeout(() => loadRoles(s.user.id), 0);
      } else {
        setRoles([]);
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) loadRoles(s.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const refreshRole = async () => {
    if (session?.user) await loadRoles(session.user.id);
  };

  const signOut = async () => {
    try {
      const { posthog } = await import("@/lib/posthog");
      posthog.capture("signed_out");
      posthog.reset();
    } catch {}
    await supabase.auth.signOut();
  };

  const role = pickPrimary(roles);

  return (
    <AuthCtx.Provider
      value={{
        user: session?.user ?? null,
        session,
        roles,
        role,
        hasRole: (r) => roles.includes(r),
        isAdmin: roles.includes("admin"),
        isResearcher: roles.includes("researcher"),
        isParticipant: roles.includes("participant"),
        loading,
        refreshRole,
        signOut,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
