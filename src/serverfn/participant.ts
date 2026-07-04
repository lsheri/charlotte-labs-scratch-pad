import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const deleteMyData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { deleteAllForUser } = await import("../server/participant.server");
    const deleted = await deleteAllForUser(context.userId);
    return { ok: true, deleted };
  });

export const createPersonalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { ensurePersonalSession } = await import("../server/participant.server");
    return ensurePersonalSession(context.userId);
  });

export const getCaptureTarget = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getActiveCaptureTarget } = await import("../server/participant.server");
    const target = await getActiveCaptureTarget(context.userId);
    return { target };
  });
