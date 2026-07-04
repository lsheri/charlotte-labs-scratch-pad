import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Lists every workspace the participant belongs to (consented).
 * Personal workspace is always first; research workspaces follow.
 */
export const listMyWorkspaces = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Make sure personal workspace exists.
    const { ensurePersonalSession } = await import("@/server/participant.server");
    await ensurePersonalSession(userId);

    const { data: memberships, error } = await supabase
      .from("session_participants")
      .select(`
        session_id, joined_at, consent_accepted_at,
        research_sessions!inner(id, name, description, kind, status, join_code, researcher_id, starts_at, ends_at)
      `)
      .eq("participant_id", userId)
      .not("consent_accepted_at", "is", null);

    if (error) throw new Error(error.message);

    const workspaces = (memberships ?? []).map((m: any) => ({
      id: m.research_sessions.id,
      name: m.research_sessions.name,
      description: m.research_sessions.description,
      kind: m.research_sessions.kind as "research" | "personal",
      status: m.research_sessions.status,
      joinCode: m.research_sessions.join_code,
      researcherId: m.research_sessions.researcher_id,
      isOwn: m.research_sessions.researcher_id === userId,
      startsAt: m.research_sessions.starts_at,
      endsAt: m.research_sessions.ends_at,
      joinedAt: m.joined_at,
    }));

    // Counts per workspace
    const ids = workspaces.map((w) => w.id);
    let threadCounts: Record<string, number> = {};
    let receiptCounts: Record<string, number> = {};
    if (ids.length) {
      const { data: t } = await supabase
        .from("chat_threads")
        .select("session_id")
        .eq("participant_id", userId)
        .in("session_id", ids);
      for (const row of t ?? []) {
        const k = (row as any).session_id;
        threadCounts[k] = (threadCounts[k] ?? 0) + 1;
      }
      const { data: r } = await supabase
        .from("receipts")
        .select("session_id")
        .eq("participant_id", userId)
        .in("session_id", ids);
      for (const row of r ?? []) {
        const k = (row as any).session_id;
        receiptCounts[k] = (receiptCounts[k] ?? 0) + 1;
      }
    }

    // Personal first, then research by joinedAt desc
    workspaces.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "personal" ? -1 : 1;
      return (b.joinedAt ?? "").localeCompare(a.joinedAt ?? "");
    });

    return {
      workspaces: workspaces.map((w) => ({
        ...w,
        threadCount: threadCounts[w.id] ?? 0,
        receiptCount: receiptCounts[w.id] ?? 0,
      })),
    };
  });

/**
 * Workspace detail: meta + threads + receipts scoped to this workspace.
 */
export const getMyWorkspace = createServerFn({ method: "GET" })
  .inputValidator(z.object({ workspaceId: z.string().uuid() }).parse)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: mem } = await supabase
      .from("session_participants")
      .select(`
        consent_accepted_at,
        research_sessions!inner(id, name, description, kind, status, join_code, researcher_id, starts_at, ends_at)
      `)
      .eq("participant_id", userId)
      .eq("session_id", data.workspaceId)
      .maybeSingle();

    if (!mem) throw new Error("Workspace not found or you don't have access");

    const ws = (mem as any).research_sessions;

    const [{ data: threads }, { data: receipts }] = await Promise.all([
      supabase
        .from("chat_threads")
        .select("id, tool, title, turn_count, last_captured_at, first_captured_at, summary")
        .eq("participant_id", userId)
        .eq("session_id", data.workspaceId)
        .order("last_captured_at", { ascending: false })
        .limit(200),
      supabase
        .from("receipts")
        .select("id, tool_used, prompt_preview, created_at, metadata")
        .eq("participant_id", userId)
        .eq("session_id", data.workspaceId)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    return {
      workspace: {
        id: ws.id,
        name: ws.name,
        description: ws.description,
        kind: ws.kind as "research" | "personal",
        status: ws.status,
        joinCode: ws.join_code,
        isOwn: ws.researcher_id === userId,
        startsAt: ws.starts_at,
        endsAt: ws.ends_at,
      },
      threads: threads ?? [],
      receipts: receipts ?? [],
    };
  });
