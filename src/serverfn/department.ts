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

// ==================== TRENDS ====================
//
// Time-series helpers for the department dashboard. All grouped week-over-week
// (Monday-anchored ISO weeks) so professors can see how the class is drifting
// on tool mix, fluency dimensions, and assignment risk.

const TREND_WINDOW_DAYS_DEFAULT = 84; // 12 weeks

function isoWeekKey(d: Date): string {
  // YYYY-Www ISO week key; groups Mon–Sun as one bucket.
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((dt.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

async function assertClassMember(supabase: any, userId: string, classId: string) {
  const { data } = await supabase
    .from("session_participants")
    .select("id")
    .eq("participant_id", userId)
    .eq("session_id", classId)
    .maybeSingle();
  if (!data) throw new Error("Class not found or you don't have access");
}

/** Weekly tool-usage counts for a class. */
export const getDepartmentToolTrends = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      classId: z.string().uuid(),
      windowDays: z.number().int().min(7).max(365).optional(),
    }).parse,
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertClassMember(supabase, userId, data.classId);
    const since = new Date(Date.now() - (data.windowDays ?? TREND_WINDOW_DAYS_DEFAULT) * 86400000).toISOString();

    const { data: rows } = await supabase
      .from("receipts")
      .select("tool_used, created_at")
      .eq("session_id", data.classId)
      .gte("created_at", since);

    const byWeek = new Map<string, Map<string, number>>();
    const toolTotals = new Map<string, number>();
    for (const r of (rows ?? []) as any[]) {
      const tool = r.tool_used || "unknown";
      const wk = isoWeekKey(new Date(r.created_at));
      if (!byWeek.has(wk)) byWeek.set(wk, new Map());
      const m = byWeek.get(wk)!;
      m.set(tool, (m.get(tool) ?? 0) + 1);
      toolTotals.set(tool, (toolTotals.get(tool) ?? 0) + 1);
    }
    const weeks = Array.from(byWeek.keys()).sort();
    const tools = Array.from(toolTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tool]) => tool);
    const series = tools.map((tool) => ({
      tool,
      total: toolTotals.get(tool) ?? 0,
      points: weeks.map((wk) => ({ week: wk, count: byWeek.get(wk)?.get(tool) ?? 0 })),
    }));
    return { weeks, series };
  });

const FLUENCY_HISTORY_KEYS = [
  { key: "direction_score_profile", label: "Direction" },
  { key: "delegation_score_profile", label: "Delegation" },
  { key: "discernment_score_profile", label: "Discernment" },
  { key: "development_score_profile", label: "Development" },
  { key: "ethics_score_profile", label: "Ethics" },
  { key: "efficiency_score_profile", label: "Efficiency" },
  { key: "strategic_agency_score_profile", label: "Strategic agency" },
] as const;

/** Weekly mean of each fluency dimension across the class. */
export const getDepartmentFluencyTrends = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      classId: z.string().uuid(),
      windowDays: z.number().int().min(7).max(365).optional(),
    }).parse,
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertClassMember(supabase, userId, data.classId);
    const since = new Date(Date.now() - (data.windowDays ?? TREND_WINDOW_DAYS_DEFAULT) * 86400000).toISOString();

    const cols = ["created_at", ...FLUENCY_HISTORY_KEYS.map((d) => d.key)].join(",");
    const { data: rows } = await supabase
      .from("participant_fluency_history")
      .select(cols)
      .eq("session_id", data.classId)
      .gte("created_at", since);

    const buckets = new Map<string, { sum: number; n: number }[]>();
    for (const r of (rows ?? []) as any[]) {
      const wk = isoWeekKey(new Date(r.created_at));
      if (!buckets.has(wk)) buckets.set(wk, FLUENCY_HISTORY_KEYS.map(() => ({ sum: 0, n: 0 })));
      const arr = buckets.get(wk)!;
      FLUENCY_HISTORY_KEYS.forEach((d, i) => {
        const v = r[d.key];
        if (typeof v === "number") { arr[i].sum += v; arr[i].n += 1; }
      });
    }
    const weeks = Array.from(buckets.keys()).sort();
    const series = FLUENCY_HISTORY_KEYS.map((d, i) => ({
      key: d.key,
      label: d.label,
      points: weeks.map((wk) => {
        const b = buckets.get(wk)![i];
        return { week: wk, value: b.n ? Math.round((b.sum / b.n) * 10) / 10 : null };
      }),
    }));
    return { weeks, series };
  });

/** Per-assignment week-over-week submission and avg-risk trend. */
export const getDepartmentAssignmentTrends = createServerFn({ method: "GET" })
  .inputValidator(z.object({ classId: z.string().uuid() }).parse)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertClassMember(supabase, userId, data.classId);

    const { data: assignments } = await supabase
      .from("class_assignments")
      .select("id, code, title")
      .eq("session_id", data.classId);
    const assignmentIds = (assignments ?? []).map((a: any) => a.id);
    if (!assignmentIds.length) return { assignments: [] };

    const { data: subs } = await supabase
      .from("assignment_submissions")
      .select("id, assignment_id, receipt_id, submitted_at")
      .in("assignment_id", assignmentIds);

    const receiptIds = (subs ?? []).map((s: any) => s.receipt_id).filter(Boolean);
    const receiptMap = new Map<string, any>();
    if (receiptIds.length) {
      const { data: rs } = await supabase
        .from("receipts")
        .select("id, tool_used, prompt_preview, metadata, conversation_json, time_spent_minutes")
        .in("id", receiptIds);
      for (const r of (rs ?? []) as any[]) receiptMap.set(r.id, r);
    }

    const grouped = new Map<string, any[]>();
    for (const s of (subs ?? []) as any[]) {
      const list = grouped.get(s.assignment_id) ?? [];
      list.push(s);
      grouped.set(s.assignment_id, list);
    }

    const out = (assignments ?? []).map((a: any) => {
      const list = grouped.get(a.id) ?? [];
      const byWeek = new Map<string, { count: number; riskSum: number; riskN: number }>();
      for (const s of list) {
        const wk = isoWeekKey(new Date(s.submitted_at));
        const b = byWeek.get(wk) ?? { count: 0, riskSum: 0, riskN: 0 };
        b.count += 1;
        const r = s.receipt_id ? receiptMap.get(s.receipt_id) : null;
        if (r) {
          const risk = assessTrivialnessRisk(r as any);
          if (risk) { b.riskSum += risk.score; b.riskN += 1; }
        }
        byWeek.set(wk, b);
      }
      const weeks = Array.from(byWeek.keys()).sort();
      return {
        id: a.id,
        code: a.code,
        title: a.title,
        points: weeks.map((wk) => {
          const b = byWeek.get(wk)!;
          return {
            week: wk,
            count: b.count,
            avgRisk: b.riskN ? Math.round(b.riskSum / b.riskN) : 0,
          };
        }),
      };
    });

    return { assignments: out };
  });
