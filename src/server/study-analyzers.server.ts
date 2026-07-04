// Server-only: study-focused analyzers for the fork.
// Two templates:
//   - verification_risk  → checklist of unverified claims + informational risk items
//   - study_gaps         → knowledge gap map + prioritized study actions
//
// Each analyzer loads the receipt's conversation, calls Gemini via the Lovable
// AI Gateway (chatCompletion helper handles primary + fallback), parses JSON,
// and upserts into template_analyses. Analyses stay small and deterministic —
// no chunk stitching needed for these two templates.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { chatCompletion, SCORING_MODEL } from "./openai.server";

export type StudyTemplateKey = "verification_risk" | "study_gaps";

interface Turn {
  role: string;
  content: string;
  idx: number;
}

interface ReceiptContext {
  receiptId: string;
  turns: Turn[];
  threadTitle: string | null;
  tools: string[];
}

function clip(s: string, n: number) {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n) + "…";
}

function tryParseJson(text: string): any | null {
  if (!text) return null;
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const candidate = fenced ? fenced[1] : trimmed;
  try { return JSON.parse(candidate); } catch {}
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try { return JSON.parse(candidate.slice(start, end + 1)); } catch {}
  }
  return null;
}

async function loadReceiptContext(receiptId: string): Promise<ReceiptContext | { error: string }> {
  const { data: receipt, error: rErr } = await supabaseAdmin
    .from("receipts")
    .select("id, conversation_id, conversation_json, tool_used")
    .eq("id", receiptId)
    .single();
  if (rErr || !receipt) return { error: rErr?.message || "receipt not found" };

  let turns: Turn[] = [];
  if ((receipt as any).conversation_id) {
    const { data } = await supabaseAdmin
      .from("conversation_turns")
      .select("role, content, idx")
      .eq("conversation_id", (receipt as any).conversation_id)
      .order("idx");
    turns = (data ?? []).map((r: any) => ({ role: r.role, content: r.content, idx: r.idx }));
  }
  if (!turns.length && Array.isArray((receipt as any).conversation_json)) {
    turns = ((receipt as any).conversation_json as any[]).map((t, i) => ({
      role: String(t?.role ?? "user"),
      content: String(t?.content ?? ""),
      idx: typeof t?.idx === "number" ? t.idx : i,
    }));
  }

  const { data: rt } = await supabaseAdmin
    .from("receipt_threads")
    .select("thread_id")
    .eq("receipt_id", receiptId);
  const threadIds = (rt ?? []).map((r: any) => r.thread_id);
  let threadTitle: string | null = null;
  const tools: string[] = [];
  if (threadIds.length) {
    const { data: chs } = await supabaseAdmin
      .from("chat_threads")
      .select("title, summary, tool")
      .in("id", threadIds);
    if (chs?.length) {
      threadTitle = (chs[0] as any).summary ?? (chs[0] as any).title ?? null;
      for (const c of chs as any[]) if (c.tool) tools.push(c.tool);
    }
  }
  if (!tools.length && (receipt as any).tool_used) tools.push((receipt as any).tool_used);

  return { receiptId, turns, threadTitle, tools };
}

function buildRawThread(turns: Turn[], maxCharsPerTurn = 12000) {
  return turns.map((t) => ({
    turn_index: t.idx,
    role: t.role === "assistant" ? "ai" : "human",
    content: clip(t.content, maxCharsPerTurn),
  }));
}

// ---------- Verification & Risk ----------

