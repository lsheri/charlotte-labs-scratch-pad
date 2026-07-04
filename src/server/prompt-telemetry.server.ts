// Charlotte Engine V1 — Per-prompt behavioral signal extraction.
// Runs alongside (never replaces) the gpt-5 fluency analyzer. All exports
// here are designed to be called fire-and-forget from the capture endpoint
// and the receipt pipeline. Failures are logged and swallowed.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PromptFeaturesInput {
  conversationId: string;
  participantId: string;
  sessionId: string | null;
  threadId: string | null;
  tool: string | null;
}

type ToolIdEnum =
  | "chatgpt"
  | "copilot"
  | "claude"
  | "gemini"
  | "grammarly"
  | "midjourney"
  | "perplexity"
  | "lovable"
  | "bolt"
  | "custom";

const KNOWN_TOOLS = new Set<ToolIdEnum>([
  "chatgpt", "copilot", "claude", "gemini", "grammarly",
  "midjourney", "perplexity", "lovable", "bolt", "custom",
]);

function normalizeTool(tool: string | null | undefined): ToolIdEnum {
  if (!tool) return "custom";
  const t = tool.toLowerCase().trim();
  return (KNOWN_TOOLS.has(t as ToolIdEnum) ? t : "custom") as ToolIdEnum;
}

interface TurnRow {
  id: string;
  role: string;
  content: string;
  idx: number;
}

type MetaPromptType = "probing" | "authoring" | "configuring" | null;

interface PromptFeatureRow {
  turn_id: string;
  participant_id: string;
  session_id: string | null;
  thread_id: string | null;
  tool: ToolIdEnum;
  prompt_position: number;
  is_first_prompt_in_session: boolean;
  is_first_substantive_prompt: boolean;
  is_last_three_prompts: boolean;
  word_count: number;
  char_length: number;
  c3_goal_clarity_score: number | null;
  c3_format_spec_detected: boolean;
  c3_exemplar_detected: boolean;
  c4_role_directive_detected: boolean;
  c4_collaboration_term_detected: boolean;
  c4_settings_toggle_count: number | null;
  c5_challenge_detected: boolean | null;
  c10_clarification_detected: boolean | null;
  c11_planning_element_score: number | null;
  c12_synthesis_detected: boolean | null;
  c14_attribution_detected: boolean;
  is_personal_context: boolean;
  c16_meta_prompt_detected: boolean;
  meta_prompt_type: MetaPromptType;
}

// ---------------------------------------------------------------------------
// Regex pattern banks (verbatim from V1 spec)
// ---------------------------------------------------------------------------

