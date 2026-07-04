import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getExtensionToken = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getActiveTokenFor } = await import("../server/extension.server");
    const data = await getActiveTokenFor(context.userId);
    return {
      isActive: !!data,
      createdAt: data?.created_at ?? null,
      expiresAt: data?.expires_at ?? null,
    };
  });

export const issueExtensionToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { issueTokenFor } = await import("../server/extension.server");
    const data = await issueTokenFor(context.userId);
    return { token: data.token, createdAt: data.created_at };
  });

export const revokeExtensionToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { revokeAllTokensFor } = await import("../server/extension.server");
    await revokeAllTokensFor(context.userId);
    return { ok: true };
  });

export const getExtensionHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getExtensionHealthFor } = await import("../server/extension.server");
    return getExtensionHealthFor(context.userId);
  });
