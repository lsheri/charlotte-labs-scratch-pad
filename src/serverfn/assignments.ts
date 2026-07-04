import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Class + assignment tree for sidebar rendering. */
export const listClassSidebar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: memberships, error } = await supabase
      .from("session_participants")
      .select(
        "session_id, research_sessions!inner(id, name, metadata)"
      )
      .eq("participant_id", userId)
      .not("consent_accepted_at", "is", null);
    if (error) throw new Error(error.message);

    const classes = (memberships ?? [])
      .map((m: any) => m.research_sessions)
      .filter((s: any) => (s.metadata as any)?.kind === "class");

    if (!classes.length) return { classes: [] as any[] };

    const ids = classes.map((c: any) => c.id);
    const { data: assignments } = await supabase
      .from("class_assignments")
      .select("id, session_id, code, title, due_at")
      .in("session_id", ids)
      .order("due_at", { ascending: true, nullsFirst: false });

    return {
      classes: classes.map((c: any) => ({
        id: c.id,
        name: c.name,
        courseCode: (c.metadata as any)?.course_code ?? null,
        assignments: (assignments ?? [])
          .filter((a: any) => a.session_id === c.id)
          .map((a: any) => ({
            id: a.id,
            code: a.code,
            title: a.title,
            dueAt: a.due_at,
          })),
      })),
    };
  });

/** Thread ↔ assignment mappings for the current user. */
export const listMyAssignmentMappings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("assignment_threads")
      .select("assignment_id, thread_id, mapped_at")
      .eq("participant_id", userId);
    if (error) throw new Error(error.message);
    return { mappings: data ?? [] };
  });

export const mapThreadToAssignment = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ threadId: z.string().uuid(), assignmentId: z.string().uuid() }).parse
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("assignment_threads")
      .insert({
        assignment_id: data.assignmentId,
        thread_id: data.threadId,
        participant_id: userId,
      });
    if (error && !/duplicate key/i.test(error.message)) throw new Error(error.message);
    return { ok: true };
  });

export const unmapThreadFromAssignment = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ threadId: z.string().uuid(), assignmentId: z.string().uuid() }).parse
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("assignment_threads")
      .delete()
      .eq("participant_id", userId)
      .eq("assignment_id", data.assignmentId)
      .eq("thread_id", data.threadId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Record that a receipt was generated as a submission for an assignment. */
export const attachReceiptToAssignment = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ receiptId: z.string().uuid(), assignmentId: z.string().uuid() }).parse
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("assignment_submissions")
      .insert({
        assignment_id: data.assignmentId,
        participant_id: userId,
        receipt_id: data.receiptId,
        submitted_at: new Date().toISOString(),
      });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Assignment detail + this student's mapped threads and latest submission. */
export const getAssignmentDetail = createServerFn({ method: "GET" })
  .inputValidator(z.object({ assignmentId: z.string().uuid() }).parse)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: a, error } = await supabase
      .from("class_assignments")
      .select("id, session_id, code, title, description, due_at, expected_tools, rubric, research_sessions!inner(id, name, metadata)")
      .eq("id", data.assignmentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!a) throw new Error("Assignment not found");

    const { data: mapped } = await supabase
      .from("assignment_threads")
      .select("thread_id, mapped_at, chat_threads!inner(id, title, tool, first_captured_at, last_captured_at, turn_count, summary)")
      .eq("assignment_id", data.assignmentId)
      .eq("participant_id", userId);

    const { data: subs } = await supabase
      .from("assignment_submissions")
      .select("id, receipt_id, submitted_at, notes")
      .eq("assignment_id", data.assignmentId)
      .eq("participant_id", userId)
      .order("submitted_at", { ascending: false });

    const ws: any = (a as any).research_sessions;
    return {
      assignment: {
        id: a.id,
        classId: a.session_id,
        className: ws?.name,
        courseCode: (ws?.metadata as any)?.course_code ?? null,
        code: a.code,
        title: a.title,
        description: a.description,
        dueAt: a.due_at,
        expectedTools: a.expected_tools ?? [],
        rubric: a.rubric,
      },
      mappedThreads: (mapped ?? []).map((m: any) => ({
        ...m.chat_threads,
        mappedAt: m.mapped_at,
      })),
      submissions: subs ?? [],
    };
  });
