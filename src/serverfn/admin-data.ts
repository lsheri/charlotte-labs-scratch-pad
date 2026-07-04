import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Admin/researcher data access for the admin panel.
 *
 * Authorization model:
 *   - admins see everything
 *   - researchers see only data attached to sessions they own
 *   - identity reveal (email/display_name/org) is admin-only
 *
 * All RLS-bypassing reads go through supabaseAdmin server-side; we re-check
 * roles & ownership in code before returning anything.
 */

async function loadCallerRoles(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const roles = new Set((data ?? []).map((r: any) => r.role as string));
  return {
    isAdmin: roles.has("admin"),
    isResearcher: roles.has("researcher"),
  };
}

async function ownedSessionIds(userId: string): Promise<Set<string>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("research_sessions")
    .select("id")
    .eq("researcher_id", userId);
  return new Set((data ?? []).map((s: any) => s.id as string));
}

async function assertCanAccessUser(callerId: string, targetUserId: string) {
  const { isAdmin, isResearcher } = await loadCallerRoles(callerId);
  if (isAdmin) return { isAdmin: true, allowedSessions: null as Set<string> | null };
  if (!isResearcher) throw new Error("Forbidden");
  const owned = await ownedSessionIds(callerId);
  if (owned.size === 0) throw new Error("Forbidden: no owned sessions");
  // Researcher must share at least one session with this user
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: memberships } = await supabaseAdmin
    .from("session_participants")
    .select("session_id")
    .eq("participant_id", targetUserId);
  const shared = (memberships ?? []).some((m: any) => owned.has(m.session_id));
  if (!shared) throw new Error("Forbidden: user not in any of your sessions");
  return { isAdmin: false, allowedSessions: owned };
}

/* ----------------------------- list users ------------------------------ */

export const listUsersForAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isAdmin, isResearcher } = await loadCallerRoles(context.userId);
    if (!isAdmin && !isResearcher) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let userIds: string[] | null = null;
    if (!isAdmin) {
      const owned = await ownedSessionIds(context.userId);
      const { data: m } = await supabaseAdmin
        .from("session_participants")
        .select("participant_id")
        .in("session_id", Array.from(owned));
      userIds = Array.from(new Set((m ?? []).map((r: any) => r.participant_id as string)));
      if (userIds.length === 0) return { users: [] };
    }

    // TODO: replace with cursor pagination when participant count exceeds 5000
    let pq = supabaseAdmin
      .from("profiles")
      .select("id, display_name, organization, created_at")
      .limit(5000);
    if (userIds) pq = pq.in("id", userIds);
    const { data: profiles } = await pq;

    const ids = (profiles ?? []).map((p: any) => p.id);
    const safeIds = ids.length ? ids : ["00000000-0000-0000-0000-000000000000"];

    // Roles, threads, receipts in parallel
    const [rolesRes, threadsRes, receiptsRes] = await Promise.all([
      supabaseAdmin
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", safeIds),
      supabaseAdmin
        .from("chat_threads")
        .select("participant_id, last_captured_at")
        .in("participant_id", safeIds)
        .order("last_captured_at", { ascending: false })
        .limit(10000),
      supabaseAdmin
        .from("receipts")
        .select("participant_id, created_at")
        .in("participant_id", safeIds)
        .order("created_at", { ascending: false })
        .limit(10000),
    ]);
    const roleMap = new Map<string, string[]>();
    for (const r of (rolesRes.data ?? []) as any[]) {
      const arr = roleMap.get(r.user_id) ?? [];
      arr.push(r.role);
      roleMap.set(r.user_id, arr);
    }
    const threadCount = new Map<string, number>();
    const lastThread = new Map<string, string>();
    for (const t of (threadsRes.data ?? []) as any[]) {
      threadCount.set(t.participant_id, (threadCount.get(t.participant_id) ?? 0) + 1);
      if (!lastThread.has(t.participant_id)) lastThread.set(t.participant_id, t.last_captured_at);
    }
    const receiptCount = new Map<string, number>();
    const lastReceipt = new Map<string, string>();
    for (const r of (receiptsRes.data ?? []) as any[]) {
      receiptCount.set(r.participant_id, (receiptCount.get(r.participant_id) ?? 0) + 1);
      if (!lastReceipt.has(r.participant_id)) lastReceipt.set(r.participant_id, r.created_at);
    }

    // Email lookup (admin only — researchers stay anonymous)
    const emailMap = new Map<string, string | null>();
    if (isAdmin) {
      // Page through auth users (cap 2000)
      for (let page = 1; page <= 10; page++) {
        const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 } as any);
        const users = (list?.users ?? []) as Array<{ id: string; email?: string | null }>;
        if (users.length === 0) break;
        for (const u of users) emailMap.set(u.id, u.email ?? null);
        if (users.length < 200) break;
      }
    }

    return {
      users: (profiles ?? []).map((p: any) => {
        const lt = lastThread.get(p.id);
        const lr = lastReceipt.get(p.id);
        const lastActiveAt =
          lt && lr ? (lt > lr ? lt : lr) : (lt ?? lr ?? null);
        return {
          id: p.id,
          created_at: p.created_at,
          roles: roleMap.get(p.id) ?? [],
          email: isAdmin ? emailMap.get(p.id) ?? null : null,
          display_name: isAdmin ? p.display_name ?? null : null,
          organization: isAdmin ? p.organization ?? null : null,
          thread_count: threadCount.get(p.id) ?? 0,
          receipt_count: receiptCount.get(p.id) ?? 0,
          last_active_at: lastActiveAt,
        };
      }),
    };
  });

/* --------------------------- reveal identity --------------------------- */

export const revealUserIdentity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { isAdmin } = await loadCallerRoles(context.userId);
    if (!isAdmin) throw new Error("Forbidden: admin only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("display_name, organization")
      .eq("id", data.userId)
      .maybeSingle();
    let email: string | null = null;
    try {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(data.userId);
      email = u?.user?.email ?? null;
    } catch {}

    // Audit trail: every identity reveal is logged so a customer/IRB audit
    // can answer "who looked at whom and when". Append-only by RLS.
    try {
      await supabaseAdmin.from("admin_access_log" as any).insert({
        admin_user_id: context.userId,
        action: "reveal_user_identity",
        target_user_id: data.userId,
        target_resource: "profile",
        metadata: { revealed_email: !!email, revealed_name: !!profile?.display_name },
      });
    } catch (e) {
      console.error("[admin-audit] failed to log reveal", e);
    }

    return {
      email,
      display_name: profile?.display_name ?? null,
      organization: profile?.organization ?? null,
    };
  });

/* ------------------------- user detail summary ------------------------- */

