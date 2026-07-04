// Server-only: runs per-template AI analyses for a receipt.
// One analyzer per template, each backed by an editable row in
// public.system_prompt_templates so prompts can be tuned without redeploy.
//
// The engine builds a JSON envelope of {raw_thread, layer1_scores,
// layer2_signals, token_data} and hands it to Gemini 2.5 Pro via the
// Lovable AI Gateway. The model returns the strict JSON shape documented
// in each prompt; we parse, validate-shape, and upsert into template_analyses.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { chatCompletion, SCORING_MODEL } from "./openai.server";

export type TemplateKey =
  | "thinking_map"
  | "ledger"
  | "still_yours"
  | "proof_card"
  | "shield"
  | "impact_statement"
  | "impact_proof"
  | "context_map";

const PROMPT_KEY: Record<TemplateKey, string> = {
  thinking_map: "thinking_map_analyzer",
  ledger: "ledger_analyzer",
  still_yours: "still_yours_analyzer",
  proof_card: "proof_card_analyzer",
  shield: "shield_analyzer",
  impact_statement: "impact_statement_analyzer",
  impact_proof: "impact_proof_analyzer",
  context_map: "context_map_analyzer",
};

interface PromptRow {
  id: string;
  prompt_text: string;
  version: number;
}

async function loadPrompt(templateKey: TemplateKey): Promise<PromptRow | null> {
  const { data, error } = await supabaseAdmin
    .from("system_prompt_templates")
    .select("id, prompt_text, version")
    .eq("template_key", PROMPT_KEY[templateKey])
    .eq("active", true)
    .maybeSingle();
  if (error || !data) return null;
  return data as PromptRow;
}

interface Turn {
  id: string | null;
  role: string;
  content: string;
  idx: number;
}

interface AnalysisContext {
  receiptId: string;
  turns: Turn[];
  tools: string[];
  threadTitle: string | null;
  finalArtifact: { turnIndex: number | null; content: string } | null;
  layer1Scores: unknown[];
  layer2Signals: Record<string, unknown>;
  tokenData: { available: boolean; turns: unknown[] };
}

function clip(s: string, n: number) {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n) + "…";
}

function buildRawThread(turns: Turn[], maxCharsPerTurn = 20000) {
  return turns.map((t) => ({
    turn_index: t.idx,
    role: t.role === "assistant" ? "ai" : "human",
    content: clip(t.content, maxCharsPerTurn),
  }));
}