const ROLE_PATTERNS = [
  /\b(act as|you are|respond as|pretend you'?re|imagine you'?re)\b/i,
  /\b(step[- ]by[- ]step|think aloud|show your (work|reasoning|thinking))\b/i,
  /\b(be (concise|brief|detailed|thorough|critical|skeptical))\b/i,
  /\b(push back|challenge|disagree|play devil'?s advocate)\b/i,
  /\b(don'?t|do not) (apologize|apologise|be polite|hedge)\b/i,
];

const COLLABORATION_TERM_PATTERNS = [
  /\b(tell me (when|if) you'?re (unsure|uncertain|not confident))\b/i,
  /\b(flag (any|your) (uncertainty|assumptions|limitations))\b/i,
  /\b(ask me (before|if)|check with me)\b/i,
  /\b(let me know (if|when))\b/i,
];

const FORMAT_SPEC_PATTERNS = [
  /\b(bullet points?|numbered list|table|paragraph|markdown|json|csv|outline)\b/i,
  /\b(format|structure|organize)\b.{3,}\b(as|in|like|using)\b/i,
];

const EXEMPLAR_PATTERNS = [
  /\b(for example|e\.g\.|such as|like this|here'?s an example)\b/i,
  /\b(follow this (format|structure|example|template))\b/i,
];

const TASK_VERB_PATTERN = /\b(write|create|generate|analyze|summarize|compare|explain|design|build)\b/i;
const DELIVERABLE_PATTERN = /\b(document|report|essay|code|email|summary|plan|outline|draft|script)\b/i;

const CHALLENGE_PATTERNS = [
  /\b(are you sure|is that (correct|right|accurate))\b/i,
  /\b(cite (a |your )?source|provide (a )?reference|where did you get)\b/i,
  /\b(that (contradicts|conflicts with|doesn't match))\b/i,
  /\b(verify|double[- ]check|fact[- ]check)\b/i,
  /\b(I (think|believe) (that's|you're) (wrong|incorrect|mistaken))\b/i,
  /\b(this (seems|looks) (wrong|off|incorrect|inaccurate))\b/i,
];

const CLARIFICATION_PATTERNS = [
  /\b(I don'?t understand|I'?m confused|not sure I follow)\b/i,
  /\b(explain (step|part|section|point) \d+)\b/i,
  /\b(in (simpler|plain|layman) terms)\b/i,
  /\b(what (do|does) (that|this|you) mean by)\b/i,
  /\b(can you (break|simplify|clarify) (that|this|it))\b/i,
  /\b(why did you (say|suggest|recommend|choose))\b/i,
  /\b(walk me through)\b/i,
  /\b(I'?m (lost|struggling to understand))\b/i,
];

const PLANNING_ELEMENTS: Array<{ key: string; patterns: RegExp[] }> = [
  { key: "role", patterns: [/\b(act as|you are|respond as|pretend you'?re)\b/i] },
  { key: "task", patterns: [/\b(write|create|generate|analyze|summarize|compare|explain|design|build)\b.{5,}/i] },
  {
    key: "format",
    patterns: [
      /\b(bullet points?|numbered list|table|paragraph|markdown|json|csv|outline)\b/i,
      /\b(format|structure|organize)\b.{3,}\b(as|in|like|using)\b/i,
    ],
  },
  {
    key: "constraints",
    patterns: [
      /\b(limit|maximum|minimum|at (most|least)|no more than|within)\b/i,
      /\b(word|character|page) (count|limit|length)\b/i,
      /\b(don'?t|do not|avoid|exclude|without)\b/i,
    ],
  },
  {
    key: "context",
    patterns: [
      /\b(background|context|for my|this is for|the (assignment|project|task) is)\b/i,
      /\b(audience|reader|professor|class|course)\b/i,
    ],
  },
];

const SYNTHESIS_PATTERNS = [
  /\b(what did I (learn|miss|get wrong))\b/i,
  /\b(key (takeaways?|lessons?|insights?))\b/i,
  /\b(summarize (what|how) (I|we) (learned|discussed|covered))\b/i,
  /\b(what should I (have asked|do differently|remember))\b/i,
  /\b(looking back|in retrospect|reflecting on)\b/i,
  /\b(what'?s the (most important|main) (thing|point) (from|in) this)\b/i,
];

const ATTRIBUTION_PATTERNS = [
  /\b(I (will|need to|should|must) (cite|attribute|acknowledge|disclose|reference))\b/i,
  /\b(how (do|should|can) I (cite|attribute|disclose|acknowledge) (AI|ChatGPT|this|it))\b/i,
  /\b(I'?ll (note|mention|disclose) (that I used|my use of) AI)\b/i,
  /\b(AI[- ]generated|AI[- ]assisted).{0,20}(citation|reference|attribut|disclos)\b/i,
];

const PERSONAL_PATTERNS = [
  /\b(my (friend|classmate|roommate|professor|teacher|boss))\b/i,
  /\b(I (had|have|got|received) a)\b.{0,30}\b(email|message|call)\b/i,
  /\b(write (a |an )?(email|letter|message) to)\b/i,
];

const META_PROMPT_PATTERNS = [
  /\b(what are (your|the) (system )?(instructions|rules|constraints|limitations))\b/i,
  /\b(what (is|are) your (context window|token limit|knowledge cutoff))\b/i,
  /\b(how (do|are) you (decide|configured|programmed|trained))\b/i,
  /\b(ignore (previous|prior|all) instructions)\b/i,
  /\b(from now on|going forward|always|in every response).{0,40}(you (should|must|will))\b/i,
  /\b(custom instructions?|system prompt|project (rules|instructions))\b/i,
  /\b(create a (custom )?GPT|build (a |me )?an? (assistant|agent|bot))\b/i,
];

const META_PROBING = /\b(rules|constraints|instructions|configured|programmed|trained|token (limit)?|context window|knowledge cutoff|limitations)\b/i;
const META_CONFIGURING = /\b(from now on|going forward|always|in every response|custom instructions?|system prompt|project (rules|instructions))\b/i;
const META_AUTHORING = /\b(create a (custom )?GPT|build (a |me )?an? (assistant|agent|bot))\b/i;

function anyMatch(patterns: RegExp[], text: string): boolean {
  for (const p of patterns) if (p.test(text)) return true;
  return false;
}

function classifyMetaPrompt(text: string): MetaPromptType {
  if (META_AUTHORING.test(text)) return "authoring";
  if (META_CONFIGURING.test(text)) return "configuring";
  if (META_PROBING.test(text)) return "probing";
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extracts per-turn behavioral signals for all user-role turns in a conversation.
 * Runs regex patterns for constructs C3, C4, C5, C10, C11, C12, C14, C16.
 * Inserts one prompt_features row per user turn. Idempotent via ON CONFLICT DO NOTHING on turn_id.
 * Called by: capture-conversation.ts (fire-and-forget after thread label generation)
 * Constructs served: C3, C4, C5, C10, C11, C12, C14, C16
 */
export async function extractPromptFeatures(input: PromptFeaturesInput): Promise<void> {
  try {
    const { data: turns, error } = await supabaseAdmin
      .from("conversation_turns")
      .select("id, role, content, idx")
      .eq("conversation_id", input.conversationId)
      .order("idx");
    if (error || !turns) {
      console.error("[prompt-telemetry] failed loading turns", error);
      return;
    }

    const userTurns: TurnRow[] = (turns as TurnRow[]).filter(t => t.role === "user");
    if (userTurns.length === 0) return;

    const totalUserTurns = userTurns.length;
    const tool = normalizeTool(input.tool);

    const rows: PromptFeatureRow[] = userTurns.map((turn, i) => {
      const content = turn.content ?? "";
      const promptPosition = i + 1;
      const isFirst = promptPosition === 1;
      const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
      const isFirstSubstantive = isFirst && wordCount > 20;
      const isLastThree = promptPosition > totalUserTurns - 3;

      // C4
      const c4Role = anyMatch(ROLE_PATTERNS, content);
      const c4Collab = anyMatch(COLLABORATION_TERM_PATTERNS, content);

      // C3
      const c3FormatSpec = anyMatch(FORMAT_SPEC_PATTERNS, content);
      const c3Exemplar = anyMatch(EXEMPLAR_PATTERNS, content);
      let c3GoalClarity: number | null = null;
      if (isFirst) {
        const hasTaskVerb = TASK_VERB_PATTERN.test(content);
        const hasDeliverable = DELIVERABLE_PATTERN.test(content);
        c3GoalClarity = hasTaskVerb ? (hasDeliverable ? 2 : 1) : 0;
      }

      // C5
      const c5Challenge: boolean | null = !isFirst
        ? anyMatch(CHALLENGE_PATTERNS, content)
        : null;

      // C10
      const c10Clarification: boolean | null = !isFirst
        ? anyMatch(CLARIFICATION_PATTERNS, content)
        : null;

      // C11 — count of distinct planning elements present (0..5)
      let c11Score: number | null = null;
      if (isFirstSubstantive) {
        c11Score = PLANNING_ELEMENTS.reduce(
          (acc, el) => acc + (anyMatch(el.patterns, content) ? 1 : 0),
          0,
        );
      }

      // C12
      const c12Synthesis: boolean | null = isLastThree
        ? anyMatch(SYNTHESIS_PATTERNS, content)
        : null;

      // C14
      const c14Attribution = anyMatch(ATTRIBUTION_PATTERNS, content);
      const isPersonal = anyMatch(PERSONAL_PATTERNS, content);

      // C16
      const c16Meta = anyMatch(META_PROMPT_PATTERNS, content);
      const metaType: MetaPromptType = c16Meta ? classifyMetaPrompt(content) : null;

      return {
        turn_id: turn.id,
        participant_id: input.participantId,
        session_id: input.sessionId,
        thread_id: input.threadId,
        tool,
        prompt_position: promptPosition,
        is_first_prompt_in_session: isFirst,
        is_first_substantive_prompt: isFirstSubstantive,
        is_last_three_prompts: isLastThree,
        word_count: wordCount,
        char_length: content.length,
        c3_goal_clarity_score: c3GoalClarity,
        c3_format_spec_detected: c3FormatSpec,
        c3_exemplar_detected: c3Exemplar,
        c4_role_directive_detected: c4Role,
        c4_collaboration_term_detected: c4Collab,
        c4_settings_toggle_count: null,
        c5_challenge_detected: c5Challenge,
        c10_clarification_detected: c10Clarification,
        c11_planning_element_score: c11Score,
        c12_synthesis_detected: c12Synthesis,
        c14_attribution_detected: c14Attribution,
        is_personal_context: isPersonal,
        c16_meta_prompt_detected: c16Meta,
        meta_prompt_type: metaType,
      };
    });

    const { error: upErr } = await supabaseAdmin
      .from("prompt_features")
      .upsert(rows, { onConflict: "turn_id", ignoreDuplicates: true });
    if (upErr) console.error("[prompt-telemetry] upsert failed", upErr);
  } catch (e) {
    console.error("[prompt-telemetry] extractPromptFeatures crashed", e);
  }
}

/**
 * Upserts a participant_tool_history row for the given tool.
 * Tracks first use date, session count, receipt count, and whether tool is established (>=10 sessions).
 * Called by: capture-conversation.ts (fire-and-forget after thread label generation)
 * Constructs served: C8 (pre-work), C9
 */
export async function updateParticipantToolHistory(
  participantId: string,
  tool: string,
  firstUseDate: string,
): Promise<void> {
  try {
    const normalized = normalizeTool(tool);
    const { error } = await supabaseAdmin.rpc("increment_tool_history", {
      p_participant_id: participantId,
      p_tool: normalized,
      p_first_use: firstUseDate,
    });
    if (error) console.error("[prompt-telemetry] increment_tool_history failed", error);
  } catch (e) {
    console.error("[prompt-telemetry] updateParticipantToolHistory crashed", e);
  }
}

// ---------------------------------------------------------------------------
// Chain detection (V1 — structural fallback only, no embeddings)
// ---------------------------------------------------------------------------

interface ChainFeatureRow {
  id: string;
  turn_id: string | null;
  prompt_position: number | null;
  word_count: number | null;
  c4_role_directive_detected: boolean | null;
  c5_challenge_detected: boolean | null;
  c10_clarification_detected: boolean | null;
  c11_planning_element_score: number | null;
  c3_format_spec_detected: boolean | null;
  is_last_three_prompts: boolean | null;
}

type ChainType =
  | "challenge"
  | "decomposition"
  | "pivot"
  | "loop"
  | "refinement"
  | "acceptance"
  | "new_topic";

interface BoundaryReason {
  challenge: boolean;
  roleDirective: boolean;
  decomposition: boolean;
}

function classifyChain(
  group: ChainFeatureRow[],
  startReason: BoundaryReason,
  totalTurns: number,
): ChainType {
  const hasChallenge = group.some(f => f.c5_challenge_detected === true);
  if (hasChallenge) return "challenge";
  if (startReason.decomposition) return "decomposition";
  const firstPos = group[0].prompt_position ?? 0;
  if (startReason.roleDirective && firstPos > 3) return "pivot";

  const last = group[group.length - 1];
  const isOnlyAndLast =
    group.length === 1 &&
    (last.prompt_position ?? 0) === totalTurns;
  if (isOnlyAndLast) return "acceptance";

  if (group.length >= 3) {
    const noFormat = group.every(f => f.c3_format_spec_detected !== true);
    const noClar = group.every(f => f.c10_clarification_detected !== true);
    const scores = group
      .map(f => f.c11_planning_element_score)
      .filter((s): s is number => typeof s === "number");
    const noImprovement =
      scores.length < 2 || scores[scores.length - 1] <= scores[0];
    if (noFormat && noClar && noImprovement) return "loop";
  }

  if (group.length >= 2) {
    const anyFormat = group.some(f => f.c3_format_spec_detected === true);
    const first = group[0].c11_planning_element_score;
    const lastScore = group[group.length - 1].c11_planning_element_score;
    const improved =
      typeof first === "number" &&
      typeof lastScore === "number" &&
      lastScore >= first;
    if (anyFormat || improved) return "refinement";
  }

  return "new_topic";
}

/**
 * Groups user turns for a receipt into prompt chains and classifies each chain type.
 * Uses structural signal fallback (no embeddings in V1) — semantic_drift_from_prior stays null.
 * Inserts prompt_chains rows and back-fills chain_id + chain_position on prompt_features rows.
 * Called by: processReceiptJob() after runFluencyAnalysis() completes
 * Constructs served: C3 (refinement), C5 (challenge), C7 pre-work (pivot), C12 (loop signal), C13 pre-work (loop)
 */
export async function detectChains(
  receiptId: string,
  participantId: string,
  sessionId: string | null,
  threadId: string | null,
  tool: string | null,
): Promise<void> {
  try {
    const { data: features, error } = await supabaseAdmin
      .from("prompt_features")
      .select(
        "id, turn_id, prompt_position, word_count, c4_role_directive_detected, c5_challenge_detected, c10_clarification_detected, c11_planning_element_score, c3_format_spec_detected, is_last_three_prompts",
      )
      .eq("receipt_id", receiptId)
      .order("prompt_position");
    if (error) {
      console.error("[prompt-telemetry] detectChains load failed", error);
      return;
    }
    const rows = (features ?? []) as ChainFeatureRow[];
    if (rows.length === 0) return;

    // Step 2 — partition into chain groups
    const groups: Array<{ rows: ChainFeatureRow[]; reason: BoundaryReason }> = [];
    let current: ChainFeatureRow[] = [rows[0]];
    let currentReason: BoundaryReason = {
      challenge: false,
      roleDirective: false,
      decomposition: false,
    };
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1];
      const cur = rows[i];
      const reason: BoundaryReason = {
        challenge: cur.c5_challenge_detected === true,
        roleDirective:
          cur.c4_role_directive_detected === true &&
          (cur.prompt_position ?? 0) > 1 &&
          prev.c4_role_directive_detected !== true,
        decomposition:
          (cur.word_count ?? 0) < 0.4 * (prev.word_count ?? 0) &&
          (prev.word_count ?? 0) > 50,
      };
      const isBoundary =
        reason.challenge || reason.roleDirective || reason.decomposition;
      if (isBoundary) {
        groups.push({ rows: current, reason: currentReason });
        current = [cur];
        currentReason = reason;
      } else {
        current.push(cur);
      }
    }
    groups.push({ rows: current, reason: currentReason });

    const tool_value = normalizeTool(tool);
    const totalTurns = rows.length;

    for (const group of groups) {
      const chainType = classifyChain(group.rows, group.reason, totalTurns);

      const structureScores = group.rows
        .map(f => f.c11_planning_element_score)
        .filter((s): s is number => typeof s === "number");
      const avgStructureScore = structureScores.length
        ? structureScores.reduce((a, b) => a + b, 0) / structureScores.length
        : null;
      const structureScoreTrend =
        structureScores.length < 2
          ? "insufficient_data"
          : structureScores[structureScores.length - 1] > structureScores[0]
            ? "improving"
            : structureScores[structureScores.length - 1] < structureScores[0]
              ? "declining"
              : "flat";

      const turnIds = group.rows
        .map(f => f.turn_id)
        .filter((t): t is string => !!t);
      const promptFeatureIds = group.rows.map(f => f.id);

      const lastRow = group.rows[group.rows.length - 1];
      const isLast = lastRow.is_last_three_prompts === true;
      const resolutionType =
        chainType === "acceptance"
          ? "accepted"
          : chainType === "pivot"
            ? "pivoted"
            : isLast
              ? "continued"
              : "continued";

      const { count } = await supabaseAdmin
        .from("prompt_chains")
        .select("id", { count: "exact", head: true })
        .eq("participant_id", participantId)
        .eq("chain_type", chainType)
        .neq("receipt_id", receiptId);
      const firstOccurrence = (count ?? 0) === 0;

      const { data: insertedChain, error: insErr } = await supabaseAdmin
        .from("prompt_chains")
        .insert({
          participant_id: participantId,
          session_id: sessionId,
          receipt_id: receiptId,
          thread_id: threadId,
          tool: tool_value,
          chain_type: chainType,
          turn_ids: turnIds,
          prompt_feature_ids: promptFeatureIds,
          prompt_count: group.rows.length,
          span_ms: null,
          avg_structure_score: avgStructureScore,
          structure_score_trend: structureScoreTrend,
          max_semantic_drift: null,
          resolution_type: resolutionType,
          first_occurrence_for_participant: firstOccurrence,
        })
        .select("id")
        .single();
      if (insErr || !insertedChain) {
        console.error("[prompt-telemetry] insert prompt_chains failed", insErr);
        continue;
      }

      await Promise.all(
        group.rows.map((f, idx) =>
          supabaseAdmin
            .from("prompt_features")
            .update({
              chain_id: insertedChain.id,
              chain_position: idx + 1,
              chain_type: chainType,
            })
            .eq("id", f.id),
        ),
      );
    }
  } catch (e) {
    console.error("[prompt-telemetry] detectChains crashed", e);
  }
}

// ---------------------------------------------------------------------------
// Construct signals aggregation
// ---------------------------------------------------------------------------

interface SignalFeatureRow {
  is_first_prompt_in_session: boolean | null;
  c3_goal_clarity_score: number | null;
  c3_format_spec_detected: boolean | null;
  c3_exemplar_detected: boolean | null;
  c4_role_directive_detected: boolean | null;
  c4_collaboration_term_detected: boolean | null;
  c5_challenge_detected: boolean | null;
  c10_clarification_detected: boolean | null;
  c11_planning_element_score: number | null;
  c12_synthesis_detected: boolean | null;
  c14_attribution_detected: boolean | null;
  c16_meta_prompt_detected: boolean | null;
  pause_before_ms: number | null;
}

interface SignalChainRow {
  chain_type: string | null;
  prompt_count: number | null;
  structure_score_trend: string | null;
}

interface SignalToolHistoryRow {
  tool: string | null;
  session_count: number | null;
  receipt_count: number | null;
}

/**
 * Aggregates prompt_features and prompt_chains for a receipt into one receipt_construct_signals row.
 * Computes signal rates for constructs C3, C4, C5, C9, C10, C11, C12, C14, C16.
 * Upserts via ON CONFLICT (receipt_id) DO UPDATE so re-runs are safe.
 * Called by: processReceiptJob() after detectChains() completes
 * Constructs served: C3, C4, C5, C9, C10, C11, C12, C14, C16
 */
export async function computeConstructSignals(
  receiptId: string,
  participantId: string,
  sessionId: string | null,
  tool: string | null,
): Promise<void> {
  try {
    const featureCols =
      "is_first_prompt_in_session, c3_goal_clarity_score, c3_format_spec_detected, c3_exemplar_detected, c4_role_directive_detected, c4_collaboration_term_detected, c5_challenge_detected, c10_clarification_detected, c11_planning_element_score, c12_synthesis_detected, c14_attribution_detected, c16_meta_prompt_detected, pause_before_ms";

    const { data: featuresData, error: fErr } = await supabaseAdmin
      .from("prompt_features")
      .select(featureCols)
      .eq("receipt_id", receiptId)
      .order("prompt_position");
    if (fErr) {
      console.error("[prompt-telemetry] load features failed", fErr);
      return;
    }
    const userFeatures = (featuresData ?? []) as unknown as SignalFeatureRow[];
    if (userFeatures.length === 0) return;

    const { data: chainsData } = await supabaseAdmin
      .from("prompt_chains")
      .select("chain_type, prompt_count, structure_score_trend")
      .eq("receipt_id", receiptId);
    const chainList = (chainsData ?? []) as unknown as SignalChainRow[];

    const { count: totalReceiptsCount } = await supabaseAdmin
      .from("receipts")
      .select("id", { count: "exact", head: true })
      .eq("participant_id", participantId);
    const totalReceipts = totalReceiptsCount ?? 0;

    const { data: toolHistoryData } = await supabaseAdmin
      .from("participant_tool_history")
      .select("tool, session_count, receipt_count")
      .eq("participant_id", participantId);
    const toolHistory = (toolHistoryData ?? []) as unknown as SignalToolHistoryRow[];

    const totalUserPrompts = userFeatures.length;
    const postFirst = userFeatures.filter(f => !f.is_first_prompt_in_session);
    const totalPostFirst = postFirst.length;

    // C3
    const goalClarityFeatures = userFeatures.filter(
      f => f.c3_goal_clarity_score !== null,
    );
    const c3AvgGoalClarity = goalClarityFeatures.length
      ? goalClarityFeatures.reduce(
          (sum, f) => sum + (f.c3_goal_clarity_score ?? 0),
          0,
        ) / goalClarityFeatures.length
      : null;
    const c3FormatSpecCount = userFeatures.filter(
      f => f.c3_format_spec_detected === true,
    ).length;
    const c3FormatSpecRate =
      totalUserPrompts > 0 ? c3FormatSpecCount / totalUserPrompts : 0;
    const c3ExemplarCount = userFeatures.filter(
      f => f.c3_exemplar_detected === true,
    ).length;
    const c3ExemplarRate =
      totalUserPrompts > 0 ? c3ExemplarCount / totalUserPrompts : 0;
    const c3IterationRate = totalUserPrompts >= 2 ? 1.0 : 0.0;

    const largestChain = [...chainList].sort(
      (a, b) => (b.prompt_count ?? 0) - (a.prompt_count ?? 0),
    )[0];
    const c3StructureTrend =
      largestChain?.structure_score_trend ?? "insufficient_data";
    const c3Insufficient = totalReceipts < 10;

    // C4
    const c4RoleCount = userFeatures.filter(
      f => f.c4_role_directive_detected === true,
    ).length;
    const c4RoleRate =
      totalUserPrompts > 0 ? c4RoleCount / totalUserPrompts : 0;
    const c4CollabCount = userFeatures.filter(
      f => f.c4_collaboration_term_detected === true,
    ).length;

    // C5
    const c5ChallengeCount = userFeatures.filter(
      f => f.c5_challenge_detected === true,
    ).length;
    const c5ChallengeRate =
      totalPostFirst > 0 ? c5ChallengeCount / totalPostFirst : 0;

    // C9
    const c9ToolsUsedCount = toolHistory.length;
    const normalizedTool = normalizeTool(tool);
    const thisToolHistory = toolHistory.find(h => h.tool === normalizedTool);
    const c9ToolIsNew = thisToolHistory
      ? (thisToolHistory.session_count ?? 0) <= 1
      : true;

    // C10
    const c10ClarificationCount = userFeatures.filter(
      f => f.c10_clarification_detected === true,
    ).length;
    const c10ClarificationRate =
      totalPostFirst > 0 ? c10ClarificationCount / totalPostFirst : 0;

    const pauseValues = userFeatures
      .map(f => f.pause_before_ms)
      .filter((v): v is number => v !== null && v !== undefined);
    let c10ExtendedPauseRate = 0.0;
    if (pauseValues.length >= 2) {
      const mean =
        pauseValues.reduce((a, b) => a + b, 0) / pauseValues.length;
      const sd = Math.sqrt(
        pauseValues.reduce((a, b) => a + Math.pow(b - mean, 2), 0) /
          pauseValues.length,
      );
      const threshold = mean + sd;
      const extended = pauseValues.filter(
        v => v > threshold && v < 300_000,
      ).length;
      c10ExtendedPauseRate = extended / pauseValues.length;
    }

    // C11
    const structureScores = userFeatures
      .map(f => f.c11_planning_element_score)
      .filter((s): s is number => s !== null);
    const c11MeanStructureScore = structureScores.length
      ? structureScores.reduce((a, b) => a + b, 0) / structureScores.length
      : null;
    const c11Insufficient = totalReceipts < 10;

    // C12
    const c12SynthesisCount = userFeatures.filter(
      f => f.c12_synthesis_detected === true,
    ).length;
    const c12SynthesisRate =
      totalUserPrompts > 0 ? c12SynthesisCount / totalUserPrompts : 0;
    const c12ReceiptReflectionCount = totalReceipts;

    // C14
    const c14AttributionCount = userFeatures.filter(
      f => f.c14_attribution_detected === true,
    ).length;
    const c14AttributionRate =
      totalUserPrompts > 0 ? c14AttributionCount / totalUserPrompts : 0;

    // C16
    const c16MetaCount = userFeatures.filter(
      f => f.c16_meta_prompt_detected === true,
    ).length;
    const c16MetaRate =
      totalUserPrompts > 0 ? c16MetaCount / totalUserPrompts : 0;

    // Chain analysis
    const totalChainCount = chainList.length;
    const chainTypeCounts = (type: string) =>
      chainList.filter(c => c.chain_type === type).length;
    const dominantChainType = chainList.length
      ? chainList.reduce((a, b) =>
          (a.prompt_count ?? 0) >= (b.prompt_count ?? 0) ? a : b,
        ).chain_type
      : null;

    const { error: upErr } = await supabaseAdmin
      .from("receipt_construct_signals")
      .upsert(
        {
          receipt_id: receiptId,
          participant_id: participantId,
          session_id: sessionId,
          tool: normalizedTool,
          task_type: null,

          c3_avg_goal_clarity: c3AvgGoalClarity,
          c3_format_spec_rate: c3FormatSpecRate,
          c3_exemplar_rate: c3ExemplarRate,
          c3_iteration_rate: c3IterationRate,
          c3_structure_trend: c3StructureTrend,
          c3_insufficient: c3Insufficient,

          c4_role_directive_count: c4RoleCount,
          c4_role_directive_rate: c4RoleRate,
          c4_collaboration_term_count: c4CollabCount,
          c4_settings_toggle_count: null,

          c5_challenge_count: c5ChallengeCount,
          c5_challenge_rate: c5ChallengeRate,

          c9_tools_used_count: c9ToolsUsedCount,
          c9_tool_is_new: c9ToolIsNew,

          c10_clarification_count: c10ClarificationCount,
          c10_clarification_rate: c10ClarificationRate,
          c10_extended_pause_rate: c10ExtendedPauseRate,

          c11_mean_structure_score: c11MeanStructureScore,
          c11_insufficient: c11Insufficient,

          c12_synthesis_rate: c12SynthesisRate,
          c12_receipt_reflection_count: c12ReceiptReflectionCount,

          c14_attribution_rate: c14AttributionRate,

          c16_meta_count: c16MetaCount,
          c16_meta_rate: c16MetaRate,

          total_prompt_count: totalUserPrompts,
          total_chain_count: totalChainCount,
          loop_chain_count: chainTypeCounts("loop"),
          refinement_chain_count: chainTypeCounts("refinement"),
          challenge_chain_count: chainTypeCounts("challenge"),
          pivot_chain_count: chainTypeCounts("pivot"),
          dominant_chain_type: dominantChainType,

          session_duration_ms: null,
          prerequisite_missing: false,
        },
        { onConflict: "receipt_id" },
      );
    if (upErr) {
      console.error("[prompt-telemetry] upsert receipt_construct_signals failed", upErr);
    }
  } catch (e) {
    console.error("[prompt-telemetry] computeConstructSignals crashed", e);
  }
}