export const getUserDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertCanAccessUser(context.userId, data.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: roles }, { data: memberships }, { count: threadCount }, { count: receiptCount }, { data: profile }] =
      await Promise.all([
        supabaseAdmin.from("user_roles").select("role").eq("user_id", data.userId),
        supabaseAdmin
          .from("session_participants")
          .select("session_id, joined_at, withdrawn_at, consent_accepted_at")
          .eq("participant_id", data.userId),
        supabaseAdmin
          .from("chat_threads")
          .select("id", { count: "exact", head: true })
          .eq("participant_id", data.userId),
        supabaseAdmin
          .from("receipts")
          .select("id", { count: "exact", head: true })
          .eq("participant_id", data.userId),
        supabaseAdmin
          .from("profiles")
          .select("template_picker_enabled")
          .eq("id", data.userId)
          .maybeSingle(),
      ]);

    const sessIds = (memberships ?? []).map((m: any) => m.session_id);
    const { data: sessions } = sessIds.length
      ? await supabaseAdmin
          .from("research_sessions")
          .select("id, name, status, researcher_id")
          .in("id", sessIds)
      : { data: [] as any[] };

    return {
      userId: data.userId,
      roles: (roles ?? []).map((r: any) => r.role as string),
      sessions: (memberships ?? []).map((m: any) => ({
        ...m,
        session: (sessions ?? []).find((s: any) => s.id === m.session_id) ?? null,
      })),
      threadCount: threadCount ?? 0,
      receiptCount: receiptCount ?? 0,
      templatePickerEnabled: !!(profile as any)?.template_picker_enabled,
    };
  });

/* --------------------------- list user data --------------------------- */

export const listUserThreadsForAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const access = await assertCanAccessUser(context.userId, data.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("chat_threads")
      .select("id, tool, title, summary, summary_generated_at, turn_count, first_captured_at, last_captured_at, last_url, session_id")
      .eq("participant_id", data.userId)
      .order("last_captured_at", { ascending: false })
      .limit(500);
    if (!access.isAdmin && access.allowedSessions) {
      q = q.in("session_id", Array.from(access.allowedSessions));
    }
    const { data: threads, error } = await q;
    if (error) throw new Error(error.message);
    return { threads: threads ?? [] };
  });

export const listUserReceiptsForAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const access = await assertCanAccessUser(context.userId, data.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("receipts")
      .select("id, tool_used, prompt_preview, response_preview, created_at, session_id, time_spent_minutes, quality_passed, metadata")
      .eq("participant_id", data.userId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (!access.isAdmin && access.allowedSessions) {
      q = q.in("session_id", Array.from(access.allowedSessions));
    }
    const { data: receipts, error } = await q;
    if (error) throw new Error(error.message);
    return { receipts: receipts ?? [] };
  });

/* ------------------------------ exports ------------------------------ */

async function authorizeSessionScope(callerId: string) {
  const { isAdmin, isResearcher } = await loadCallerRoles(callerId);
  if (!isAdmin && !isResearcher) throw new Error("Forbidden");
  if (isAdmin) return { isAdmin: true, allowedSessions: null as Set<string> | null };
  return { isAdmin: false, allowedSessions: await ownedSessionIds(callerId) };
}

function fmt(ts?: string | null) {
  if (!ts) return "";
  return new Date(ts).toISOString();
}

export const exportThreadsTxt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ threadIds: z.array(z.string().uuid()).min(1).max(500) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const access = await authorizeSessionScope(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getThreadDisplayName, anonymousLabel, safeFilename } = await import("@/lib/displayNames");

    const { data: threads } = await supabaseAdmin
      .from("chat_threads")
      .select("*")
      .in("id", data.threadIds);
    const allowed = (threads ?? []).filter((t: any) =>
      access.isAdmin || access.allowedSessions?.has(t.session_id),
    );
    if (allowed.length === 0) return { files: [] };

    const { data: caps } = await supabaseAdmin
      .from("ai_conversations")
      .select("id, thread_id, captured_at, title, url, prompt_text")
      .in("thread_id", allowed.map((t: any) => t.id))
      .order("captured_at", { ascending: true });
    const capIds = (caps ?? []).map((c: any) => c.id);
    const { data: turns } = capIds.length
      ? await supabaseAdmin
          .from("conversation_turns")
          .select("conversation_id, role, content, idx")
          .in("conversation_id", capIds)
          .order("idx", { ascending: true })
      : { data: [] as any[] };

    const files = allowed.map((t: any) => {
      const tCaps = (caps ?? []).filter((c: any) => c.thread_id === t.id);
      const lines: string[] = [];
      lines.push(`Thread: ${getThreadDisplayName(t)}`);
      lines.push(`Participant: ${anonymousLabel(t.participant_id)}  (id: ${t.participant_id})`);
      lines.push(`Tool: ${t.tool}`);
      lines.push(`Session: ${t.session_id}`);
      lines.push(`First captured: ${fmt(t.first_captured_at)}`);
      lines.push(`Last captured: ${fmt(t.last_captured_at)}`);
      if (t.last_url) lines.push(`Source: ${t.last_url}`);
      if (t.summary) lines.push(`Summary: ${t.summary}`);
      lines.push("");
      tCaps.forEach((c: any, i: number) => {
        lines.push(`=== Capture ${i + 1} of ${tCaps.length} · ${fmt(c.captured_at)} ===`);
        if (c.title) lines.push(`Title: ${c.title}`);
        if (c.url) lines.push(`URL: ${c.url}`);
        lines.push("");
        const ts = (turns ?? []).filter((x: any) => x.conversation_id === c.id);
        for (const turn of ts) {
          lines.push(`--- ${String(turn.role).toUpperCase()} ---`);
          lines.push(turn.content ?? "");
          lines.push("");
        }
      });
      return {
        filename: `thread_${safeFilename(getThreadDisplayName(t))}_${t.id.slice(0, 8)}.txt`,
        content: lines.join("\n"),
      };
    });
    return { files };
  });