const VERIFICATION_PROMPT = `You are Charlotte's Verification & Informational Risk analyzer for a student-facing study coach.

Given an AI conversation, identify:
  1. UNVERIFIED CLAIMS — specific factual statements the student took from the AI without checking (names, dates, statistics, definitions, formulas, causal claims). Prefer claims that would matter on a test or in a paper.
  2. INFORMATIONAL RISK ITEMS — hallucination-prone patterns actually present in the AI output, such as:
       - fake or unverifiable citations
       - invented statistics or precise numbers with no source
       - unsupported causal claims ("X causes Y")
       - fabricated quotes
       - overconfident claims in domains where the AI often errs

Return STRICT JSON with this shape and nothing else:
{
  "summary": "one-sentence plain-English overview for a student",
  "unverified_claims": [
    {
      "item_key": "stable-slug-unique-in-this-list",
      "title": "short label (≤ 60 chars)",
      "quote": "verbatim excerpt from the AI response (≤ 240 chars)",
      "turn_index": <number|null>,
      "why_risky": "one sentence, plain language",
      "suggested_source": "concrete way to verify (textbook chapter, primary source, official docs, etc.)"
    }
  ],
  "risk_items": [
    {
      "item_key": "stable-slug-unique-in-this-list",
      "title": "short label (≤ 60 chars)",
      "kind": "fake_citation | invented_stat | unsupported_causal | fabricated_quote | overconfident_claim | other",
      "quote": "verbatim excerpt (≤ 240 chars)",
      "turn_index": <number|null>,
      "severity": "low | medium | high",
      "explanation": "one sentence"
    }
  ],
  "null_reason": <string|null>
}

Rules:
- Never invent claims that are not in the conversation. If the thread has nothing risky, return empty arrays and set null_reason to a short explanation.
- item_key must be lowercase, alphanumeric + dashes, unique within its array, stable across re-runs on the same content.
- Cap unverified_claims at 12 and risk_items at 12. Prefer the most exam-relevant ones.
- Do NOT wrap the JSON in prose or code fences.`;

interface VerificationAnalysis {
  summary: string;
  unverified_claims: Array<{
    item_key: string;
    title: string;
    quote: string;
    turn_index: number | null;
    why_risky: string;
    suggested_source: string;
  }>;
  risk_items: Array<{
    item_key: string;
    title: string;
    kind: string;
    quote: string;
    turn_index: number | null;
    severity: "low" | "medium" | "high";
    explanation: string;
  }>;
  null_reason: string | null;
}

function normalizeVerification(raw: any): VerificationAnalysis {
  const seen = new Set<string>();
  const dedupe = (key: string, fallback: string) => {
    let k = String(key || fallback).toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 60) || fallback;
    let i = 2;
    while (seen.has(k)) k = `${k}-${i++}`;
    seen.add(k);
    return k;
  };
  const unverified = Array.isArray(raw?.unverified_claims) ? raw.unverified_claims.slice(0, 12) : [];
  const risky = Array.isArray(raw?.risk_items) ? raw.risk_items.slice(0, 12) : [];
  return {
    summary: String(raw?.summary ?? ""),
    unverified_claims: unverified.map((c: any, i: number) => ({
      item_key: dedupe(c?.item_key, `claim-${i + 1}`),
      title: clip(String(c?.title ?? "Unverified claim"), 80),
      quote: clip(String(c?.quote ?? ""), 260),
      turn_index: typeof c?.turn_index === "number" ? c.turn_index : null,
      why_risky: String(c?.why_risky ?? ""),
      suggested_source: String(c?.suggested_source ?? ""),
    })),
    risk_items: risky.map((r: any, i: number) => {
      const sev = String(r?.severity ?? "medium").toLowerCase();
      return {
        item_key: dedupe(r?.item_key, `risk-${i + 1}`),
        title: clip(String(r?.title ?? "Risk item"), 80),
        kind: String(r?.kind ?? "other"),
        quote: clip(String(r?.quote ?? ""), 260),
        turn_index: typeof r?.turn_index === "number" ? r.turn_index : null,
        severity: (sev === "low" || sev === "high" ? sev : "medium") as "low" | "medium" | "high",
        explanation: String(r?.explanation ?? ""),
      };
    }),
    null_reason: raw?.null_reason ? String(raw.null_reason) : null,
  };
}

// ---------- Study Gaps ----------

