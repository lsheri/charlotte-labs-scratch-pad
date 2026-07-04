// Server-only fluency scoring engine.
// Ports the live Charlotte Labs 8-dimension fluency analyzer.
// Source of truth: dimension_registry, behavior_library, framework_sources,
// and system_prompt_templates(template_key='fluency_analyzer') in the database.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { chatCompletion, SCORING_MODEL, SUMMARY_MODEL, CHUNK_SCORING_MODEL } from "./openai.server";

const MODEL_SNAPSHOT_VERSION = "charlotte-v2026-02-27-evidence-basis";

// Bump this whenever the scoring rubric or dimension set materially changes.
// Old runs are preserved under their original version — never silently re-scored.
export const RUBRIC_VERSION = "v1";

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

async function sha256Hex(text: string): Promise<string> {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function summarizeConversation(turns: ConversationTurn[], toolName?: string): Promise<string> {
  // Primary provider is Lovable AI Gateway; key check happens inside chatCompletion.
  const transcript = turns.slice(0, 30).map(t => `${t.role.toUpperCase()}: ${t.content.slice(0, 1000)}`).join("\n\n");
  const userContent = toolName ? `Tool used: ${toolName}\n\n${transcript}` : transcript;
  const systemPrompt = `You are writing the opening paragraph of a Charlotte fluency receipt. Summarize this AI conversation in 2-3 sentences.

Rules:

- Second person. Address the student as "you."

- Name the specific AI tool used if it was provided.

- Focus on what the student was trying to accomplish and whether they got there.

- Note the primary mode of collaboration: did they direct the AI with clear goals, iterate through feedback, delegate a full task, or explore open-endedly?

- Warm and direct. No filler phrases ("great job", "interesting", "it's worth noting").

- No scores, no rubric language, no dimension names. This sets up the evidence section — it does not replace it.

- Do not quote or repeat personal details from the transcript.`;
  try {
    const result = await chatCompletion({
      label: "summarize",
      body: {
        model: SUMMARY_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        max_completion_tokens: 1200,
      },
    });
    if (!result.ok || !result.data) return "";
    return result.data.choices?.[0]?.message?.content?.trim() ?? "";
  } catch (e) {
    console.error("summarize failed", e);
    return "";
  }
}

export async function runFluencyAnalysis(params: {
  sessionId: string;
  participantId: string;
  receiptId?: string | null;
  toolUsed: string;
  conversationContent: string;
  subjectType?: "student" | "corporate";
  receiptProfile?: "player" | "instructor" | "researcher" | "corporate";
  consentStoreTranscript?: boolean;
  goal?: string | null;
}): Promise<{ runId: string | null; analysis: any | null; error?: string }> {
  // Primary provider is Lovable AI Gateway (Gemini, 1M context). Key
  // presence is checked inside chatCompletion(); we never block on OpenAI here.

  const subjectType = params.subjectType ?? "student";
  const receiptProfile = params.receiptProfile ?? "player";
  const storeTranscript = !!params.consentStoreTranscript;

  // Compute transcript hash up front for audit trail
  const transcriptHash = await sha256Hex(params.conversationContent);

  // Load active dimensions, behaviors, sources, and analyzer template
  const [dimRes, behRes, srcRes, tmplRes] = await Promise.all([
    supabaseAdmin.from("dimension_registry").select("*").eq("active", true).order("priority_rank"),
    supabaseAdmin.from("behavior_library").select("*").eq("active", true),
    supabaseAdmin.from("framework_sources").select("source_id, name, url, version_label, content_snapshot_text, content_hash, source_type").eq("active", true),
    supabaseAdmin.from("system_prompt_templates").select("prompt_text").eq("template_key", "fluency_analyzer").eq("active", true).maybeSingle(),
  ]);

  if (!tmplRes.data) {
    return { runId: null, analysis: null, error: "Fluency analyzer template not found in system_prompt_templates" };
  }

  // Filter internal:// sources from LLM context (cited only via behaviors, never in receipts)
  const allSources = (srcRes.data ?? []) as any[];
  const researchSources = allSources.filter(s => !s.url?.startsWith("internal://"));
  const sourcesForLLM = researchSources.map(s => ({
    source_id: s.source_id,
    name: s.name,
    url: s.url,
    version_label: s.version_label,
    content_hash: s.content_hash || null,
    excerpt: s.content_snapshot_text ? s.content_snapshot_text.slice(0, 1500) : null,
  }));

  // Inject template variables
  let systemPrompt = tmplRes.data.prompt_text;
  systemPrompt = systemPrompt.replace("{{DIMENSIONS}}", JSON.stringify(dimRes.data ?? [], null, 2));
  systemPrompt = systemPrompt.replace("{{BEHAVIORS}}", JSON.stringify(behRes.data ?? [], null, 2));
  systemPrompt = systemPrompt.replace("{{SOURCES}}", JSON.stringify(sourcesForLLM, null, 2));

  // If system prompt is too large, strip source excerpts to save context budget
  if (systemPrompt.length > 50_000) {
    console.warn(`[fluency] system prompt ${systemPrompt.length} chars — compressing sources`);
    const compressedSources = sourcesForLLM.map(s => ({ ...s, excerpt: null }));
    systemPrompt = tmplRes.data.prompt_text
      .replace("{{DIMENSIONS}}", JSON.stringify(dimRes.data ?? [], null, 2))
      .replace("{{BEHAVIORS}}", JSON.stringify(behRes.data ?? [], null, 2))
      .replace("{{SOURCES}}", JSON.stringify(compressedSources, null, 2));
  }

  // Academic addendum — this fork is a student-facing study coach, so frame
  // fluency around learning outcomes rather than "workflow output".
  systemPrompt += `

--- ACADEMIC CONTEXT ---
This subject is a STUDENT using AI as a study partner (homework, reading, exam
prep, projects). Frame every dimension and behavior through learning outcomes,
not "workflow output" or professional deliverables:
- Reward evidence of independent thinking, active recall, and verification of
  AI claims against course material.
- Flag over-reliance patterns typical in students: copy-pasting AI answers,
  skipping the "why", not testing understanding, treating hallucinated
  citations as trustworthy.
- When the conversation references a course, assignment, textbook, syllabus,
  or exam, mention it explicitly in the summary and tie coaching to it.
- Coaching should be actionable *before the next quiz or assignment*, not
  "before the next sprint".`;


  const content = params.conversationContent;

  // Schema for the analyzer is enforced by the system prompt + OpenAI JSON
  // mode (response_format: json_object). We previously used tool_calls with
  // a strict parameters schema; gpt-5-mini at low reasoning effort would
  // occasionally return an empty tool_call.arguments string, which silently
  // killed the whole receipt. Plain JSON mode is simpler and more reliable.


  // Chunk the transcript with overlap so we don't silently drop the tail.
  // CHUNK_SIZE deliberately stays large — for a 200-turn / ~80K-char
  // conversation this is still a single chunk. Multi-chunk runs only kick
  // in for transcripts >115K chars (~300+ medium-length turns).
  const CHUNK_SIZE = 120_000;
  const OVERLAP = 5_000;
  const chunks: string[] = [];
  let pos = 0;
  while (pos < content.length) {
    chunks.push(content.slice(pos, pos + CHUNK_SIZE));
    pos += CHUNK_SIZE - OVERLAP;
  }
  if (chunks.length === 0) chunks.push("");

  // Run all chunks IN PARALLEL. Sequential gpt-5 calls with 8K output
  // routinely exceeded the Cloudflare Worker CPU budget and got the
  // request killed mid-loop, dropping every prior chunk's work. Parallel
  // gpt-5-mini calls finish in ~5–15s wall time regardless of chunk
  // count (up to the Worker subrequest cap of 50), so every turn of a
  // 100+ turn conversation still gets scored.
  const analyzeChunk = async (chunk: string, idx: number): Promise<any | null> => {
    const goalLine = params.goal
      ? `Participant's stated goal for this session: "${params.goal}"\n\n`
      : "";
    // JSON mode: model returns the analysis directly as a JSON object in
    // message.content. Much simpler and more reliable than tool-calling —
    // no empty tool_call args failure mode. The system prompt already
    // describes the required shape; we restate "respond with JSON" here so
    // OpenAI's json_object mode is happy.
    const userMessage = `Analyze the following content for AI fluency (chunk ${idx + 1} of ${chunks.length}). Subject is a ${subjectType} using ${params.toolUsed || "unknown tool"}.\n\n${goalLine}Respond with a single JSON object matching the schema described in the system prompt. Required top-level keys: dimensions (array), overall_level, overall_confidence, confidence_rationale, summary.\n\n--- CONTENT ---\n${chunk}`;
    const result = await chatCompletion({
      label: `fluency-analyze-chunk-${idx + 1}`,
      receiptId: params.receiptId ?? null,
      participantId: params.participantId,
      body: {
        model: CHUNK_SCORING_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 6000,
      },
      timeoutMs: 14_000,
      // 200 OK with empty/unparseable content → fall through to Lovable.
      validate: (d) => {
        const raw = d?.choices?.[0]?.message?.content;
        if (typeof raw !== "string" || raw.length < 2) return false;
        try { JSON.parse(raw); return true; } catch { return false; }
      },
    });

    if (!result.ok || !result.data) {
      console.error(`fluency-analyze chunk ${idx + 1} failed`, result.errorMessage);
      return null;
    }
    const d = result.data;
    const finishReason = d?.choices?.[0]?.finish_reason;
    const raw = d?.choices?.[0]?.message?.content || "";
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.error(
        `fluency-analyze chunk ${idx + 1} parse failed`,
        { finishReason, rawLen: raw.length, usage: d?.usage, provider: result.provider },
      );
      return null;
    }
  };


  const settled = await Promise.all(chunks.map((c, i) => analyzeChunk(c, i)));
  const analyses: any[] = settled.filter((a): a is any => a !== null);


  if (analyses.length === 0) {
    return { runId: null, analysis: null, error: "All analysis chunks failed" };
  }

  // Merge: per dimension, prefer the chunk with direct_evidence
  let analysis: any = analyses[0];
  if (analyses.length > 1) {
    analysis = {
      ...analyses[0],
      confidence_rationale: {
        ...analyses[0].confidence_rationale,
        transcript_completeness: "full",
      },
      dimensions: (analyses[0].dimensions || []).map((dim: any, i: number) => {
        const candidates = analyses.map(a => a.dimensions?.[i]).filter(Boolean);
        return candidates.find((c: any) => c.evidence_basis === "direct_evidence") ?? candidates[0] ?? dim;
      }),
    };
  }

  // Strip internal:// citations the LLM may have included anyway
  if (Array.isArray(analysis.dimensions)) {
    for (const dim of analysis.dimensions) {
      if (Array.isArray(dim.citations)) {
        dim.citations = dim.citations.filter((c: any) => !c?.url?.startsWith("internal://"));
      }
    }
  }

  // Persist run
  const { data: run, error: runErr } = await supabaseAdmin
    .from("fluency_analysis_runs")
    .insert({
      session_id: params.sessionId,
      participant_id: params.participantId,
      receipt_id: params.receiptId ?? null,
      input_type: "transcript",
      tool_metadata: {
        tool_used: params.toolUsed || "unknown",
        scoring_model: SCORING_MODEL,
        chunk_scoring_model: CHUNK_SCORING_MODEL,
        chunks_total: chunks.length,
        chunks_succeeded: analyses.length,
        model_snapshot_version: MODEL_SNAPSHOT_VERSION,
      },
      analysis_output_json: analysis,
      overall_confidence: analysis.overall_confidence ?? null,
      created_by_user_id: params.participantId,
      transcript_hash: transcriptHash,
      subject_type: subjectType,
      receipt_profile: receiptProfile,
      transcript_consent: storeTranscript,
      consent_source: storeTranscript ? "explicit_opt_in" : "opted_out",
      raw_transcript: storeTranscript ? content : null,
      privacy_flags: { transcript_stored: storeTranscript },
      rubric_version: RUBRIC_VERSION,
    } as any)
    .select("run_id")
    .single();

  if (runErr || !run) {
    console.error("insert run failed", runErr);
    return { runId: null, analysis, error: runErr?.message };
  }

  // Role-based redaction for the receipt rendering
  let rendered = analysis;
  let redaction: "none" | "minimal" | "strong" = "minimal";
  if (receiptProfile === "player" || receiptProfile === "instructor") {
    rendered = {
      ...analysis,
      dimensions: (analysis.dimensions || []).map((d: any) =>
        d.canonical_name === "capital_stewardship"
          ? { ...d, explanation: "Org-facing metric withheld", score: null, behaviors_observed: [], evidence_snippets: [] }
          : d
      ),
    };
    redaction = "minimal";
  } else if (receiptProfile === "corporate") {
    redaction = "none";
  }

  // Build citations: prefer LLM-provided (deduped), fall back to research sources
  const llmCitations: any[] = [];
  for (const dim of (analysis.dimensions || [])) {
    for (const c of (dim.citations || [])) {
      if (!c?.url?.startsWith("internal://") && !llmCitations.find(x => x.source_id === c.source_id)) {
        llmCitations.push(c);
      }
    }
  }
  const citations = llmCitations.length > 0 ? llmCitations : researchSources.map(s => ({
    source_id: s.source_id, name: s.name, url: s.url, version_label: s.version_label,
  }));

  await supabaseAdmin.from("fluency_receipts").insert({
    run_id: run.run_id,
    rendered_summary: analysis.summary ?? null,
    rendered_json: rendered,
    citations,
    redaction_level: redaction,
  } as any);

  return { runId: run.run_id, analysis };
}

