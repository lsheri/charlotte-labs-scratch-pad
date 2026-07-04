import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  if (!(data ?? []).some((r: any) => r.role === "admin")) {
    throw new Error("Forbidden: admin only");
  }
}

export const listDepartments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("research_sessions")
      .select("id, name, join_code, kind, created_at")
      .eq("kind", "research")
      .order("created_at", { ascending: true });
    return { departments: data ?? [] };
  });

const OverviewInput = z.object({ sessionId: z.string().uuid() });

function verificationFromTitle(title: string | null): "none" | "partial" | "high" | "unknown" {
  const t = (title ?? "").toLowerCase();
  if (t.includes("noverification") || t.includes("no verification")) return "none";
  if (t.includes("partialverification") || t.includes("partial verification")) return "partial";
  if (t.includes("highverification") || t.includes("high verification")) return "high";
  return "unknown";
}

/** AI-triviality risk heuristic:
 *  higher = assignment is more at risk of being trivialized by AI.
 *  Signals:
 *   - few conversation turns per submission (student took what AI gave)
 *   - single-tool dominance (no cross-checking)
 *   - low verification signals in thread titles
 */
function trivialityRisk(input: {
  threads: Array<{ turn_count: number; tool: string; title: string | null }>;
}): { score: number; band: "low" | "moderate" | "high" | "critical"; drivers: string[] } {
  const { threads } = input;
  if (threads.length === 0) return { score: 0, band: "low", drivers: ["No submissions yet"] };

  const avgTurns = threads.reduce((s, t) => s + (t.turn_count ?? 0), 0) / threads.length;
  const tools = new Set(threads.map((t) => t.tool));
  const toolDiversity = tools.size / Math.max(threads.length, 1);
  const verifications = threads.map((t) => verificationFromTitle(t.title));
  const noneRate = verifications.filter((v) => v === "none").length / threads.length;
  const highRate = verifications.filter((v) => v === "high").length / threads.length;

  const turnScore = Math.max(0, Math.min(1, (25 - avgTurns) / 25)); // <10 turns → high
  const diversityScore = 1 - Math.min(1, toolDiversity * 2);
  const verifScore = noneRate * 0.9 + (1 - highRate) * 0.3;

  const score = Math.round((turnScore * 0.4 + diversityScore * 0.25 + verifScore * 0.35) * 100);

  const drivers: string[] = [];
  if (avgTurns < 15) drivers.push(`Short conversations (avg ${avgTurns.toFixed(0)} turns)`);
  if (tools.size === 1) drivers.push(`Only one tool in use (${[...tools][0]})`);
  if (noneRate > 0.3) drivers.push(`${Math.round(noneRate * 100)}% of threads show no verification`);
  if (highRate > 0.5) drivers.push(`${Math.round(highRate * 100)}% show strong verification`);
  if (drivers.length === 0) drivers.push("Balanced multi-tool use with verification");

  const band: "low" | "moderate" | "high" | "critical" =
    score >= 75 ? "critical" : score >= 55 ? "high" : score >= 35 ? "moderate" : "low";
  return { score, band, drivers };
}

