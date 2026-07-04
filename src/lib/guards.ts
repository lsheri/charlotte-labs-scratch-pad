import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth, type AppRole } from "./auth";

function useRoleGuard(required: AppRole) {
  const { user, roles, role, loading, hasRole } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    if (roles.length === 0) {
      navigate({ to: "/onboarding" });
      return;
    }
    if (!hasRole(required)) {
      const dest = role === "admin" ? "/admin" : role === "researcher" ? "/researcher" : "/participant";
      navigate({ to: dest });
    }
  }, [user, roles, role, loading, required, hasRole, navigate]);
  return { ready: !loading && !!user && hasRole(required) };
}

export const useAdminGuard = () => useRoleGuard("admin");
export const useResearcherGuard = () => useRoleGuard("researcher");
export const useParticipantGuard = () => useRoleGuard("participant");