export const exportReceiptsTxt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ receiptIds: z.array(z.string().uuid()).min(1).max(500) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const access = await authorizeSessionScope(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getReceiptDisplayName, getWorkflowTypeLabel, getWorkflowTags, getWorkflowPurpose, PURPOSE_LABELS, anonymousLabel, safeFilename, getProvenance, getProvenanceSource, PROVENANCE_LABELS, PROVENANCE_SOURCE_LABELS, isVerifiedLab } = await import("@/lib/displayNames");

    const { data: receipts } = await supabaseAdmin
      .from("receipts")
      .select("*")
      .in("id", data.receiptIds);
    const allowed = (receipts ?? []).filter((r: any) =>
      access.isAdmin || access.allowedSessions?.has(r.session_id),
    );
    if (allowed.length === 0) return { files: [] };

    const receiptIds = allowed.map((r: any) => r.id);
    const [{ data: runs }, signalsRes, chainsRes] = await Promise.all([
      supabaseAdmin
        .from("fluency_analysis_runs")
        .select("receipt_id, run_id, analysis_output_json, overall_confidence, created_at")
        .in("receipt_id", receiptIds),
      supabaseAdmin
        .from("receipt_construct_signals")
        .select("receipt_id, c3_avg_goal_clarity, c3_format_spec_rate, c3_iteration_rate, c4_role_directive_rate, c5_challenge_rate, c5_challenge_count, c10_clarification_rate, c11_mean_structure_score, c12_synthesis_rate, c14_attribution_rate, c16_meta_rate")
        .in("receipt_id", receiptIds),
      supabaseAdmin
        .from("prompt_chains")
        .select("receipt_id, chain_type, prompt_count")
        .in("receipt_id", receiptIds),
    ]);
    const signalsMap = new Map((signalsRes.data ?? []).map((s: any) => [s.receipt_id, s]));
    const chainsMap = new Map<string, any[]>();
    for (const c of (chainsRes.data ?? []) as any[]) {
      const arr = chainsMap.get(c.receipt_id) ?? [];
      arr.push(c);
      chainsMap.set(c.receipt_id, arr);
    }

    const files = allowed.map((r: any) => {
      const run = (runs ?? []).find((x: any) => x.receipt_id === r.id);
      const lines: string[] = [];
      lines.push(`Workflow: ${getReceiptDisplayName(r)}`);
      lines.push(`Output type: ${getWorkflowTypeLabel(r)}`);
      lines.push(`Provenance: ${PROVENANCE_LABELS[getProvenance(r)]}${isVerifiedLab(r) ? " (verified)" : ""}`);
      const psrc = getProvenanceSource(r);
      if (psrc) lines.push(`Provenance source: ${PROVENANCE_SOURCE_LABELS[psrc]}`);
      const purpose = getWorkflowPurpose(r);
      if (purpose) lines.push(`Purpose: ${PURPOSE_LABELS[purpose]}`);
      const goal = (r.metadata as any)?.goal;
      if (goal) lines.push(`Goal: ${goal}`);
      const tags = getWorkflowTags(r);
      if (tags.length) lines.push(`Tags: ${tags.map((t) => `#${t}`).join(" ")}`);
      lines.push(`Participant: ${anonymousLabel(r.participant_id)}  (id: ${r.participant_id})`);
      lines.push(`Tools: ${[r.tool_used, ...((r.metadata?.tools as string[] | undefined) ?? [])].filter(Boolean).join(", ")}`);
      lines.push(`Session: ${r.session_id}`);
      lines.push(`Created: ${fmt(r.created_at)}`);
      if (r.time_spent_minutes != null) lines.push(`Time spent: ${r.time_spent_minutes} min`);
      lines.push("");
      lines.push("=== Prompt ===");
      lines.push(r.prompt_preview ?? "(no prompt)");
      lines.push("");
      lines.push("=== Response ===");
      lines.push(r.response_preview ?? "(no response)");
      lines.push("");
      if (Array.isArray(r.conversation_json) && r.conversation_json.length) {
        lines.push("=== Full conversation ===");
        for (const t of r.conversation_json as any[]) {
          lines.push(`--- ${String(t.role ?? "").toUpperCase()} ---`);
          lines.push(t.content ?? "");
          lines.push("");
        }
      }
      if (run) {
        lines.push("=== Fluency analysis ===");
        lines.push(`Run: ${run.run_id} · confidence ${run.overall_confidence ?? "—"}`);
        try {
          lines.push(JSON.stringify(run.analysis_output_json, null, 2));
        } catch {
          lines.push(String(run.analysis_output_json));
        }
        lines.push("");
      }
      const sigs = signalsMap.get(r.id) as any;
      if (sigs) {
        lines.push("=== Engine V1 Construct Signals ===");
        lines.push(`c3_avg_goal_clarity: ${sigs.c3_avg_goal_clarity ?? "—"}`);
        lines.push(`c3_format_spec_rate: ${sigs.c3_format_spec_rate ?? "—"}`);
        lines.push(`c3_iteration_rate: ${sigs.c3_iteration_rate ?? "—"}`);
        lines.push(`c4_role_directive_rate: ${sigs.c4_role_directive_rate ?? "—"}`);
        lines.push(`c5_challenge_rate: ${sigs.c5_challenge_rate ?? "—"}`);
        lines.push(`c5_challenge_count: ${sigs.c5_challenge_count ?? "—"}`);
        lines.push(`c10_clarification_rate: ${sigs.c10_clarification_rate ?? "—"}`);
        lines.push(`c11_mean_structure_score: ${sigs.c11_mean_structure_score ?? "—"}`);
        lines.push(`c12_synthesis_rate: ${sigs.c12_synthesis_rate ?? "—"}`);
        lines.push(`c14_attribution_rate: ${sigs.c14_attribution_rate ?? "—"}`);
        lines.push(`c16_meta_rate: ${sigs.c16_meta_rate ?? "—"}`);
        lines.push("");
      }
      const rChains = chainsMap.get(r.id) ?? [];
      if (rChains.length > 0) {
        lines.push("=== Engine V1 Chains ===");
        for (const c of rChains) {
          const isLoop = c.chain_type === "loop";
          lines.push(`${c.chain_type ?? "unknown"}: ${c.prompt_count ?? 0} prompts${isLoop ? " [LOOP]" : ""}`);
        }
        lines.push("");
      }
      return {
        filename: `receipt_${safeFilename(getReceiptDisplayName(r))}_${r.id.slice(0, 8)}.txt`,
        content: lines.join("\n"),
      };
    });
    return { files };
  });

/* --------------------------- session scope --------------------------- */

async function assertCanAccessSession(callerId: string, sessionId: string) {
  const { isAdmin, isResearcher } = await loadCallerRoles(callerId);
  if (isAdmin) return { isAdmin: true };
  if (!isResearcher) throw new Error("Forbidden");
  const owned = await ownedSessionIds(callerId);
  if (!owned.has(sessionId)) throw new Error("Forbidden: not your session");
  return { isAdmin: false };
}

export const getSessionDetailForAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ sessionId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await assertCanAccessSession(context.userId, data.sessionId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: session }, { data: members }, { data: threads }, { data: receipts }] = await Promise.all([
      supabaseAdmin.from("research_sessions").select("id, name, status, join_code, researcher_id, description, created_at, starts_at, ends_at").eq("id", data.sessionId).maybeSingle(),
      supabaseAdmin.from("session_participants").select("participant_id, joined_at, withdrawn_at, consent_accepted_at").eq("session_id", data.sessionId),
      supabaseAdmin.from("chat_threads")
        .select("id, participant_id, tool, title, summary, turn_count, first_captured_at, last_captured_at, last_url")
        .eq("session_id", data.sessionId).order("last_captured_at", { ascending: false }).limit(2000),
      supabaseAdmin.from("receipts")
        .select("id, participant_id, tool_used, prompt_preview, response_preview, created_at, time_spent_minutes, quality_passed, metadata")
        .eq("session_id", data.sessionId).order("created_at", { ascending: false }).limit(2000),
    ]);
    if (!session) throw new Error("Session not found");
    return { session, members: members ?? [], threads: threads ?? [], receipts: receipts ?? [] };
  });

