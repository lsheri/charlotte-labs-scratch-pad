import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  if (!(data ?? []).some((r: any) => r.role === "admin")) {
    throw new Error("Forbidden: admin only");
  }
}

export const getDepartmentOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [participants, threads, receipts, conversations, recentReceipts, recentThreads] =
      await Promise.all([
        supabaseAdmin.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "participant"),
        supabaseAdmin.from("chat_threads").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("receipts").select("id", { count: "exact", head: true }),
        supabaseAdmin.from("ai_conversations").select("id", { count: "exact", head: true }),
        supabaseAdmin
          .from("receipts")
          .select("id, user_id, metadata, created_at")
          .order("created_at", { ascending: false })
          .limit(10),
        supabaseAdmin
          .from("chat_threads")
          .select("id, user_id, title, created_at")
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

    return {
      counts: {
        participants: participants.count ?? 0,
        threads: threads.count ?? 0,
        receipts: receipts.count ?? 0,
        conversations: conversations.count ?? 0,
      },
      recentReceipts: recentReceipts.data ?? [],
      recentThreads: recentThreads.data ?? [],
    };
  });
