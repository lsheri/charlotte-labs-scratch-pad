import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export const Route = createFileRoute("/api/public/extension-status")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.replace(/^Bearer\s+/i, "").trim();
        if (!token) return json({ ok: false, error: "Missing bearer token" }, 401);

        const tokenHash = createHash("sha256").update(token).digest("hex");
        const { data: tokenRow } = await supabaseAdmin
          .from("extension_tokens")
          .select("participant_id, expires_at, revoked")
          .eq("token", tokenHash).maybeSingle();
        if (!tokenRow || tokenRow.revoked || new Date(tokenRow.expires_at) < new Date()) {
          return json({ ok: false, error: "Invalid or expired token" }, 401);
        }

        const { data: mem } = await supabaseAdmin
          .from("session_participants")
          .select("session_id, joined_at, consent_accepted_at")
          .eq("participant_id", tokenRow.participant_id)
          .not("consent_accepted_at", "is", null)
          .order("joined_at", { ascending: false })
          .limit(1).maybeSingle();

        if (!mem?.session_id) {
          return json({ ok: true, joined: false, sessionName: null, sessionId: null });
        }
        const { data: s } = await supabaseAdmin
          .from("research_sessions")
          .select("id, name, join_code, status")
          .eq("id", mem.session_id).maybeSingle();

        return json({
          ok: true,
          joined: true,
          sessionId: s?.id ?? null,
          sessionName: s?.name ?? null,
          sessionCode: s?.join_code ?? null,
          sessionStatus: s?.status ?? null,
        });
      },
    },
  },
});
