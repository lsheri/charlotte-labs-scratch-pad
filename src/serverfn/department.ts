import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assessTrivialnessRisk } from "@/lib/trivialnessRisk";

/** Classes the current user belongs to. */
export const listMyClasses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("session_participants")
      .select("session_id, research_sessions!inner(id, name, description, status, join_code, metadata, researcher_id)")
      .eq("participant_id", userId)
      .not("consent_accepted_at", "is", null);
    if (error) throw new Error(error.message);
    const classes = (data ?? [])
      .map((m: any) => m.research_sessions)
      .filter((s: any) => (s.metadata as any)?.kind === "class")
      .map((s: any) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        status: s.status,
        joinCode: s.join_code,
        courseCode: (s.metadata as any)?.course_code ?? null,
        term: (s.metadata as any)?.term ?? null,
        isOwner: s.researcher_id === userId,
      }));
    return { classes };
  });

const FLUENCY_DIMS = [
  { key: "direction_score_profile", label: "Direction" },
  { key: "delegation_score_profile", label: "Delegation" },
  { key: "discernment_score_profile", label: "Discernment" },
  { key: "development_score_profile", label: "Development" },
  { key: "ethics_score_profile", label: "Ethics" },
  { key: "efficiency_score_profile", label: "Efficiency" },
  { key: "strategic_agency_score_profile", label: "Strategic agency" },
] as const;

/** Full class dashboard payload. */
export const getDepartmentOverview = createServerFn({ method: "GET" })
  .inputValidator(z.object({ classId: z.string().uuid() }).parse)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const classId = data.classId;

    // Membership check
    const { data: mem } = await supabase
      .from("session_participants")
      .select("id, research_sessions!inner(id, name, description, status, join_code, metadata, researcher_id)")
      .eq("participant_id", userId).eq("session_id", classId).maybeSingle();
    if (!mem) throw new Error("Class not found or you don't have access");
    const ws: any = (mem as any).research_sessions;

    // Roster
    const { data: roster } = await supabase
      .from("session_participants")
      .select("participant_id")
      .eq("session_id", classId)
      .not("consent_accepted_at", "is", null);
    const memberIds = (roster ?? []).map((r: any) => r.participant_id);

    // Receipts in this session (for tool usage + assignment risk lookups)
    const { data: receipts } = await supabase
      .from("receipts")
      .select("id, tool_used, prompt_preview, metadata, participant_id, time_spent_minutes, conversation_json, created_at")
      .eq("session_id", classId)
      .order("created_at", { ascending: false })
      .limit(500);

    const toolCounts: Record<string, number> = {};
    for (const r of receipts ?? []) {
      const t = (r as any).tool_used;
      if (t) toolCounts[t] = (toolCounts[t] ?? 0) + 1;
    }
    const tools = Object.entries(toolCounts)
      .map(([tool, count]) => ({ tool, count }))
      .sort((a, b) => b.count - a.count);

    // Class fluency = mean of profile scores across members with a row in this session
    let fluency: { label: string; value: number }[] = [];
    if (memberIds.length) {
      const { data: prof } = await supabase
        .from("participant_fluency_profiles")
        .select(FLUENCY_DIMS.map((d) => d.key).join(","))
        .eq("session_id", classId)
        .in("participant_id", memberIds);
      const rows = (prof ?? []) as any[];
      fluency = FLUENCY_DIMS.map((d) => {
        const vals = rows.map((r) => r[d.key]).filter((v) => typeof v === "number");
        const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
        return { label: d.label, value: Math.round(avg * 10) / 10 };
      });
    }

    // Assignments + submissions
    const { data: assignments } = await supabase
      .from("class_assignments")
      .select("id, code, title, description, due_at, expected_tools")
      .eq("session_id", classId)
      .order("due_at", { ascending: true, nullsFirst: false });

    const assignmentIds = (assignments ?? []).map((a: any) => a.id);
    let submissions: any[] = [];
    if (assignmentIds.length) {
      const { data: subs } = await supabase
        .from("assignment_submissions")
        .select("id, assignment_id, participant_id, receipt_id, submitted_at, notes")
        .in("assignment_id", assignmentIds);
      submissions = subs ?? [];
    }

    const receiptById = new Map((receipts ?? []).map((r: any) => [r.id, r]));

    const assignmentStats = (assignments ?? []).map((a: any) => {
      const subs = submissions.filter((s) => s.assignment_id === a.id);
      const evaluated = subs.map((s) => {
        const r = s.receipt_id ? receiptById.get(s.receipt_id) : null;
        const risk = r ? assessTrivialnessRisk(r as any) : null;
        return { ...s, risk };
      });
      const atRisk = evaluated.filter((s) => s.risk && s.risk.level !== "low");
      const avgRisk = evaluated.length
        ? Math.round(evaluated.reduce((sum, s) => sum + (s.risk?.score ?? 0), 0) / evaluated.length)
        : 0;
      return {
        id: a.id,
        code: a.code,
        title: a.title,
        description: a.description,
        dueAt: a.due_at,
        expectedTools: a.expected_tools ?? [],
        submittedCount: subs.length,
        atRiskCount: atRisk.length,
        avgRiskScore: avgRisk,
        atRiskSubmissions: atRisk.slice(0, 10).map((s) => ({
          id: s.id,
          participantId: s.participant_id,
          receiptId: s.receipt_id,
          submittedAt: s.submitted_at,
          risk: s.risk,
        })),
      };
    });

    return {
      class: {
        id: ws.id,
        name: ws.name,
        description: ws.description,
        joinCode: ws.join_code,
        courseCode: (ws.metadata as any)?.course_code ?? null,
        term: (ws.metadata as any)?.term ?? null,
        isOwner: ws.researcher_id === userId,
      },
      memberCount: memberIds.length,
      tools,
      fluency,
      assignments: assignmentStats,
    };
  });