/* ----------------------------- JSON exports ----------------------------- */

export const exportThreadsJson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ threadIds: z.array(z.string().uuid()).min(1).max(2000) }).parse(d))
  .handler(async ({ context, data }) => {
    const access = await authorizeSessionScope(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: threads } = await supabaseAdmin.from("chat_threads").select("*").in("id", data.threadIds);
    const allowed = (threads ?? []).filter((t: any) => access.isAdmin || access.allowedSessions?.has(t.session_id));
    if (allowed.length === 0) return { json: "[]" };

    const ids = allowed.map((t: any) => t.id);
    const { data: caps } = await supabaseAdmin
      .from("ai_conversations")
      .select("id, thread_id, captured_at, title, url, prompt_text, source")
      .in("thread_id", ids).order("captured_at", { ascending: true });
    const capIds = (caps ?? []).map((c: any) => c.id);
    const { data: turns } = capIds.length
      ? await supabaseAdmin.from("conversation_turns").select("conversation_id, role, content, idx").in("conversation_id", capIds).order("idx", { ascending: true })
      : { data: [] as any[] };

    const payload = allowed.map((t: any) => ({
      thread: t,
      captures: (caps ?? []).filter((c: any) => c.thread_id === t.id).map((c: any) => ({
        ...c,
        turns: (turns ?? []).filter((x: any) => x.conversation_id === c.id),
      })),
    }));
    return { json: JSON.stringify(payload, null, 2) };
  });

export const exportReceiptsJson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ receiptIds: z.array(z.string().uuid()).min(1).max(2000) }).parse(d))
  .handler(async ({ context, data }) => {
    const access = await authorizeSessionScope(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: receipts } = await supabaseAdmin.from("receipts").select("*").in("id", data.receiptIds);
    const allowed = (receipts ?? []).filter((r: any) => access.isAdmin || access.allowedSessions?.has(r.session_id));
    if (allowed.length === 0) return { json: "[]" };
    const { data: runs } = await supabaseAdmin
      .from("fluency_analysis_runs")
      .select("receipt_id, run_id, analysis_output_json, overall_confidence, created_at")
      .in("receipt_id", allowed.map((r: any) => r.id));
    const payload = allowed.map((r: any) => ({
      receipt: r,
      fluency: (runs ?? []).filter((x: any) => x.receipt_id === r.id),
    }));
    return { json: JSON.stringify(payload, null, 2) };
  });

/**
 * Admin-only: stamp a receipt as verified Lab Work.
 * Sets metadata.provenance = 'lab' and metadata.provenanceSource = 'admin_verified'.
 * Pass `verified: false` to revert (unset the verified source; leaves provenance value alone).
 */
export const setReceiptProvenance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      receiptId: z.string().uuid(),
      verified: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { isAdmin } = await loadCallerRoles(context.userId);
    if (!isAdmin) throw new Error("Forbidden: admin only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: receipt } = await supabaseAdmin
      .from("receipts").select("id, metadata").eq("id", data.receiptId).maybeSingle();
    if (!receipt) throw new Error("Receipt not found");
    const meta = (receipt.metadata as any) ?? {};
    if (data.verified) {
      meta.provenance = "lab";
      meta.provenanceSource = "admin_verified";
    } else {
      // revert: drop the verified stamp; keep label as personal unless something else set it
      meta.provenanceSource = meta.provenanceSource === "admin_verified" ? null : meta.provenanceSource;
    }
    const beforeMeta = (receipt.metadata as any) ?? {};
    const { error } = await supabaseAdmin.from("receipts").update({ metadata: meta }).eq("id", data.receiptId);
    if (error) throw new Error(error.message);
    // Audit trail (immutable).
    await supabaseAdmin.from("admin_receipt_decisions" as any).insert({
      receipt_id: data.receiptId,
      admin_user_id: context.userId,
      action: data.verified ? "verify_lab_provenance" : "revert_lab_provenance",
      before_value: { provenance: beforeMeta.provenance ?? null, provenanceSource: beforeMeta.provenanceSource ?? null },
      after_value: { provenance: meta.provenance ?? null, provenanceSource: meta.provenanceSource ?? null },
    });
    // Bust caches that depend on provenance so the next view recomputes.
    await supabaseAdmin.from("receipt_recommendations_cache" as any).delete().eq("receipt_id", data.receiptId);
    await supabaseAdmin.from("receipt_checkup_cache" as any).delete().eq("receipt_id", data.receiptId);
    return { ok: true, provenance: meta.provenance ?? "personal", provenanceSource: meta.provenanceSource ?? null };
  });

/**
 * Aggregates receipt_construct_signals for all receipts in a session.
 * Returns per-construct average signal value and participant count with data.
 * Researcher and admin access only — enforced by RLS on receipt_construct_signals
 * (researchers see signals only for sessions they own; admins see all).
 * Called by: src/routes/researcher.sessions.$sessionId.tsx
 * Constructs served: C3, C3b, C3c, C4, C5, C9, C10, C11, C12, C14, C16
 */