const STUDY_GAPS_PROMPT = `You are Charlotte's Study Gap analyzer for a student-facing study coach.

Given a student's AI-assisted study or homework conversation, produce a study plan focused on what the student still needs to practice WITHOUT AI.

Return STRICT JSON with this shape and nothing else:
{
  "summary": "one sentence for the student, e.g. 'You finished HW4. Here is what to review before you have to do it without AI.'",
  "context": {
    "course_or_subject": <string|null>,
    "assignment_or_topic": <string|null>,
    "assessment": <string|null>
  },
  "metrics": {
    "study_gaps_detected": <number>,
    "active_recall_count": <number>,
    "high_risk_count": <number>
  },
  "topics": [
    {
      "name": "short topic name (≤ 40 chars)",
      "status": "Improving | Needs review | Stable | High risk | Low evidence",
      "risk": "low | medium | medium_high | high",
      "evidence": "one sentence citing what the student did or didn't do in the conversation"
    }
  ],
  "study_actions": [
    {
      "title": "imperative action (≤ 80 chars)",
      "reason": "one sentence tying to a specific gap in the conversation",
      "action": "short concrete step (≤ 60 chars, e.g. '5-minute graph drill')"
    }
  ],
  "evidence_chips": ["short labels for observed behaviors (≤ 40 chars each)"],
  "highest_risk": "one sentence describing the single biggest exam risk",
  "null_reason": <string|null>
}

Rules:
- Only cite what is actually in the conversation. If it isn't a study/homework thread or evidence is too thin, return empty topics/study_actions and set null_reason.
- Cap topics at 10, study_actions at 8, evidence_chips at 6.
- risk levels: low = student demonstrated independent competence; medium = mixed evidence; medium_high = AI-led with partial student engagement; high = student relied on AI without any independent practice on an exam-relevant skill.
- Order topics and study_actions by exam risk, highest first.
- Do NOT wrap the JSON in prose or code fences.`;

type Risk = "low" | "medium" | "medium_high" | "high";

interface StudyGapsAnalysis {
  summary: string;
  context: {
    course_or_subject: string | null;
    assignment_or_topic: string | null;
    assessment: string | null;
  };
  metrics: {
    study_gaps_detected: number;
    active_recall_count: number;
    high_risk_count: number;
  };
  topics: Array<{ name: string; status: string; risk: Risk; evidence: string }>;
  study_actions: Array<{ title: string; reason: string; action: string }>;
  evidence_chips: string[];
  highest_risk: string;
  null_reason: string | null;
}

function normalizeStudyGaps(raw: any): StudyGapsAnalysis {
  const asRisk = (v: any): Risk => {
    const s = String(v ?? "medium").toLowerCase();
    return s === "low" || s === "medium_high" || s === "high" ? (s as Risk) : "medium";
  };
  const topics = Array.isArray(raw?.topics) ? raw.topics.slice(0, 10) : [];
  const actions = Array.isArray(raw?.study_actions) ? raw.study_actions.slice(0, 8) : [];
  const chips = Array.isArray(raw?.evidence_chips) ? raw.evidence_chips.slice(0, 6) : [];
  const highRiskCount = topics.filter((t: any) => asRisk(t?.risk) === "high").length;
  return {
    summary: String(raw?.summary ?? ""),
    context: {
      course_or_subject: raw?.context?.course_or_subject ? String(raw.context.course_or_subject) : null,
      assignment_or_topic: raw?.context?.assignment_or_topic ? String(raw.context.assignment_or_topic) : null,
      assessment: raw?.context?.assessment ? String(raw.context.assessment) : null,
    },
    metrics: {
      study_gaps_detected: Number(raw?.metrics?.study_gaps_detected ?? topics.length) || topics.length,
      active_recall_count: Number(raw?.metrics?.active_recall_count ?? 0) || 0,
      high_risk_count: Number(raw?.metrics?.high_risk_count ?? highRiskCount) || highRiskCount,
    },
    topics: topics.map((t: any) => ({
      name: clip(String(t?.name ?? "Topic"), 60),
      status: clip(String(t?.status ?? "Needs review"), 20),
      risk: asRisk(t?.risk),
      evidence: String(t?.evidence ?? ""),
    })),
    study_actions: actions.map((a: any) => ({
      title: clip(String(a?.title ?? ""), 100),
      reason: String(a?.reason ?? ""),
      action: clip(String(a?.action ?? ""), 80),
    })),
    evidence_chips: chips.map((c: any) => clip(String(c ?? ""), 60)).filter(Boolean),
    highest_risk: String(raw?.highest_risk ?? ""),
    null_reason: raw?.null_reason ? String(raw.null_reason) : null,
  };
}