function tryParseJson(text: string): unknown | null {
  if (!text) return null;
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const candidate = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function loadReceiptContext(
  receiptId: string,
): Promise<AnalysisContext | { error: string }> {
  const { data: receipt, error: rErr } = await supabaseAdmin
    .from("receipts")
    .select(
      "id, tool_used, conversation_id, conversation_json, response_preview, prompt_preview",
    )
    .eq("id", receiptId)
    .single();
  if (rErr || !receipt) return { error: rErr?.message || "receipt not found" };

  const { data: rt } = await supabaseAdmin
    .from("receipt_threads")
    .select("thread_id, position")
    .eq("receipt_id", receiptId)
    .order("position");
  const threadIds = (rt ?? []).map((r: any) => r.thread_id);

  let threadTitle: string | null = null;
  const tools: string[] = [];
  if (threadIds.length) {
    const { data: chs } = await supabaseAdmin
      .from("chat_threads")
      .select("id, title, tool, summary")
      .in("id", threadIds);
    if (chs && chs.length) {
      // Prefer the AI-generated summary as the canonical thread title;
      // fall back to the raw chat title when no summary exists.
      threadTitle =
        ((chs[0] as any).summary as string | null) ??
        ((chs[0] as any).title as string | null) ??
        null;
      for (const c of chs as any[]) if (c.tool) tools.push(c.tool);
    }
  }
  if (!tools.length && (receipt as any).tool_used)
    tools.push((receipt as any).tool_used);

  let turns: Turn[] = [];
  if ((receipt as any).conversation_id) {
    const { data: t } = await supabaseAdmin
      .from("conversation_turns")
      .select("id, role, content, idx")
      .eq("conversation_id", (receipt as any).conversation_id)
      .order("idx");
    turns = (t ?? []).map((r: any) => ({
      id: r.id,
      role: r.role,
      content: r.content,
      idx: r.idx,
    }));
  }
  if (!turns.length && Array.isArray((receipt as any).conversation_json)) {
    turns = ((receipt as any).conversation_json as any[]).map((t, i) => ({
      id: null,
      role: String(t?.role ?? "user"),
      content: String(t?.content ?? ""),
      idx: typeof t?.idx === "number" ? t.idx : i,
    }));
  }

  // ----- Layer 1 / Layer 2 signal harvesting -----
  // Pull what's available; pass empty when absent so prompts hit
  // their documented null_reason paths instead of inventing.
  const turnIdToIdx = new Map<string, number>();
  for (const t of turns) if (t.id) turnIdToIdx.set(t.id, t.idx);

  const { data: features } = await supabaseAdmin
    .from("prompt_features")
    .select(
      "turn_id, prompt_position, c5_challenge_detected, c10_clarification_detected, c14_attribution_detected, c16_meta_prompt_detected, c4_role_directive_detected, c12_synthesis_detected, semantic_drift_from_prior",
    )
    .eq("receipt_id", receiptId);

  const { data: chains } = await supabaseAdmin
    .from("prompt_chains")
    .select("id, chain_type, turn_ids, prompt_count, resolution_type")
    .eq("receipt_id", receiptId);

  const { data: signals } = await supabaseAdmin
    .from("receipt_construct_signals")
    .select("*")
    .eq("receipt_id", receiptId)
    .maybeSingle();

  // Derive layer2 events with turn_index attached so the model can quote.
  const idxFor = (turnId: string | null) =>
    turnId ? turnIdToIdx.get(turnId) ?? null : null;

  const rejection_events = (features ?? [])
    .filter((f: any) => f.c5_challenge_detected)
    .map((f: any) => ({ turn_index: idxFor(f.turn_id) }))
    .filter((e) => e.turn_index !== null);

  const judgment_moments = (features ?? [])
    .filter((f: any) => f.c5_challenge_detected || f.c12_synthesis_detected)
    .map((f: any) => ({
      turn_index: idxFor(f.turn_id),
      kind: f.c5_challenge_detected ? "challenge" : "synthesis",
    }))
    .filter((e) => e.turn_index !== null);

  const verification_events = (features ?? [])
    .filter(
      (f: any) => f.c14_attribution_detected || f.c10_clarification_detected,
    )
    .map((f: any) => ({
      turn_index: idxFor(f.turn_id),
      kind: f.c14_attribution_detected ? "attribution" : "clarification",
    }))
    .filter((e) => e.turn_index !== null);

  const role_setting_events = (features ?? [])
    .filter((f: any) => f.c4_role_directive_detected)
    .map((f: any) => ({ turn_index: idxFor(f.turn_id) }))
    .filter((e) => e.turn_index !== null);

  const branch_markers = (features ?? [])
    .filter((f: any) => (f.semantic_drift_from_prior ?? 0) > 0.65)
    .map((f: any) => ({
      turn_index: idxFor(f.turn_id),
      drift: f.semantic_drift_from_prior,
    }))
    .filter((e) => e.turn_index !== null);

  const loop_chains = (chains ?? [])
    .filter((c: any) => c.chain_type === "loop")
    .map((c: any) => ({
      id: c.id,
      turn_indices: (c.turn_ids ?? [])
        .map((tid: string) => turnIdToIdx.get(tid))
        .filter((v: any) => typeof v === "number"),
      prompt_count: c.prompt_count,
      resolved: c.resolution_type === "resolved",
    }));

  const turn_event_stream = turns.map((t) => ({
    turn_index: t.idx,
    role: t.role === "assistant" ? "ai" : "human",
  }));

  const challenge_rate = (signals as any)?.c5_challenge_rate ?? null;
  const iteration_count = (signals as any)?.total_prompt_count ??
    turns.filter((t) => t.role === "user").length;

  const layer2Signals: Record<string, unknown> = {
    challenge_rate,
    iteration_count,
    rejection_events,
    judgment_moments,
    verification_events,
    role_setting_events,
    branch_markers,
    loop_chains,
    turn_event_stream,
    deliverable_boundary_markers: [],
  };

  // Layer 1 — pull from fluency_receipts.rendered_json if present.
  let layer1Scores: unknown[] = [];
  const { data: fr } = await supabaseAdmin
    .from("fluency_receipts")
    .select("rendered_json")
    .eq("receipt_id", receiptId)
    .maybeSingle();
  const rendered = (fr as any)?.rendered_json;
  if (rendered && Array.isArray(rendered.dimensions)) {
    layer1Scores = rendered.dimensions;
  } else if (rendered && rendered.scores && typeof rendered.scores === "object") {
    layer1Scores = Object.entries(rendered.scores).map(([k, v]) => ({
      dimension_id: k,
      score: v,
    }));
  }

  const lastAssistantTurn = [...turns]
    .reverse()
    .find((t) => t.role === "assistant" || t.role === "ai");
  const fallbackLastTurn = turns.length ? turns[turns.length - 1] : null;
  const artifactContent = String(
    (receipt as any).response_preview ?? lastAssistantTurn?.content ?? "",
  ).trim();

  return {
    receiptId,
    turns,
    tools,
    threadTitle,
    finalArtifact: artifactContent
      ? {
          turnIndex: lastAssistantTurn?.idx ?? fallbackLastTurn?.idx ?? null,
          content: artifactContent,
        }
      : null,
    layer1Scores,
    layer2Signals,
    tokenData: { available: false, turns: [] },
  };
}

function buildEnvelope(templateKey: TemplateKey, ctx: AnalysisContext) {
  // Thinking map only needs the human turns — sending the assistant responses
  // doubles+ the token count and pushes Gemini past the 45s timeout. The map's
  // job is to chart what the human prompted; verification/loop/branch inference
  // works fine off human turns + layer2 signals.
  const fullThread = buildRawThread(ctx.turns);
  const rawThread =
    templateKey === "thinking_map"
      ? fullThread.filter((t) => t.role === "human")
      : fullThread;
  const humanTurnIndices = fullThread
    .filter((t) => t.role === "human")
    .map((t) => t.turn_index);
  const base: Record<string, unknown> = {
    raw_thread: rawThread,
    tools_used: ctx.tools,
    thread_title: ctx.threadTitle,
    turn_count: fullThread.length,
    human_turn_indices: humanTurnIndices,
  };
  if (
    templateKey === "proof_card" ||
    templateKey === "shield" ||
    templateKey === "impact_statement" ||
    templateKey === "impact_proof"
  ) {
    base.layer1_scores = ctx.layer1Scores;
  }
  base.layer2_signals = ctx.layer2Signals;
  if (templateKey === "ledger") base.token_data = ctx.tokenData;
  return base;
}

function buildUserMessage(templateKey: TemplateKey, ctx: AnalysisContext) {
  const envelope = buildEnvelope(templateKey, ctx);
  return (
    `Here is the input for your analysis. Return only the JSON object as specified by your system prompt.\n\n` +
    JSON.stringify(envelope, null, 2)
  );
}

const CHAT_COMPLETION_OUTPUT_TOKEN_LIMIT = 12_000;
const THINKING_MAP_HUMAN_TURNS_PER_CHUNK = 10;

type ThinkingMapColor =
  | "sky"
  | "gray"
  | "gold"
  | "mint"
  | "green"
  | "risk"
  | "navy"
  | "gray-dashed";

type ThinkingMapNodeType =
  | "prompt"
  | "output"
  | "judgment"
  | "verification"
  | "loop"
  | "artifact"
  | "branch";

interface ThinkingMapNodeDraft {
  id: string;
  type: ThinkingMapNodeType;
  color_type: ThinkingMapColor;
  label: string;
  quote: string;
  turn_index: number;
  loop_id: string | null;
}

interface ThinkingMapChunkResult {
  assigned: number[];
  parsed: Record<string, any> | null;
  error: string | null;
}

const TYPE_COLOR: Record<ThinkingMapNodeType, ThinkingMapColor> = {
  prompt: "sky",
  output: "gray",
  judgment: "gold",
  verification: "mint",
  loop: "risk",
  artifact: "navy",
  branch: "gray-dashed",
};

const TYPE_ORDER: Record<ThinkingMapNodeType, number> = {
  prompt: 0,
  branch: 1,
  judgment: 2,
  verification: 3,
  loop: 4,
  output: 5,
  artifact: 6,
};

function verbatimOpening(s: string, n: number) {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n);
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function humanTurnIndices(ctx: AnalysisContext) {
  return ctx.turns
    .filter((t) => t.role !== "assistant" && t.role !== "ai")
    .map((t) => t.idx)
    .sort((a, b) => a - b);
}

function turnMap(ctx: AnalysisContext) {
  const m = new Map<number, Turn>();
  for (const t of ctx.turns) m.set(t.idx, t);
  return m;
}

function signalMaps(ctx: AnalysisContext) {
  const layer2 = ctx.layer2Signals as Record<string, any>;
  const turnSet = (key: string) =>
    new Set<number>(
      Array.isArray(layer2[key])
        ? layer2[key]
            .map((e: any) => asNumber(e?.turn_index))
            .filter((v: number | null): v is number => v !== null)
        : [],
    );

  const loopByTurn = new Map<number, string>();
  const loopLabels: { loop_id: string; topic: string }[] = [];
  const loopChains = Array.isArray(layer2.loop_chains) ? layer2.loop_chains : [];
  loopChains.forEach((chain: any, i: number) => {
    const loopId = `L${i + 1}`;
    const turnIndices = Array.isArray(chain?.turn_indices) ? chain.turn_indices : [];
    for (const rawIdx of turnIndices) {
      const idx = asNumber(rawIdx);
      if (idx !== null) loopByTurn.set(idx, loopId);
    }
    if (turnIndices.length) {
      loopLabels.push({ loop_id: loopId, topic: "Iteration loop" });
    }
  });

  return {
    verification: turnSet("verification_events"),
    judgment: turnSet("judgment_moments"),
    branch: turnSet("branch_markers"),
    loopByTurn,
    loopLabels,
  };
}

function normalizeNodeType(value: unknown): ThinkingMapNodeType {
  const type = String(value ?? "prompt").toLowerCase();
  if (
    type === "output" ||
    type === "judgment" ||
    type === "verification" ||
    type === "loop" ||
    type === "artifact" ||
    type === "branch"
  ) {
    return type;
  }
  return "prompt";
}

function cleanLabel(value: unknown, fallback: string) {
  const label = String(value ?? "").replace(/[\r\n]+/g, " ").trim();
  return label ? verbatimOpening(label, 80) : fallback;
}

function inferHumanNodeType(
  turnIndex: number,
  content: string,
  signals: ReturnType<typeof signalMaps>,
): { type: ThinkingMapNodeType; loopId: string | null; label: string } {
  const text = content.toLowerCase();
  if (
    signals.verification.has(turnIndex) ||
    /\b(verify|verified|verification|fact[- ]?check|check|source|sources|citation|cite|evidence|proof|accurate|accuracy|true|confirm|validate|where did|is that|does that)\b/.test(
      text,
    )
  ) {
    return { type: "verification", loopId: null, label: "Verification check" };
  }
  if (signals.loopByTurn.has(turnIndex)) {
    return {
      type: "loop",
      loopId: signals.loopByTurn.get(turnIndex) ?? null,
      label: "Loop iteration",
    };
  }
  if (
    signals.branch.has(turnIndex) ||
    /\b(instead|switch|new direction|different approach|start over|pivot|change focus)\b/.test(
      text,
    )
  ) {
    return { type: "branch", loopId: null, label: "Direction branch" };
  }
  if (
    signals.judgment.has(turnIndex) ||
    /\b(good|wrong|better|use this|keep|remove|reject|accept|i like|i don't like|revise|fix|not quite)\b/.test(
      text,
    )
  ) {
    return { type: "judgment", loopId: null, label: "Judgment call" };
  }
  return { type: "prompt", loopId: null, label: "Prompt refinement" };
}

function buildThinkingMapEnvelope(ctx: AnalysisContext, assignedTurnIndices: number[]) {
  const fullThread = buildRawThread(ctx.turns);
  const humanThread = fullThread.filter((t) => t.role === "human");
  const allHumanTurnIndices = humanThread.map((t) => t.turn_index);
  return {
    analysis_mode: "chunked_thinking_map",
    chunk_instruction:
      "Use every human prompt in raw_thread as context, but output nodes only for assigned_turn_indices. covered_turn_indices must equal assigned_turn_indices.",
    raw_thread: humanThread,
    assigned_turn_indices: assignedTurnIndices,
    human_turn_indices: allHumanTurnIndices,
    turn_count: fullThread.length,
    thread_title: ctx.threadTitle,
    tools_used: ctx.tools,
    layer2_signals: ctx.layer2Signals,
    final_artifact_available: Boolean(ctx.finalArtifact),
    final_artifact_turn_index: ctx.finalArtifact?.turnIndex ?? null,
  };
}

function buildThinkingMapChunkUserMessage(
  ctx: AnalysisContext,
  assignedTurnIndices: number[],
  chunkNumber: number,
  totalChunks: number,
) {
  return (
    `This is Thinking Map analysis pass ${chunkNumber} of ${totalChunks}. ` +
    `Analyze ONLY assigned_turn_indices for this pass. Use all raw_thread user prompts for context. ` +
    `Return only the JSON object specified by the system prompt.\n\n` +
    JSON.stringify(buildThinkingMapEnvelope(ctx, assignedTurnIndices), null, 2)
  );
}

function mergeThinkingMapChunks(
  ctx: AnalysisContext,
  chunks: ThinkingMapChunkResult[],
) {
  const turnsByIdx = turnMap(ctx);
  const allHumanIndices = humanTurnIndices(ctx);
  const humanIndexSet = new Set(allHumanIndices);
  const signals = signalMaps(ctx);
  const drafts: ThinkingMapNodeDraft[] = [];
  const hasTypeAtTurn = (type: ThinkingMapNodeType, turnIndex: number) =>
    drafts.some((n) => n.type === type && n.turn_index === turnIndex);

  const addHumanNode = (
    turnIndex: number,
    type: ThinkingMapNodeType,
    label: string,
    loopId: string | null,
  ) => {
    const turn = turnsByIdx.get(turnIndex);
    if (!turn) return;
    drafts.push({
      id: "pending",
      type,
      color_type: TYPE_COLOR[type],
      label,
      quote: verbatimOpening(String(turn.content ?? ""), 180),
      turn_index: turnIndex,
      loop_id: type === "loop" ? loopId : null,
    });
  };

  for (const chunk of chunks) {
    const assignedSet = new Set(chunk.assigned);
    const parsedNodes = Array.isArray(chunk.parsed?.nodes) ? chunk.parsed.nodes : [];
    for (const node of parsedNodes) {
      const turnIndex = asNumber(node?.turn_index);
      if (turnIndex === null || !assignedSet.has(turnIndex) || !humanIndexSet.has(turnIndex)) {
        continue;
      }
      const turn = turnsByIdx.get(turnIndex);
      if (!turn) continue;
      const type = normalizeNodeType(node?.type);
      const loopId = type === "loop"
        ? signals.loopByTurn.get(turnIndex) ?? String(node?.loop_id ?? "L1")
        : null;
      drafts.push({
        id: "pending",
        type,
        color_type: TYPE_COLOR[type],
        label: cleanLabel(node?.label, inferHumanNodeType(turnIndex, turn.content, signals).label),
        quote: verbatimOpening(String(turn.content ?? ""), 180),
        turn_index: turnIndex,
        loop_id: loopId,
      });
    }
  }

  for (const idx of allHumanIndices) {
    if (!drafts.some((n) => n.turn_index === idx && n.type !== "artifact")) {
      const turn = turnsByIdx.get(idx);
      const inferred = inferHumanNodeType(idx, turn?.content ?? "", signals);
      addHumanNode(idx, inferred.type, inferred.label, inferred.loopId);
    }
  }

  for (const idx of signals.verification) {
    if (humanIndexSet.has(idx) && !hasTypeAtTurn("verification", idx)) {
      addHumanNode(idx, "verification", "Verification check", null);
    }
  }
  for (const [idx, loopId] of signals.loopByTurn.entries()) {
    if (humanIndexSet.has(idx) && !hasTypeAtTurn("loop", idx)) {
      addHumanNode(idx, "loop", "Loop iteration", loopId);
    }
  }
  for (const idx of signals.branch) {
    if (humanIndexSet.has(idx) && !hasTypeAtTurn("branch", idx)) {
      addHumanNode(idx, "branch", "Direction branch", null);
    }
  }

  if (ctx.finalArtifact?.content) {
    drafts.push({
      id: "pending",
      type: "artifact",
      color_type: TYPE_COLOR.artifact,
      label: "Final artifact",
      quote: verbatimOpening(ctx.finalArtifact.content, 180),
      turn_index: ctx.finalArtifact.turnIndex ?? (allHumanIndices[allHumanIndices.length - 1] ?? 0),
      loop_id: null,
    });
  }

  const sortedNodes = drafts
    .sort(
      (a, b) =>
        a.turn_index - b.turn_index ||
        TYPE_ORDER[a.type] - TYPE_ORDER[b.type] ||
        a.label.localeCompare(b.label),
    )
    .map((node, i) => ({ ...node, id: `n${i + 1}` }));

  const edges: { from: string; to: string; type: "sequential" | "abandonment" | "loop_coil" }[] = [];
  const edgeKey = new Set<string>();
  const addEdge = (
    from: string,
    to: string,
    type: "sequential" | "abandonment" | "loop_coil",
  ) => {
    const key = `${from}:${to}:${type}`;
    if (!edgeKey.has(key)) {
      edges.push({ from, to, type });
      edgeKey.add(key);
    }
  };

  for (let i = 1; i < sortedNodes.length; i++) {
    const prev = sortedNodes[i - 1];
    const current = sortedNodes[i];
    const type = current.type === "branch" ? "abandonment" : "sequential";
    addEdge(prev.id, current.id, type);
  }
  const loopGroups = new Map<string, ThinkingMapNodeDraft[]>();
  for (const node of sortedNodes) {
    if (node.type === "loop" && node.loop_id) {
      const group = loopGroups.get(node.loop_id) ?? [];
      group.push(node);
      loopGroups.set(node.loop_id, group);
    }
  }
  for (const group of loopGroups.values()) {
    for (let i = 1; i < group.length; i++) {
      addEdge(group[i - 1].id, group[i].id, "loop_coil");
    }
  }

  const modelLoopLabels = chunks.flatMap((chunk) =>
    Array.isArray(chunk.parsed?.loop_labels) ? chunk.parsed.loop_labels : [],
  );
  const loopLabelMap = new Map<string, string>();
  for (const label of [...signals.loopLabels, ...modelLoopLabels]) {
    const id = String(label?.loop_id ?? "").trim();
    if (!id) continue;
    loopLabelMap.set(id, cleanLabel(label?.topic, "Iteration loop"));
  }

  const chunkErrors = chunks
    .map((chunk, i) => (chunk.error ? `Pass ${i + 1}: ${chunk.error}` : null))
    .filter(Boolean);

  return {
    template: "thinking_map",
    analysis_mode: chunks.length > 1 ? "chunked" : "single-pass",
    chunk_count: chunks.length,
    session_summary: `Chunked Thinking Map generated across ${chunks.length} analysis pass${chunks.length === 1 ? "" : "es"} for ${allHumanIndices.length} user turns, preserving every user prompt and restoring verification, loop, branch, and artifact nodes.`,
    nodes: sortedNodes,
    edges,
    loop_labels: Array.from(loopLabelMap.entries()).map(([loop_id, topic]) => ({ loop_id, topic })),
    covered_turn_indices: allHumanIndices,
    chunk_errors: chunkErrors,
    null_reason: allHumanIndices.length ? null : "No user turns were available to map.",
  };
}

async function runThinkingMap(
  ctx: AnalysisContext,
  prompt: PromptRow,
  started: number,
): Promise<AnalyzerResult> {
  const model = SCORING_MODEL;
  const allHumanIndices = humanTurnIndices(ctx);
  const chunks = chunkArray(allHumanIndices, THINKING_MAP_HUMAN_TURNS_PER_CHUNK);

  const chunkResults = await Promise.all(
    chunks.map(async (assigned, i): Promise<ThinkingMapChunkResult> => {
      const result = await chatCompletion({
        label: `template-analysis:thinking_map:pass-${i + 1}-of-${chunks.length}`,
        receiptId: ctx.receiptId,
        timeoutMs: 180_000,
        body: {
          model,
          messages: [
            { role: "system", content: prompt.prompt_text },
            {
              role: "user",
              content: buildThinkingMapChunkUserMessage(ctx, assigned, i + 1, chunks.length),
            },
          ],
          response_format: { type: "json_object" },
          max_completion_tokens: CHAT_COMPLETION_OUTPUT_TOKEN_LIMIT,
        },
        validate: (data) => {
          const content = data?.choices?.[0]?.message?.content;
          return typeof content === "string" && Boolean(tryParseJson(content));
        },
      });

      if (!result.ok || !result.data) {
        return {
          assigned,
          parsed: null,
          error: result.errorMessage || "model pass failed",
        };
      }
      const content: string = result.data?.choices?.[0]?.message?.content ?? "";
      const parsed = tryParseJson(content);
      return {
        assigned,
        parsed: parsed && typeof parsed === "object" ? (parsed as Record<string, any>) : null,
        error: parsed ? null : "model returned non-JSON content",
      };
    }),
  );

  const parsed = mergeThinkingMapChunks(ctx, chunkResults);
  const status = parsed.null_reason ? "error" : "ok";
  const errorMessage = parsed.null_reason;
  const { error: upsertErr } = await supabaseAdmin
    .from("template_analyses")
    .upsert(
      {
        receipt_id: ctx.receiptId,
        template_key: "thinking_map",
        analysis_json: parsed as any,
        system_prompt_id: prompt.id,
        prompt_version: prompt.version,
        model,
        status,
        error_message: errorMessage,
        latency_ms: Date.now() - started,
      },
      { onConflict: "receipt_id,template_key" },
    );
  if (upsertErr) {
    console.error("[template-analyses] thinking map upsert failed", upsertErr);
    return {
      templateKey: "thinking_map",
      ok: false,
      error: `upsert failed: ${upsertErr.message}`,
      latencyMs: Date.now() - started,
      promptVersion: prompt.version,
      model,
    };
  }

  return {
    templateKey: "thinking_map",
    ok: status === "ok",
    analysis: parsed,
    error: errorMessage ?? undefined,
    promptVersion: prompt.version,
    model,
    latencyMs: Date.now() - started,
  };
}

export interface AnalyzerResult {
  templateKey: TemplateKey;
  ok: boolean;
  analysis?: unknown;
  promptVersion?: number;
  model?: string;
  error?: string;
  latencyMs: number;
}

async function runOne(
  templateKey: TemplateKey,
  ctx: AnalysisContext,
): Promise<AnalyzerResult> {
  const started = Date.now();
  const prompt = await loadPrompt(templateKey);
  if (!prompt) {
    return {
      templateKey,
      ok: false,
      error: `system_prompt_templates row missing for ${PROMPT_KEY[templateKey]}`,
      latencyMs: Date.now() - started,
    };
  }

  if (templateKey === "thinking_map") {
    return runThinkingMap(ctx, prompt, started);
  }

  const model = SCORING_MODEL; // google/gemini-2.5-pro via Lovable AI Gateway
  // Context map produces one compact node per human turn plus narrative
  // sections. The gateway caps completion tokens at 16,384 for this model, so
  // we sit just under that. Everything else stays on the default budget.
  const isLargeAnalysis = templateKey === "context_map";
  const result = await chatCompletion({
    label: `template-analysis:${templateKey}`,
    receiptId: ctx.receiptId,
    timeoutMs: isLargeAnalysis ? 180_000 : 60_000,
    body: {
      model,
      messages: [
        { role: "system", content: prompt.prompt_text },
        { role: "user", content: buildUserMessage(templateKey, ctx) },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: isLargeAnalysis ? 16_000 : CHAT_COMPLETION_OUTPUT_TOKEN_LIMIT,
    },
    validate: (data) => {
      const content = data?.choices?.[0]?.message?.content;
      return typeof content === "string" && content.length > 0;
    },
  });

  const baseFail = (error: string): AnalyzerResult => ({
    templateKey,
    ok: false,
    error,
    latencyMs: Date.now() - started,
    promptVersion: prompt.version,
    model,
  });

  if (!result.ok || !result.data) {
    const failure = baseFail(result.errorMessage || "model call failed");
    await supabaseAdmin.from("template_analyses").upsert(
      {
        receipt_id: ctx.receiptId,
        template_key: templateKey,
        analysis_json: { null_reason: failure.error },
        system_prompt_id: prompt.id,
        prompt_version: prompt.version,
        model,
        status: "error",
        error_message: failure.error,
        latency_ms: failure.latencyMs,
      },
      { onConflict: "receipt_id,template_key" },
    );
    return failure;
  }

  const content: string = result.data?.choices?.[0]?.message?.content ?? "";
  const parsed = tryParseJson(content);
  if (!parsed) return baseFail("model returned non-JSON content");

  const { error: upsertErr } = await supabaseAdmin
    .from("template_analyses")
    .upsert(
      {
        receipt_id: ctx.receiptId,
        template_key: templateKey,
        analysis_json: parsed as any,
        system_prompt_id: prompt.id,
        prompt_version: prompt.version,
        model,
        status: "ok",
        error_message: null,
        latency_ms: Date.now() - started,
      },
      { onConflict: "receipt_id,template_key" },
    );
  if (upsertErr) {
    console.error("[template-analyses] upsert failed", upsertErr);
    return baseFail(`upsert failed: ${upsertErr.message}`);
  }

  return {
    templateKey,
    ok: true,
    analysis: parsed,
    promptVersion: prompt.version,
    model,
    latencyMs: Date.now() - started,
  };
}

const ALL_TEMPLATES: TemplateKey[] = [
  "thinking_map",
  "still_yours",
  "shield",
  "impact_proof",
  "context_map",
];

/**
 * Runs all six analyzers for a receipt in parallel.
 * Idempotent: skips templates that already have a stored row unless `force`.
 */
export async function runAllTemplateAnalyses(params: {
  receiptId: string;
  force?: boolean;
}): Promise<AnalyzerResult[]> {
  const { receiptId, force = false } = params;

  let toRun: TemplateKey[] = [...ALL_TEMPLATES];
  if (!force) {
    const { data: existing } = await supabaseAdmin
      .from("template_analyses")
      .select("template_key, status")
      .eq("receipt_id", receiptId);
    const okKeys = new Set(
      (existing ?? [])
        .filter((r: any) => r.status === "ok")
        .map((r: any) => r.template_key),
    );
    toRun = ALL_TEMPLATES.filter((k) => !okKeys.has(k));
    if (toRun.length === 0) {
      return ALL_TEMPLATES.map((k) => ({
        templateKey: k,
        ok: true,
        latencyMs: 0,
      }));
    }
  }

  const ctxOrErr = await loadReceiptContext(receiptId);
  if ("error" in ctxOrErr) {
    return toRun.map((k) => ({
      templateKey: k,
      ok: false,
      error: ctxOrErr.error,
      latencyMs: 0,
    }));
  }
  const ctx = ctxOrErr;

  return Promise.all(toRun.map((k) => runOne(k, ctx)));
}

export async function runSingleTemplateAnalysis(params: {
  receiptId: string;
  templateKey: TemplateKey;
}): Promise<AnalyzerResult> {
  const ctxOrErr = await loadReceiptContext(params.receiptId);
  if ("error" in ctxOrErr) {
    return {
      templateKey: params.templateKey,
      ok: false,
      error: ctxOrErr.error,
      latencyMs: 0,
    };
  }
  return runOne(params.templateKey, ctxOrErr);
}