export const getSessionConstructSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ sessionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: signals } = await supabase
      .from("receipt_construct_signals")
      .select(
        "participant_id, c3_avg_goal_clarity, c3_format_spec_rate, c3_exemplar_rate, c3_iteration_rate, c3_structure_trend, c4_role_directive_rate, c4_collaboration_term_count, c5_challenge_rate, c9_tools_used_count, c10_clarification_rate, c11_mean_structure_score, c12_synthesis_rate, c14_attribution_rate, c16_meta_rate"
      )
      .eq("session_id", data.sessionId);
    if (!signals?.length) return { constructs: [] as Array<{ id: string; name: string; signal: string; avg: number | null; participantCount: number }> };
    const avg = (vals: (number | null)[]) => {
      const valid = vals.filter((v): v is number => v !== null && v !== undefined);
      return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
    };
    const cnt = (vals: (number | null)[]) =>
      vals.filter((v) => v !== null && v !== undefined).length;
    const col = (k: keyof (typeof signals)[number]) => signals.map((s: any) => s[k] as number | null);
    const constructs = [
      { id: "C3",  name: "Procedural Prompting",       signal: "Goal clarity (0–2)",       avg: avg(col("c3_avg_goal_clarity")),     participantCount: cnt(col("c3_avg_goal_clarity")) },
      { id: "C3b", name: "Format specification rate",  signal: "Format spec rate",         avg: avg(col("c3_format_spec_rate")),     participantCount: cnt(col("c3_format_spec_rate")) },
      { id: "C3c", name: "Iteration rate",             signal: "Iteration rate",           avg: avg(col("c3_iteration_rate")),       participantCount: cnt(col("c3_iteration_rate")) },
      { id: "C4",  name: "In-Session Control",         signal: "Role directive rate",      avg: avg(col("c4_role_directive_rate")),  participantCount: cnt(col("c4_role_directive_rate")) },
      { id: "C5",  name: "Critical Evaluation",        signal: "Challenge rate",           avg: avg(col("c5_challenge_rate")),       participantCount: cnt(col("c5_challenge_rate")) },
      { id: "C9",  name: "Continuous-Learning",        signal: "Tools used count",         avg: avg(col("c9_tools_used_count")),     participantCount: cnt(col("c9_tools_used_count")) },
      { id: "C10", name: "Comprehension Monitoring",   signal: "Clarification rate",       avg: avg(col("c10_clarification_rate")),  participantCount: cnt(col("c10_clarification_rate")) },
      { id: "C11", name: "Metacognitive Planning",     signal: "Mean structure score (0–5)", avg: avg(col("c11_mean_structure_score")), participantCount: cnt(col("c11_mean_structure_score")) },
      { id: "C12", name: "Metacognitive Reflection",   signal: "Synthesis rate",           avg: avg(col("c12_synthesis_rate")),      participantCount: cnt(col("c12_synthesis_rate")) },
      { id: "C14", name: "Ethical Reasoning",          signal: "Attribution rate",         avg: avg(col("c14_attribution_rate")),    participantCount: cnt(col("c14_attribution_rate")) },
      { id: "C16", name: "System Scaffolding",         signal: "Meta-prompt rate",         avg: avg(col("c16_meta_rate")),           participantCount: cnt(col("c16_meta_rate")) },
    ];
    return { constructs };
  });

/* ----------------------- Engine V1 admin audit ----------------------- */

/**
 * Loads everything needed to audit a single receipt: receipt + construct
 * signals + chains + per-prompt features + latest fluency run + participant
 * profile snapshot. Admin only.
 * Called by: src/routes/admin.receipts.$receiptId.tsx
 *
 * NOTE: prompt_chains has no `loop_detected` column — loops are encoded as
 * chain_type === 'loop'. prompt_features uses boolean detection columns
 * (c3_*_detected, c5_challenge_detected, etc.) rather than aggregate flags.
 */
