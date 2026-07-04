import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const bodySchema = z.object({
  kind: z.enum(["outreach", "bug"]),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255),
  reason: z.string().trim().min(1).max(80),
  message: z.string().trim().max(2000).optional().nullable(),
  page_url: z.string().trim().max(500).optional().nullable(),
  referrer: z.string().trim().max(500).optional().nullable(),
  user_agent: z.string().trim().max(500).optional().nullable(),
  viewport: z.string().trim().max(40).optional().nullable(),
  user_id: z.string().uuid().optional().nullable(),
});

export const Route = createFileRoute("/api/public/team-outreach")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const parsed = bodySchema.safeParse(body);
        if (!parsed.success) {
          return Response.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
        }
        const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!SUPABASE_URL || !SERVICE_KEY) {
          console.error("[team-outreach] missing supabase env");
          return new Response("Server misconfigured", { status: 500 });
        }
        const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
        const { error } = await admin.from("team_outreach").insert({
          kind: parsed.data.kind,
          name: parsed.data.name,
          email: parsed.data.email,
          reason: parsed.data.reason,
          message: parsed.data.message ?? null,
          page_url: parsed.data.page_url ?? null,
          referrer: parsed.data.referrer ?? null,
          user_agent: parsed.data.user_agent ?? null,
          viewport: parsed.data.viewport ?? null,
          user_id: parsed.data.user_id ?? null,
        });
        if (error) {
          console.error("[team-outreach] insert failed", error);
          return new Response("Insert failed", { status: 500 });
        }
        return Response.json({ ok: true });
      },
    },
  },
});
