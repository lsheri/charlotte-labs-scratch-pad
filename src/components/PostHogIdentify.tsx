import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { posthog } from "@/lib/posthog";

export function PostHogIdentify() {
  const { user } = useAuth();
  useEffect(() => {
    if (user?.id) {
      posthog.identify(user.id, { email: user.email });
    } else {
      posthog.reset();
    }
  }, [user?.id, user?.email]);
  return null;
}