export const getReceiptAuditData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ receiptId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { isAdmin } = await loadCallerRoles(context.userId);
    if (!isAdmin) throw new Error("Forbidden: admin only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: receipt } = await supabaseAdmin
      .from("receipts")
      .select("id, participant_id, session_id, tool_used, created_at, metadata, conversation_json")
      .eq("id", data.receiptId).maybeSingle();
    if (!receipt) throw new Error("Receipt not found");
    const [constructRes, chainsRes, featuresRes, runRes, profileRes] = await Promise.all([
      supabaseAdmin.from("receipt_construct_signals").select("*")
        .eq("receipt_id", data.receiptId).maybeSingle(),
      supabaseAdmin.from("prompt_chains")
        .select("chain_type, prompt_count, structure_score_trend, resolution_type, first_occurrence_for_participant, created_at")
        .eq("receipt_id", data.receiptId).order("created_at", { ascending: true }),
      supabaseAdmin.from("prompt_features")
        .select("prompt_position, c3_goal_clarity_score, c3_format_spec_detected, c3_exemplar_detected, c4_role_directive_detected, c4_collaboration_term_detected, c5_challenge_detected, c10_clarification_detected, c11_planning_element_score, c12_synthesis_detected, c14_attribution_detected, c16_meta_prompt_detected, semantic_drift_from_prior")
        .eq("receipt_id", data.receiptId).order("prompt_position", { ascending: true }),
      supabaseAdmin.from("fluency_analysis_runs")
        .select("run_id, analysis_output_json, overall_confidence, transcript_hash, created_at, input_type, tool_metadata")
        .eq("receipt_id", data.receiptId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      receipt.session_id
        ? supabaseAdmin.from("participant_fluency_profiles").select("*")
            .eq("participant_id", receipt.participant_id)
            .eq("session_id", receipt.session_id)
            .order("updated_at", { ascending: false }).limit(1).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    return {
      receipt,
      constructSignals: constructRes.data ?? null,
      chains: (chainsRes.data ?? []) as any[],
      promptFeatures: (featuresRes.data ?? []) as any[],
      fluencyRun: runRes.data ?? null,
      participantProfile: (profileRes as any).data ?? null,
    };
  });

/**
 * Generates a markdown audit document for a single receipt — full Engine V1
 * pipeline state. Admin only. Returns { content, filename } for client download.
 */
export const generateReceiptAuditDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ receiptId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { isAdmin } = await loadCallerRoles(context.userId);
    if (!isAdmin) throw new Error("Forbidden: admin only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getWorkflowTypeLabel, anonymousLabel } = await import("@/lib/displayNames");
    const { data: receipt } = await supabaseAdmin.from("receipts").select("*").eq("id", data.receiptId).maybeSingle();
    if (!receipt) throw new Error("Receipt not found");
    const [constructRes, chainsRes, featuresRes, runRes, profileRes] = await Promise.all([
      supabaseAdmin.from("receipt_construct_signals").select("*").eq("receipt_id", data.receiptId).maybeSingle(),
      supabaseAdmin.from("prompt_chains").select("*").eq("receipt_id", data.receiptId).order("created_at", { ascending: true }),
      supabaseAdmin.from("prompt_features").select("*").eq("receipt_id", data.receiptId).order("prompt_position", { ascending: true }),
      supabaseAdmin.from("fluency_analysis_runs").select("*").eq("receipt_id", data.receiptId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      receipt.session_id
        ? supabaseAdmin.from("participant_fluency_profiles").select("*")
            .eq("participant_id", receipt.participant_id).eq("session_id", receipt.session_id)
            .order("updated_at", { ascending: false }).limit(1).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const run = runRes.data as any;
    const signals = constructRes.data as any;
    const chains: any[] = (chainsRes.data ?? []) as any[];
    const features: any[] = (featuresRes.data ?? []) as any[];
    const profile = (profileRes as any).data;
    const dims: any[] = Array.isArray(run?.analysis_output_json?.dimensions)
      ? run.analysis_output_json.dimensions : [];
    const turnCount = Array.isArray(receipt.conversation_json)
      ? (receipt.conversation_json as any[]).length : 0;
    const lines: string[] = [];
    lines.push(`# Receipt Analysis Audit`);
    lines.push(`**Generated:** ${new Date().toISOString()}`);
    lines.push(`**Receipt ID:** ${receipt.id}`);
    lines.push(`**Participant:** ${anonymousLabel(receipt.participant_id)} (${receipt.participant_id})`);
    lines.push(`**Session:** ${receipt.session_id}`);
    lines.push(`**Tool:** ${receipt.tool_used ?? "—"}`);
    lines.push(`**Workflow type:** ${getWorkflowTypeLabel(receipt as any)}`);
    lines.push(`**Receipt created:** ${receipt.created_at}`);
    lines.push(`**Goal:** ${(receipt.metadata as any)?.goal ?? "(none provided)"}`);
    lines.push(``);
    lines.push(`---`);
    lines.push(`## 1. Source Data`);
    lines.push(``);
    if (run) {
      lines.push(`- **Analysis run ID:** ${run.run_id}`);
      lines.push(`- **Analysis created:** ${run.created_at}`);
      lines.push(`- **Transcript hash:** ${run.transcript_hash ?? "—"}`);
      lines.push(`- **Overall confidence:** ${run.overall_confidence ?? "—"}`);
      lines.push(`- **Input type:** ${run.input_type ?? "—"}`);
    } else {
      lines.push(`> ⚠️ No fluency analysis run found for this receipt.`);
    }
    lines.push(`- **Turn count:** ${turnCount}`);
    lines.push(``);
    lines.push(`---`);
    lines.push(`## 2. Engine V1 Construct Signals`);
    lines.push(``);
    if (signals) {
      lines.push(`| Signal | Value | Description |`);
      lines.push(`|--------|-------|-------------|`);
      lines.push(`| c3_avg_goal_clarity | ${signals.c3_avg_goal_clarity ?? "null"} | Avg goal clarity score (0–2) |`);
      lines.push(`| c3_format_spec_rate | ${signals.c3_format_spec_rate ?? "null"} | Fraction of prompts with format specification |`);
      lines.push(`| c3_exemplar_rate | ${signals.c3_exemplar_rate ?? "null"} | Fraction of prompts with exemplars |`);
      lines.push(`| c3_iteration_rate | ${signals.c3_iteration_rate ?? "null"} | Fraction of prompts with iteration markers |`);
      lines.push(`| c4_role_directive_rate | ${signals.c4_role_directive_rate ?? "null"} | Fraction of prompts setting a role |`);
      lines.push(`| c4_collaboration_term_count | ${signals.c4_collaboration_term_count ?? "null"} | Count of collaboration terms used |`);
      lines.push(`| c5_challenge_rate | ${signals.c5_challenge_rate ?? "null"} | Fraction of prompts challenging a response |`);
      lines.push(`| c5_challenge_count | ${signals.c5_challenge_count ?? "null"} | Raw count of challenges |`);
      lines.push(`| c10_clarification_rate | ${signals.c10_clarification_rate ?? "null"} | Fraction of prompts asking for clarification |`);
      lines.push(`| c11_mean_structure_score | ${signals.c11_mean_structure_score ?? "null"} | Mean prompt structure score (0–5 elements) |`);
      lines.push(`| c12_synthesis_rate | ${signals.c12_synthesis_rate ?? "null"} | Fraction of prompts synthesizing prior output |`);
      lines.push(`| c14_attribution_rate | ${signals.c14_attribution_rate ?? "null"} | Fraction of prompts with attribution |`);
      lines.push(`| c16_meta_rate | ${signals.c16_meta_rate ?? "null"} | Fraction of meta-prompts |`);
      lines.push(`| c16_meta_count | ${signals.c16_meta_count ?? "null"} | Raw count of meta-prompts |`);
    } else {
      lines.push(`> ⚠️ No construct signals. Engine V1 did not run or receipt predates V1.`);
    }
    lines.push(``);
    lines.push(`---`);
    lines.push(`## 3. Chain Detection`);
    lines.push(``);
    if (chains.length === 0) {
      lines.push(`No prompt chains detected.`);
    } else {
      lines.push(`${chains.length} chain(s) detected:`);
      lines.push(``);
      lines.push(`| Chain type | Prompt count | Resolution | Trend | Loop |`);
      lines.push(`|-----------|--------------|------------|-------|------|`);
      for (const c of chains) {
        const isLoop = c.chain_type === "loop";
        lines.push(`| ${c.chain_type ?? "—"} | ${c.prompt_count ?? "—"} | ${c.resolution_type ?? "—"} | ${c.structure_score_trend ?? "—"} | ${isLoop ? "YES ⚠️" : "no"} |`);
      }
      const loopCount = chains.filter((c: any) => c.chain_type === "loop").length;
      if (loopCount > 0) {
        lines.push(``);
        lines.push(`> ⚠️ **${loopCount} loop chain(s)** — repeated prompts without strategic pivots.`);
      }
    }
    lines.push(``);
    lines.push(`---`);
    lines.push(`## 4. Per-Prompt Features`);
    lines.push(``);
    if (features.length === 0) {
      lines.push(`No prompt features found.`);
    } else {
      lines.push(`${features.length} prompt(s) analyzed:`);
      lines.push(``);
      lines.push(`| Pos | Goal | Format | Role | Challenge | Clarify | Synthesis | Meta | Structure |`);
      lines.push(`|-----|------|--------|------|-----------|---------|-----------|------|-----------|`);
      for (const f of features) {
        lines.push(`| ${f.prompt_position ?? "—"} | ${f.c3_goal_clarity_score ?? "—"} | ${f.c3_format_spec_detected ? "✓" : "—"} | ${f.c4_role_directive_detected ? "✓" : "—"} | ${f.c5_challenge_detected ? "✓" : "—"} | ${f.c10_clarification_detected ? "✓" : "—"} | ${f.c12_synthesis_detected ? "✓" : "—"} | ${f.c16_meta_prompt_detected ? "✓" : "—"} | ${f.c11_planning_element_score ?? "—"} |`);
      }
    }
    lines.push(``);
    lines.push(`---`);
    lines.push(`## 5. Fluency Scoring`);
    lines.push(``);
    if (run && dims.length > 0) {
      lines.push(`**Overall level:** ${run.analysis_output_json?.overall_level ?? "—"}`);
      lines.push(`**Overall confidence:** ${run.overall_confidence ?? "—"}`);
      lines.push(``);
      lines.push(`| Dimension | Score | Evidence basis | Sample snippets |`);
      lines.push(`|-----------|-------|----------------|-----------------|`);
      for (const d of dims) {
        const snips = (d.evidence_snippets ?? []).slice(0, 2)
          .map((s: string) => `"${String(s).slice(0, 80)}…"`).join("; ");
        lines.push(`| ${d.display_name ?? d.canonical_name} | ${d.score ?? "—"} | ${d.evidence_basis ?? "—"} | ${snips || "—"} |`);
      }
      if (run.analysis_output_json?.summary) {
        lines.push(``);
        lines.push(`**Model summary:** ${run.analysis_output_json.summary}`);
      }
      if (run.analysis_output_json?.confidence_rationale) {
        lines.push(``);
        lines.push(`**Confidence rationale:** ${run.analysis_output_json.confidence_rationale}`);
      }
    } else {
      lines.push(`> ⚠️ No fluency scoring data available.`);
    }
    lines.push(``);
    lines.push(`---`);
    lines.push(`## 6. Participant Profile (current state)`);
    lines.push(``);
    if (profile) {
      const profileDims: [string, string][] = [
        ["direction", "Direction"],
        ["delegation", "Delegation"],
        ["discernment", "Discernment"],
        ["development", "Development"],
        ["strategic_agency", "Strategic Agency"],
        ["ethics", "Ethics & Data Responsibility"],
        ["efficiency", "Efficiency & Leverage"],
      ];
      lines.push(`| Dimension | Profile score | Term score | Confidence |`);
      lines.push(`|-----------|---------------|------------|------------|`);
      for (const [key, label] of profileDims) {
        lines.push(`| ${label} | ${(profile as any)[`${key}_score_profile`] ?? "—"} | ${(profile as any)[`${key}_score_term`] ?? "—"} | ${(profile as any)[`${key}_confidence`] ?? "—"} |`);
      }
    } else {
      lines.push(`> Profile not yet computed for this participant + session.`);
    }
    lines.push(``);
    lines.push(`---`);
    lines.push(`## 7. Data Quality Flags`);
    lines.push(``);
    const evidenceDist: Record<string, number> = dims.reduce((acc: any, d: any) => {
      const b = d.evidence_basis ?? "unknown";
      acc[b] = (acc[b] ?? 0) + 1; return acc;
    }, {});
    lines.push(`**Evidence basis distribution:**`);
    for (const [basis, count] of Object.entries(evidenceDist)) {
      lines.push(`- ${basis}: ${count}`);
    }
    const insufficientCount = evidenceDist["insufficient_evidence"] ?? 0;
    if (insufficientCount >= 4) {
      lines.push(``);
      lines.push(`> ⚠️ ${insufficientCount}/8 dimensions = insufficient evidence. Transcript may be too short for reliable scoring.`);
    }
    if (!signals) {
      lines.push(`> ⚠️ Engine V1 signals missing — predates V1 or pipeline failed silently.`);
    }
    lines.push(``);
    lines.push(`---`);
    lines.push(`*Generated from live DB state. Re-download for updated data.*`);
    return {
      content: lines.join("\n"),
      filename: `audit_${receipt.id.slice(0, 8)}_${new Date().toISOString().slice(0, 10)}.md`,
    };
  });

/**
 * Aggregates prompt_chains for a session: chain type distribution, loop rate,
 * average prompt count per chain. Loop = chain_type === 'loop' (no separate
 * column). RLS scopes: researchers see only owned sessions.
 * Called by: src/routes/researcher.sessions.$sessionId.tsx
 */
export const getSessionChainSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ sessionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: chains } = await supabase
      .from("prompt_chains")
      .select("chain_type, prompt_count, participant_id, receipt_id")
      .eq("session_id", data.sessionId);
    if (!chains?.length) {
      return { summary: [] as Array<{ chainType: string; count: number; avgPromptCount: number; loopCount: number }>, loopRate: null as number | null, totalChains: 0 };
    }
    const totalReceipts = new Set(chains.map((c: any) => c.receipt_id).filter(Boolean)).size;
    const receiptsWithLoop = new Set(
      chains.filter((c: any) => c.chain_type === "loop").map((c: any) => c.receipt_id).filter(Boolean)
    ).size;
    const loopRate = totalReceipts > 0 ? receiptsWithLoop / totalReceipts : null;
    const byType = new Map<string, { count: number; totalPrompts: number; loopCount: number }>();
    for (const c of chains as any[]) {
      const t = c.chain_type ?? "unknown";
      const cur = byType.get(t) ?? { count: 0, totalPrompts: 0, loopCount: 0 };
      cur.count += 1;
      cur.totalPrompts += c.prompt_count ?? 0;
      if (c.chain_type === "loop") cur.loopCount += 1;
      byType.set(t, cur);
    }
    const summary = Array.from(byType.entries())
      .map(([type, v]) => ({
        chainType: type,
        count: v.count,
        avgPromptCount: v.count > 0 ? v.totalPrompts / v.count : 0,
        loopCount: v.loopCount,
      }))
      .sort((a, b) => b.count - a.count);
    return { summary, loopRate, totalChains: chains.length };
  });

/* ----------------- admin: receipt extras (profile + recs) ---------------- */
/**
 * Returns the same `profile` and cached `recommendations` that the
 * participant sees on their receipt page, so admins/researchers can render
 * LiteracyReceipt with full parity. Recommendations are READ-ONLY from
 * cache — admins do not trigger an LLM call. If the participant hasn't
 * viewed the receipt yet, recommendations may be null.
 */
export const getAdminReceiptExtras = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ receiptId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getParticipantFluencyProfile } = await import("@/server/fluency-profile.server");

    const { data: receipt, error: rErr } = await supabaseAdmin
      .from("receipts")
      .select("id, participant_id, session_id")
      .eq("id", data.receiptId)
      .single();
    if (rErr || !receipt) throw new Error(rErr?.message || "Receipt not found");

    // Authorization: admin OR researcher who owns the receipt's session
    const { isAdmin, isResearcher } = await loadCallerRoles(context.userId);
    if (!isAdmin) {
      if (!isResearcher) throw new Error("Forbidden");
      const owned = await ownedSessionIds(context.userId);
      if (!owned.has(receipt.session_id as string)) throw new Error("Forbidden");
    }

    const profile = await getParticipantFluencyProfile(
      receipt.participant_id as string,
      receipt.session_id as string,
    );

    const { data: cached } = await supabaseAdmin
      .from("receipt_recommendations_cache" as any)
      .select("payload")
      .eq("receipt_id", receipt.id)
      .maybeSingle();
    const recommendations = (cached as any)?.payload ?? null;

    return { profile, recommendations };
  });

