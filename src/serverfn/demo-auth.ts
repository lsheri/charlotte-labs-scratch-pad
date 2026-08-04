import { createServerFn } from "@tanstack/react-start";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Demo-only entry gate.
 *
 * This deployment is a self-guided investor/partner demo, not a multi-tenant
 * product. A single shared passcode unlocks the hero account. The credentials
 * never reach the client: the server mints a one-time magic-link token hash
 * that the browser exchanges for a session via `verifyOtp`.
 */
const DEMO_EMAIL = "liam@charlotte-labs.com";

function matches(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export const redeemDemoCode = createServerFn({ method: "POST" })
  .inputValidator((data: { code: string }) => data)
  .handler(async ({ data }) => {
    const expected = process.env["DEMO_ACCESS_CODE"] ?? "demo2026";
    if (!data?.code || !matches(data.code.trim(), expected)) {
      return { ok: false as const, error: "That code isn't right." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: DEMO_EMAIL,
    });
    if (error || !link?.properties?.hashed_token) {
      console.error("[demo-auth] generateLink failed", error);
      return { ok: false as const, error: "Demo sign-in is temporarily unavailable." };
    }

    return { ok: true as const, tokenHash: link.properties.hashed_token };
  });