// =============================================================================
// Staged fluency analysis — single-call architecture.
//
// Gemini (via Lovable AI Gateway) has a 1M token context window, so any
// realistic transcript fits in a single LLM call. No chunking, no map-reduce,
// no resume logic, no digest compression. One call = one timeout = one
// failure point. If the call fails, the job's MAX_ATTEMPTS retry handles it.
//
// The bucket classifier is kept ONLY for UI/ETA copy ("long conversation
// detected") — it no longer drives any branching logic in the analysis path.
// =============================================================================

export type FluencyBucket = "small" | "medium" | "large" | "xlarge";

export function classifyBucket(turnCount: number): FluencyBucket {
  if (turnCount <= 30) return "small";
  if (turnCount <= 80) return "medium";
  if (turnCount <= 200) return "large";
  return "xlarge";
}

function turnsToContent(turns: ConversationTurn[]): string {
  return turns.map(t => `${t.role.toUpperCase()}: ${t.content}`).join("\n\n");
}

export async function runStagedFluencyAnalysis(params: {
  jobId: string;
  sessionId: string;
  participantId: string;
  receiptId: string;
  toolUsed: string;
  turns: ConversationTurn[];
  goal?: string | null;
  onProgress?: (p: { chunksDone: number; chunksTotal: number; bucket: FluencyBucket }) => Promise<void> | void;
}): Promise<{ runId: string | null; analysis: any | null; bucket: FluencyBucket; chunksTotal: number; error?: string }> {
  const bucket = classifyBucket(params.turns.length);

  // Single-call architecture: always 1 "chunk" from the UI's perspective.
  await params.onProgress?.({ chunksDone: 0, chunksTotal: 1, bucket });

  // Load registry once.
  const [dimRes, behRes, srcRes, tmplRes] = await Promise.all([
    supabaseAdmin.from("dimension_registry").select("*").eq("active", true).order("priority_rank"),
    supabaseAdmin.from("behavior_library").select("*").eq("active", true),
    supabaseAdmin.from("framework_sources").select("source_id, name, url, version_label, content_snapshot_text, content_hash, source_type").eq("active", true),
    supabaseAdmin.from("system_prompt_templates").select("prompt_text").eq("template_key", "fluency_analyzer").eq("active", true).maybeSingle(),
  ]);
  if (!tmplRes.data) {
    return { runId: null, analysis: null, bucket, chunksTotal: 1, error: "Fluency analyzer template not found" };
  }

  const allSources = (srcRes.data ?? []) as any[];
  const researchSources = allSources.filter(s => !s.url?.startsWith("internal://"));
  const sourcesCompact = researchSources.map(s => ({
    source_id: s.source_id, name: s.name, url: s.url, version_label: s.version_label,
    content_hash: s.content_hash || null,
    excerpt: s.content_snapshot_text ? s.content_snapshot_text.slice(0, 1500) : null,
  }));
  let systemPrompt = tmplRes.data.prompt_text
    .replace("{{DIMENSIONS}}", JSON.stringify(dimRes.data ?? [], null, 2))
    .replace("{{BEHAVIORS}}", JSON.stringify(behRes.data ?? [], null, 2))
    .replace("{{SOURCES}}", JSON.stringify(sourcesCompact, null, 2));

  // If system prompt is unusually large, strip source excerpts to save context.
  if (systemPrompt.length > 50_000) {
    console.warn(`[staged-fluency] system prompt ${systemPrompt.length} chars — compressing sources`);
    const compressedSources = sourcesCompact.map(s => ({ ...s, excerpt: null }));
    systemPrompt = tmplRes.data.prompt_text
      .replace("{{DIMENSIONS}}", JSON.stringify(dimRes.data ?? [], null, 2))
      .replace("{{BEHAVIORS}}", JSON.stringify(behRes.data ?? [], null, 2))
      .replace("{{SOURCES}}", JSON.stringify(compressedSources, null, 2));
  }

  const fullContent = turnsToContent(params.turns);
  const transcriptHash = await sha256Hex(fullContent);

  // Model selection by transcript size — INVERTED from "bigger = stronger model".
  //
  // Why Flash at 50+ turns (not Pro): Gemini 2.5 Pro on a 50+ turn transcript
  // routinely takes 45-90s of active generation. Cloudflare Workers have a
  // hard CPU budget per request even with waitUntil() background processing —
  // large Pro calls were getting CPU-killed mid-stream and the receipt would
  // stall in `analyzing` until the reaper retried it (and hit the same wall,
  // eventually dead-lettering). Gemini Flash on the same transcript completes
  // in 10-25s, comfortably inside the budget. Quality drop is modest;
  // reliability gain is total. See docs/solutions/long-transcript-handling.md.
  const useFlash = params.turns.length >= 50;
  const model = useFlash ? CHUNK_SCORING_MODEL : SCORING_MODEL;
  const timeoutMs = useFlash ? 45_000 : 75_000;

  const activeDims = (dimRes.data ?? []) as any[];
  const activeDimNames: string[] = activeDims.map(d => d.canonical_name);
  const goalLine = params.goal ? `Participant's stated goal for this session: "${params.goal}"\n\n` : "";
  const dimensionDirective = `You MUST return exactly ${activeDimNames.length} dimension objects — one for each canonical_name below — no omissions, no additions:\n${activeDimNames.map(n => `  - ${n}`).join("\n")}\n\nIf a dimension has insufficient evidence in the transcript, still include it with score=null, evidence_basis="insufficient_evidence", evidence_snippets=[], behaviors_observed=[], and a one-sentence explanation noting what was missing. Never silently drop a dimension.\n\n`;
  const userMessage = `Analyze the following AI conversation transcript for fluency. Subject is a student using ${params.toolUsed || "unknown tool"}.\n\n${goalLine}${dimensionDirective}Respond with a single JSON object matching the schema described in the system prompt. Required top-level keys: dimensions (array of ${activeDimNames.length}), overall_level, overall_confidence, confidence_rationale, summary.\n\n--- TRANSCRIPT (${params.turns.length} turns) ---\n${fullContent}`;

  const result = await chatCompletion({
    label: `fluency-staged-${bucket}`,
    receiptId: params.receiptId,
    participantId: params.participantId,
    body: {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 16000,
    },
    timeoutMs,
    validate: (d) => {
      const raw = d?.choices?.[0]?.message?.content;
      if (typeof raw !== "string" || raw.length < 2) return false;
      try { JSON.parse(raw); return true; } catch { return false; }
    },
  });

  if (!result.ok || !result.data) {
    await params.onProgress?.({ chunksDone: 0, chunksTotal: 1, bucket });
    return { runId: null, analysis: null, bucket, chunksTotal: 1, error: result.errorMessage ?? "fluency analysis failed" };
  }

  let analysis: any = null;
  try {
    analysis = JSON.parse(result.data?.choices?.[0]?.message?.content ?? "");
  } catch {
    return { runId: null, analysis: null, bucket, chunksTotal: 1, error: "fluency analysis parse failed" };
  }

  // Normalize: synthesize insufficient_evidence stubs for any dimension the
  // model omitted, so downstream rendering always shows all 8 active dims.
  if (!Array.isArray(analysis.dimensions)) analysis.dimensions = [];
  const returnedNames = new Set(analysis.dimensions.map((d: any) => d?.canonical_name));
  for (const dim of activeDims) {
    if (!returnedNames.has(dim.canonical_name)) {
      analysis.dimensions.push({
        canonical_name: dim.canonical_name,
        display_name: dim.display_name,
        score: null,
        evidence_basis: "insufficient_evidence",
        evidence_snippets: [],
        behaviors_observed: [],
        explanation: "Not enough evidence in this transcript to score this dimension.",
        citations: [],
        is_charlotte_added: dim.is_charlotte_overlay ?? false,
        synthesized: true,
      });
    }
  }

  // Strip internal:// citations the LLM may have included anyway
  if (Array.isArray(analysis.dimensions)) {
    for (const dim of analysis.dimensions) {
      if (Array.isArray(dim.citations)) {
        dim.citations = dim.citations.filter((c: any) => !c?.url?.startsWith("internal://"));
      }
    }
  }

  // Persist run
  const { data: run, error: runErr } = await supabaseAdmin
    .from("fluency_analysis_runs")
    .insert({
      session_id: params.sessionId,
      participant_id: params.participantId,
      receipt_id: params.receiptId,
      input_type: "transcript",
      tool_metadata: {
        tool_used: params.toolUsed || "unknown",
        scoring_model: model,
        provider: result.provider,
        bucket,
        turn_count: params.turns.length,
        model_snapshot_version: MODEL_SNAPSHOT_VERSION,
        analysis_mode: "single_call",
      },
      analysis_output_json: analysis,
      overall_confidence: analysis.overall_confidence ?? null,
      created_by_user_id: params.participantId,
      transcript_hash: transcriptHash,
      subject_type: "student",
      receipt_profile: "player",
      transcript_consent: false,
      consent_source: "opted_out",
      raw_transcript: null,
      privacy_flags: { transcript_stored: false },
      rubric_version: RUBRIC_VERSION,
    } as any)
    .select("run_id").single();

  if (runErr || !run) {
    console.error("[staged-fluency] insert run failed", runErr);
    return { runId: null, analysis, bucket, chunksTotal: 1, error: runErr?.message };
  }

  // Receipt rendering (player redaction default)
  const rendered = {
    ...analysis,
    dimensions: (analysis.dimensions || []).map((d: any) =>
      d.canonical_name === "capital_stewardship"
        ? { ...d, explanation: "Org-facing metric withheld", score: null, behaviors_observed: [], evidence_snippets: [] }
        : d
    ),
  };
  const llmCitations: any[] = [];
  for (const dim of (analysis.dimensions || [])) {
    for (const c of (dim.citations || [])) {
      if (!c?.url?.startsWith("internal://") && !llmCitations.find(x => x.source_id === c.source_id)) {
        llmCitations.push(c);
      }
    }
  }
  const citations = llmCitations.length > 0 ? llmCitations : researchSources.map(s => ({
    source_id: s.source_id, name: s.name, url: s.url, version_label: s.version_label,
  }));
  await supabaseAdmin.from("fluency_receipts").insert({
    run_id: run.run_id,
    rendered_summary: analysis.summary ?? null,
    rendered_json: rendered,
    citations,
    redaction_level: "minimal",
  } as any);

  await params.onProgress?.({ chunksDone: 1, chunksTotal: 1, bucket });

  return { runId: run.run_id, analysis, bucket, chunksTotal: 1 };
}