/* --------------------------- Launch additions --------------------------- */

/**
 * Batch-verify every Lab Work receipt for one participant. Flips
 * provenanceSource from 'auto_session' to 'admin_verified' for receipts
 * already labeled provenance='lab'. Logs an admin_access_log row and one
 * admin_receipt_decisions row per affected receipt.
 *
 * Use this from the admin user detail page after confirming the participant
 * is a real student in a real class. This is what populates the gold-tier
 * slice that anchors benchmark exports.
 */
export const verifyAllAutoLabReceipts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { isAdmin } = await loadCallerRoles(context.userId);
    if (!isAdmin) throw new Error("Forbidden: admin only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("receipts")
      .select("id, metadata")
      .eq("participant_id", data.userId);
    if (error) throw new Error(error.message);

    let changed = 0;
    for (const r of rows ?? []) {
      const meta = ((r as any).metadata ?? {}) as Record<string, unknown>;
      if (meta.provenance !== "lab") continue;
      if (meta.provenanceSource === "admin_verified") continue;
      const before = { provenance: meta.provenance, provenanceSource: meta.provenanceSource };
      const next = { ...meta, provenance: "lab", provenanceSource: "admin_verified" };
      const { error: upErr } = await supabaseAdmin
        .from("receipts").update({ metadata: next }).eq("id", (r as any).id);
      if (upErr) { console.error("[verify-batch] update failed", upErr); continue; }
      await supabaseAdmin.from("admin_receipt_decisions" as any).insert({
        receipt_id: (r as any).id,
        admin_user_id: context.userId,
        action: "verify_lab_provenance_batch",
        before_value: before,
        after_value: { provenance: "lab", provenanceSource: "admin_verified" },
        note: "Batch verification from user detail",
      });
      changed += 1;
    }

    await supabaseAdmin.from("admin_access_log" as any).insert({
      admin_user_id: context.userId,
      action: "batch_verify_lab",
      target_user_id: data.userId,
      target_resource: "receipts",
      metadata: { changed_count: changed, total_scanned: rows?.length ?? 0 },
    });

    return { ok: true, changed, scanned: rows?.length ?? 0 };
  });