// ---------- Runner ----------

const PROMPTS: Record<StudyTemplateKey, string> = {
  verification_risk: VERIFICATION_PROMPT,
  study_gaps: STUDY_GAPS_PROMPT,
};

export interface StudyAnalyzerResult {
  templateKey: StudyTemplateKey;
  ok: boolean;
  analysis?: unknown;
  error?: string;
  latencyMs: number;
}

async function runOne(
  templateKey: StudyTemplateKey,
  ctx: ReceiptContext,
): Promise<StudyAnalyzerResult> {
  const started = Date.now();
  const envelope = {
    raw_thread: buildRawThread(ctx.turns),
    thread_title: ctx.threadTitle,
    tools_used: ctx.tools,
    turn_count: ctx.turns.length,
  };
  const userMessage =
    "Here is the input for your analysis. Return only the JSON object as specified by your system prompt.\n\n" +
    JSON.stringify(envelope, null, 2);

  const result = await chatCompletion({
    label: `study-analysis:${templateKey}`,
    receiptId: ctx.receiptId,
    timeoutMs: 90_000,
    body: {
      model: SCORING_MODEL,
      messages: [
        { role: "system", content: PROMPTS[templateKey] },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 12_000,
    },
    validate: (data) => {
      const content = data?.choices?.[0]?.message?.content;
      return typeof content === "string" && content.length > 0;
    },
  });

  const upsert = async (analysis: any, status: "ok" | "error", errorMessage: string | null) => {
    await supabaseAdmin.from("template_analyses").upsert(
      {
        receipt_id: ctx.receiptId,
        template_key: templateKey,
        analysis_json: analysis,
        model: SCORING_MODEL,
        status,
        error_message: errorMessage,
        latency_ms: Date.now() - started,
      } as any,
      { onConflict: "receipt_id,template_key" },
    );
  };

  if (!result.ok || !result.data) {
    const errorMessage = result.errorMessage || "model call failed";
    await upsert({ null_reason: errorMessage }, "error", errorMessage);
    return { templateKey, ok: false, error: errorMessage, latencyMs: Date.now() - started };
  }

  const content: string = result.data?.choices?.[0]?.message?.content ?? "";
  const parsed = tryParseJson(content);
  if (!parsed) {
    const errorMessage = "model returned non-JSON content";
    await upsert({ null_reason: errorMessage }, "error", errorMessage);
    return { templateKey, ok: false, error: errorMessage, latencyMs: Date.now() - started };
  }

  const normalized =
    templateKey === "verification_risk"
      ? normalizeVerification(parsed)
      : normalizeStudyGaps(parsed);
  const nullReason = (normalized as any).null_reason as string | null;
  await upsert(normalized, nullReason ? "error" : "ok", nullReason);
  return {
    templateKey,
    ok: !nullReason,
    analysis: normalized,
    error: nullReason ?? undefined,
    latencyMs: Date.now() - started,
  };
}

export async function runStudyAnalysis(params: {
  receiptId: string;
  templateKey: StudyTemplateKey;
  force?: boolean;
}): Promise<StudyAnalyzerResult> {
  if (!params.force) {
    const { data: existing } = await supabaseAdmin
      .from("template_analyses")
      .select("template_key, status, analysis_json")
      .eq("receipt_id", params.receiptId)
      .eq("template_key", params.templateKey)
      .maybeSingle();
    if (existing && (existing as any).status === "ok") {
      return {
        templateKey: params.templateKey,
        ok: true,
        analysis: (existing as any).analysis_json,
        latencyMs: 0,
      };
    }
  }

  const ctxOrErr = await loadReceiptContext(params.receiptId);
  if ("error" in ctxOrErr) {
    return { templateKey: params.templateKey, ok: false, error: ctxOrErr.error, latencyMs: 0 };
  }
  return runOne(params.templateKey, ctxOrErr);
}