export const getDepartmentDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(OverviewInput.parse)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sessionId = data.sessionId;

    const [session, participants, assignments, threads, assignmentThreads, receipts] =
      await Promise.all([
        supabaseAdmin
          .from("research_sessions")
          .select("id, name, join_code, kind")
          .eq("id", sessionId)
          .maybeSingle(),
        supabaseAdmin
          .from("session_participants")
          .select("participant_id, consent_accepted_at")
          .eq("session_id", sessionId),
        supabaseAdmin
          .from("class_assignments")
          .select("id, code, title, description, expected_tools, due_at")
          .eq("session_id", sessionId)
          .order("due_at", { ascending: true }),
        supabaseAdmin
          .from("chat_threads")
          .select("id, tool, title, turn_count, participant_id, created_at, last_captured_at")
          .eq("session_id", sessionId),
        supabaseAdmin.from("assignment_threads").select("assignment_id, thread_id, participant_id"),
        supabaseAdmin
          .from("receipts")
          .select("id, tool_used, metadata, quality_scores, participant_id, created_at")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: false }),
      ]);

    const threadList = threads.data ?? [];
    const assignmentThreadList = assignmentThreads.data ?? [];
    const assignmentList = assignments.data ?? [];
    const receiptList = receipts.data ?? [];

    // Tool usage across all threads in this department
    const toolCounts: Record<string, number> = {};
    for (const t of threadList) toolCounts[t.tool] = (toolCounts[t.tool] ?? 0) + 1;
    const toolBreakdown = Object.entries(toolCounts)
      .map(([tool, count]) => ({ tool, count }))
      .sort((a, b) => b.count - a.count);

    // Verification pattern across all threads
    const verifCounts = { none: 0, partial: 0, high: 0, unknown: 0 };
    for (const t of threadList) verifCounts[verificationFromTitle(t.title)]++;

    // Per-assignment rollups
    const threadById = new Map(threadList.map((t) => [t.id, t]));
    const perAssignment = assignmentList.map((a) => {
      const linked = assignmentThreadList.filter((at) => at.assignment_id === a.id);
      const relevantThreads = linked
        .map((at) => threadById.get(at.thread_id))
        .filter((t): t is NonNullable<typeof t> => !!t);
      const uniqueStudents = new Set(relevantThreads.map((t) => t.participant_id)).size;
      const toolsUsed = Array.from(new Set(relevantThreads.map((t) => t.tool)));
      const expected = (a.expected_tools ?? []) as string[];
      const coveredTools = expected.filter((tool) => toolsUsed.includes(tool));
      const risk = trivialityRisk({
        threads: relevantThreads.map((t) => ({
          turn_count: t.turn_count ?? 0,
          tool: t.tool,
          title: t.title,
        })),
      });
      const avgTurns =
        relevantThreads.length === 0
          ? 0
          : relevantThreads.reduce((s, t) => s + (t.turn_count ?? 0), 0) / relevantThreads.length;
      return {
        id: a.id,
        code: a.code,
        title: a.title,
        dueAt: a.due_at,
        expectedTools: expected,
        toolsUsed,
        toolsCoveredCount: coveredTools.length,
        expectedToolsCount: expected.length,
        threadCount: relevantThreads.length,
        uniqueStudents,
        avgTurns: Math.round(avgTurns * 10) / 10,
        risk,
      };
    });

    // Overall department risk = weighted avg of assignment risks
    const overallRisk =
      perAssignment.length === 0
        ? 0
        : Math.round(
            perAssignment.reduce((s, a) => s + a.risk.score, 0) / perAssignment.length,
          );

    // Recent workflow receipts
    const recentReceipts = receiptList.slice(0, 12).map((r: any) => ({
      id: r.id,
      tool: r.tool_used,
      label: r.metadata?.label ?? null,
      workflowType: r.metadata?.workflowType ?? null,
      provenance: r.metadata?.provenance ?? null,
      participantId: r.participant_id,
      createdAt: r.created_at,
    }));

    return {
      session: session.data,
      overall: {
        participantCount: (participants.data ?? []).length,
        assignmentCount: assignmentList.length,
        threadCount: threadList.length,
        receiptCount: receiptList.length,
        totalTurns: threadList.reduce((s, t) => s + (t.turn_count ?? 0), 0),
        avgTurnsPerThread:
          threadList.length === 0
            ? 0
            : Math.round(
                (threadList.reduce((s, t) => s + (t.turn_count ?? 0), 0) / threadList.length) * 10,
              ) / 10,
        overallRiskScore: overallRisk,
      },
      toolBreakdown,
      verifCounts,
      perAssignment,
      recentReceipts,
    };
  });