/**
 * Export benchmark dataset rows (admin only). Returns redacted, dataset-ready
 * rows you can hand to a research partner. Includes the per-dimension scores,
 * workflow type, tags, provenance, evidence basis, and tool — but anonymizes
 * the participant via a stable hash and strips PII from preview text.
 *
 * Filters:
 *   - goldTierOnly: only Lab Work + admin_verified
 *   - sinceDays:    how far back to look (default 90)
 *   - limit:        cap rows (default 1000, max 5000)
 */
export const exportBenchmarkRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      goldTierOnly: z.boolean().optional(),
      sinceDays: z.number().int().min(1).max(365).optional(),
      limit: z.number().int().min(1).max(5000).optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { isAdmin } = await loadCallerRoles(context.userId);
    if (!isAdmin) throw new Error("Forbidden: admin only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { redactPII } = await import("@/lib/redact");
    const { anonymousLabel, getReceiptTools } = await import("@/lib/displayNames");

    const since = new Date(Date.now() - (data.sinceDays ?? 90) * 86400_000).toISOString();
    const limit = data.limit ?? 1000;

    const { data: receipts, error } = await supabaseAdmin
      .from("receipts")
      .select("id, participant_id, session_id, tool_used, prompt_preview, response_preview, metadata, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);

    const ids = (receipts ?? []).map(r => (r as any).id);
    const { data: histRows } = ids.length
      ? await supabaseAdmin
          .from("participant_fluency_history")
          .select("receipt_id, direction_score_profile, delegation_score_profile, discernment_score_profile, development_score_profile, ethics_score_profile, efficiency_score_profile, strategic_agency_score_profile, receipt_count_total")
          .in("receipt_id", ids)
      : { data: [] as any[] };
    const histByReceipt = new Map((histRows ?? []).map((h: any) => [h.receipt_id, h]));

    type BenchmarkRow = {
      receipt_id: string;
      participant_anon: string;
      created_at: string | null;
      workflow_type: string | null;
      workflow_type_explicit: boolean;
      provenance: string | null;
      provenance_source: string | null;
      tags: string[];
      purpose: string | null;
      tool_used: string | null;
      tools: string[];
      prompt_preview_redacted: string | null;
      response_preview_redacted: string | null;
      goal_redacted: string | null;
      direction_score: number | null;
      delegation_score: number | null;
      discernment_score: number | null;
      development_score: number | null;
      ethics_score: number | null;
      efficiency_score: number | null;
      strategic_agency_score: number | null;
      receipt_count_at_snapshot: number | null;
      rubric_version: string;
    };
    const out: BenchmarkRow[] = [];
    for (const r of receipts ?? []) {
      const meta = ((r as any).metadata ?? {}) as Record<string, any>;
      if (data.goldTierOnly && !(meta.provenance === "lab" && meta.provenanceSource === "admin_verified")) continue;
      const h = histByReceipt.get((r as any).id);
      out.push({
        receipt_id: (r as any).id,
        participant_anon: anonymousLabel((r as any).participant_id),
        created_at: (r as any).created_at,
        workflow_type: meta.workflowType ?? null,
        workflow_type_explicit: !!meta.workflowTypeSet,
        provenance: meta.provenance ?? null,
        provenance_source: meta.provenanceSource ?? null,
        tags: Array.isArray(meta.tags) ? meta.tags : [],
        purpose: meta.purpose ?? null,
        tool_used: (r as any).tool_used ?? null,
        tools: getReceiptTools(r as any),
        prompt_preview_redacted: redactPII((r as any).prompt_preview),
        response_preview_redacted: redactPII((r as any).response_preview),
        goal_redacted: redactPII(meta.goal ?? null),
        // Engine output snapshot at time of this receipt
        direction_score: h?.direction_score_profile ?? null,
        delegation_score: h?.delegation_score_profile ?? null,
        discernment_score: h?.discernment_score_profile ?? null,
        development_score: h?.development_score_profile ?? null,
        ethics_score: h?.ethics_score_profile ?? null,
        efficiency_score: h?.efficiency_score_profile ?? null,
        strategic_agency_score: h?.strategic_agency_score_profile ?? null,
        receipt_count_at_snapshot: h?.receipt_count_total ?? null,
        rubric_version: "v1",
      });
    }

    await supabaseAdmin.from("admin_access_log" as any).insert({
      admin_user_id: context.userId,
      action: "export_benchmark_rows",
      target_resource: "receipts",
      metadata: {
        row_count: out.length,
        gold_tier_only: !!data.goldTierOnly,
        since_days: data.sinceDays ?? 90,
        limit,
      },
    });

    return { rows: out, count: out.length, exportedAt: new Date().toISOString() };
  });

/* ------------------------ template picker toggle ----------------------- */

export const toggleTemplatePicker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ targetUserId: z.string().uuid(), enabled: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (!(roles ?? []).some((r: any) => r.role === "admin")) throw new Error("Forbidden");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ template_picker_enabled: data.enabled } as any)
      .eq("id", data.targetUserId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
