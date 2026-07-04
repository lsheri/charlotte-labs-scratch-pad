// Core recommendation generator. Used by:
//   - serverfn `getFluencyRecommendations` (user-scoped supabase client)
//   - `processReceiptJob` (supabaseAdmin) so recs are baked in before the
//     job is marked completed and the UI no longer has to wait on an LLM
//     call at first paint.
import { chatCompletion, SUMMARY_MODEL } from "@/server/openai.server";

export interface Recommendation {
  title: string;
  body: string;
  prompt_template: string | null;
  dimension: string;
  urgency: "habit" | "opportunity" | "unlock";
}

export interface RecommendationsResult {
  recommendations: Recommendation[];
  goal_used: boolean;
  priority_rationale: string;
  status?: "personalized" | "pending" | "fallback";
}

const CACHE_TTL_HOURS = 24;
const URGENCIES = ["habit", "opportunity", "unlock"] as const;
const REQUIRED_COUNT = 3;

function inferGoalType(goal: string | null): string {
  if (!goal) return "general";
  const g = goal.toLowerCase();
  if (/debug|fix|error|broken|not work|why is|keep|firing|failing/.test(g)) return "debugging";
  if (/final|submit|due|deadline|hand in|turn in|graded|exam|present/.test(g)) return "high_stakes_deliverable";
  if (/draft|write|build|create|make|generate|produce|design/.test(g)) return "producing_deliverable";
  if (/learn|understand|explain|how does|why does|what is|concept/.test(g)) return "learning";
  if (/explore|brainstorm|ideas|options|possibilities|what if/.test(g)) return "exploration";
  return "general";
}

export interface GenerateRecsDeps {
  // Any supabase-js client (user-scoped or admin). All reads are scoped by receipt id;
  // RLS handles user-side authorization at the serverfn layer.
  supabase: any;
  receiptId: string;
}

export async function generateRecommendationsForReceipt(
  { supabase, receiptId }: GenerateRecsDeps,
): Promise<RecommendationsResult> {
  // Step 1 — receipt
  const { data: receipt, error: rErr } = await supabase
    .from("receipts")
    .select("id, tool_used, metadata, updated_at, participant_id, session_id")
    .eq("id", receiptId)
    .single();
  if (rErr || !receipt) throw new Error(rErr?.message || "Receipt not found");

  // Step 2 — most recent fluency run
  const { data: run } = await supabase
    .from("fluency_analysis_runs")
    .select("analysis_output_json, created_at")
    .eq("receipt_id", receipt.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Step 3 — construct signals row
  const { data: signals } = await supabase
    .from("receipt_construct_signals")
    .select("*")
    .eq("receipt_id", receipt.id)
    .limit(1)
    .maybeSingle();

  // Step 4 — prompt chains
  const { data: chainRows } = await supabase
    .from("prompt_chains")
    .select("chain_type, prompt_count")
    .eq("receipt_id", receipt.id)
    .order("created_at", { ascending: true });
  const chains = (chainRows ?? []) as Array<{ chain_type: string | null; prompt_count: number | null }>;

  // Step 5 — sibling receipt count in this session
  const { count: receiptCountRaw } = await supabase
    .from("receipts")
    .select("id", { count: "exact", head: true })
    .eq("participant_id", receipt.participant_id)
    .eq("session_id", receipt.session_id);
  const receiptCount = receiptCountRaw ?? 1;

  // Step 6 — cross-receipt loop chain occurrences (last 20 prior receipts)
  const { data: priorReceiptRows } = await supabase
    .from("receipts")
    .select("id")
    .eq("participant_id", receipt.participant_id)
    .neq("id", receipt.id)
    .order("created_at", { ascending: false })
    .limit(20);
  const priorIds = (priorReceiptRows ?? []).map((r: any) => r.id as string);
  let priorLoopOccurrences = 0;
  if (priorIds.length) {
    const { count: loopCount } = await supabase
      .from("prompt_chains")
      .select("id", { count: "exact", head: true })
      .in("receipt_id", priorIds)
      .eq("chain_type", "loop");
    priorLoopOccurrences = loopCount ?? 0;
  }
  const patternRecurring = priorLoopOccurrences >= 2;

  // Step 6b — recent prior receipt themes (cheap learning win: lets the
  // model say "across your last N sessions you keep…" with real grounding).
  // Reuse priorIds (last 20); pull their construct signals + fluency runs.
  let priorThemes: Array<{ dominant_chain_type: string | null; weakest: string | null }> = [];
  if (priorIds.length) {
    const recentIds = priorIds.slice(0, 5);
    const { data: priorSignals } = await supabase
      .from("receipt_construct_signals")
      .select("receipt_id, dominant_chain_type")
      .in("receipt_id", recentIds);
    const { data: priorRuns } = await supabase
      .from("fluency_analysis_runs")
      .select("receipt_id, analysis_output_json")
      .in("receipt_id", recentIds);
    const sigMap = new Map<string, string | null>(
      (priorSignals ?? []).map((s: any) => [s.receipt_id, s.dominant_chain_type ?? null]),
    );
    const runMap = new Map<string, any>(
      (priorRuns ?? []).map((r: any) => [r.receipt_id, r.analysis_output_json]),
    );
    priorThemes = recentIds.map((id: string) => {
      const audit = runMap.get(id);
      const dims: any[] = Array.isArray(audit?.dimensions) ? audit.dimensions : [];
      const weakest = dims
        .filter((d) => typeof d.score === "number")
        .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))[0]?.display_name ?? null;
      return { dominant_chain_type: sigMap.get(id) ?? null, weakest };
    });
  }

  // Step 7 — behavior library + observed/missing
  const audit: any = run?.analysis_output_json ?? null;
  const dims: any[] = Array.isArray(audit?.dimensions) ? audit.dimensions : [];
  const observedSet = new Set<string>();
  for (const d of dims) {
    for (const b of (d.behaviors_observed ?? [])) observedSet.add(b);
  }
  const { data: behLib } = await supabase
    .from("behavior_library")
    .select("behavior_code")
    .eq("active", true);
  const allCodes: string[] = (behLib ?? []).map((b: any) => b.behavior_code);
  const behaviorCodesMissing = allCodes.filter((c) => !observedSet.has(c));

  // Step 8 — fingerprint
  const fingerprint =
    `${receipt.id}:${receipt.updated_at}:${run?.created_at ?? "none"}:${(signals as any)?.created_at ?? "none"}:v3`;

  // Cache check
  const { data: cached } = await supabase
    .from("receipt_recommendations_cache" as any)
    .select("payload, fingerprint, expires_at")
    .eq("receipt_id", receipt.id)
    .maybeSingle();
  if (
    cached &&
    (cached as any).fingerprint === fingerprint &&
    new Date((cached as any).expires_at).getTime() > Date.now()
  ) {
    return (cached as any).payload as RecommendationsResult;
  }
  const writeCache = async (payload: RecommendationsResult) => {
    const expires = new Date(Date.now() + CACHE_TTL_HOURS * 3600 * 1000).toISOString();
    await supabase.from("receipt_recommendations_cache" as any).upsert(
      {
        receipt_id: receipt.id,
        fingerprint,
        payload: payload as any,
        expires_at: expires,
      } as any,
      { onConflict: "receipt_id" },
    );
  };

  // Build snapshot
  const meta = (receipt.metadata ?? {}) as Record<string, any>;
  const goal: string | null = typeof meta.goal === "string" && meta.goal ? meta.goal : null;
  const workflowType = typeof meta.workflowType === "string" ? meta.workflowType : null;
  const artifactProducing =
    ["code", "document", "spreadsheet", "app"].includes(workflowType ?? "") ||
    /code|doc|sheet|script/i.test(receipt.tool_used ?? "");

  const loopChainCount = chains.filter((c) => c.chain_type === "loop").length;
  const refinementChainCount = chains.filter((c) => c.chain_type === "refinement").length;
  const dominantChainType =
    [...chains].sort((a, b) => (b.prompt_count ?? 0) - (a.prompt_count ?? 0))[0]?.chain_type ?? null;

  const evidenceSnippets = dims.flatMap((d) => d.evidence_snippets ?? []).slice(0, 5);

  const weakestDimensions = dims
    .filter((d: any) => typeof d.score === "number")
    .sort((a: any, b: any) => (a.score ?? 0) - (b.score ?? 0))
    .slice(0, 3)
    .map((d: any) => d.display_name);

  const s: any = signals ?? {};
  const promptSignals = signals
    ? {
        avg_goal_clarity: s.c3_avg_goal_clarity,
        format_spec_rate: s.c3_format_spec_rate,
        exemplar_rate: s.c3_exemplar_rate,
        iteration_rate: s.c3_iteration_rate,
        role_directive_rate: s.c4_role_directive_rate,
        collaboration_term_count: s.c4_collaboration_term_count,
        settings_toggle_count: s.c4_settings_toggle_count,
        challenge_rate: s.c5_challenge_rate,
        challenge_count: s.c5_challenge_count,
        clarification_rate: s.c10_clarification_rate,
        mean_structure_score: s.c11_mean_structure_score,
        synthesis_rate: s.c12_synthesis_rate,
        attribution_rate: s.c14_attribution_rate,
        meta_prompt_rate: s.c16_meta_rate,
        meta_prompt_count: s.c16_meta_count,
        pivot_chain_count: s.pivot_chain_count,
        loop_chain_count_signals: s.loop_chain_count,
        refinement_chain_count_signals: s.refinement_chain_count,
      }
    : null;

  const snapshot = {
    session_context: {
      tool: receipt.tool_used ?? "AI",
      workflow_type: workflowType,
      artifact_producing: artifactProducing,
      receipt_count: receiptCount,
      is_first_receipt: receiptCount === 1,
    },
    chain_signals: {
      loop_chain_count: loopChainCount,
      refinement_chain_count: refinementChainCount,
      dominant_chain_type: dominantChainType,
      total_chains: chains.length,
      pattern_recurring: patternRecurring,
      prior_loop_occurrences: priorLoopOccurrences,
    },
    prompt_signals: promptSignals,
    fluency: {
      overall_level: audit?.overall_level ?? null,
      weakest_dimensions: weakestDimensions,
      dimension_scores: dims.map((d: any) => ({
        name: d.display_name,
        score: d.score,
        evidence_basis: d.evidence_basis,
        snippets: (d.evidence_snippets ?? []).slice(0, 2),
      })),
    },
    goal: {
      text: goal,
      inferred_type: inferGoalType(goal),
    },
    behavior: {
      codes_observed: Array.from(observedSet),
      codes_missing: behaviorCodesMissing.slice(0, 10),
    },
    prior_receipt_themes: priorThemes, // up to 5 recent receipts
  };

  // Evidence framing note — but we ALWAYS ship 3 recs (no count drop on
  // sparse data; instead, the 3rd uses a weaker-evidence framing).
  let evidenceNote = "";
  const totalEvidenceSignals =
    (loopChainCount > 0 ? 1 : 0) +
    (signals ? 1 : 0) +
    (evidenceSnippets.length > 0 ? 1 : 0) +
    (dims.filter((d) => d.score != null).length > 0 ? 1 : 0);
  if (totalEvidenceSignals < 3) {
    evidenceNote =
      "EVIDENCE NOTE: Session data is sparse. The first 2 recommendations must be grounded in observed signals; the 3rd may be an introductory orienting recommendation about what to watch for next session.";
  } else if (receiptCount === 1) {
    evidenceNote =
      "FIRST SESSION NOTE: This is their first receipt. One recommendation should orient them to what Charlotte measures and what to watch for next session.";
  } else if (receiptCount >= 5 && patternRecurring) {
    evidenceNote = `RECURRING PATTERN NOTE: This student has ${receiptCount} receipts and this pattern has appeared before. The lead recommendation must address breaking the recurring pattern. Be direct.`;
  }

  const hasProvider = !!(process.env.OPENAI_API_KEY || process.env.LOVABLE_API_KEY);
  if (!hasProvider) {
    return {
      recommendations: [],
      goal_used: false,
      priority_rationale: "Personalized recommendations are still generating.",
      status: "pending",
    };
  }

  const systemPrompt = `You are Charlotte, a research tool that helps people understand their AI collaboration patterns.

VOICE RULES:
- Second person, warm, direct. Never use praise or filler ("Great job", "Interesting", "Well done").
- Reference specific signals from the session data — never give generic prompt-engineering advice.
- If you cannot ground a recommendation in something observed (a count, a rate, a quote, a chain, a prior-session theme), use the weakest-evidence framing rather than inventing data.
- Concrete over abstract: "Add a constraint like 'maximum 3 bullet points'" beats "Be more specific".
- When citing research statistics, connect them explicitly to what the student just did in this session.

OUTPUT RULES:
- Return valid JSON only, exactly this shape:
  { "recommendations": [...], "goal_used": boolean, "priority_rationale": string }
- Each recommendation:
  { "title": string (≤8 words, imperative or observational), "body": string (2-3 sentences, must reference at least one specific signal value OR a prior-session theme), "prompt_template": string | null (fill-in-the-blank with {brackets}), "dimension": string, "urgency": "habit" | "opportunity" | "unlock" }
- urgency meanings:
  "habit" = this pattern appeared across multiple receipts and is worth addressing now
  "opportunity" = observed in this session, relatively easy to change
  "unlock" = a behavior not yet shown that would meaningfully improve their work
- COUNT: Return EXACTLY 3 recommendations. Not 2, not 4 — always 3.
- DIVERSITY: The 3 recommendations MUST come from 3 different dimensions (Direction, Delegation, Discernment, Development, Ethics, Efficiency, Strategic Agency). No two may share a dimension.
- EXECUTABILITY: Each recommendation must be something the student can try in their next session in under 5 minutes — a specific prompt move, not a mindset shift.
- PROMPT TEMPLATES: At least 2 of the 3 MUST include a non-null prompt_template the user can paste verbatim (with {brackets} for fill-ins). Only the 3rd may have prompt_template = null.
- ORDER: Most-urgent first. "habit" before "opportunity" before "unlock". If no "habit" applies, lead with the strongest "opportunity".`;

  const userPrompt = `Generate exactly 3 personalized recommendations for this student based on their session data.

${evidenceNote ? evidenceNote + "\n\n" : ""}SESSION DATA:
${JSON.stringify(snapshot, null, 2)}

RECOMMENDATION PRIORITIES (evaluate in order; pick the 3 best-grounded, one per dimension):

1. LOOP CHAINS: If chain_signals.loop_chain_count >= 2, include an adaptive strategy recommendation.
   - Open with the specific count: "You sent [N] similar prompts in a row..."
   - urgency = "habit" if pattern_recurring = true, else "opportunity"
   - prompt_template should show a reframe structure.

2. DISCERNMENT GAP: If prompt_signals.challenge_rate = 0 AND fluency.overall_level is not null, include a Discernment recommendation.
   - Reference the 0.0 challenge rate explicitly.
   - If artifact_producing = true: cite "Discernment drops 5.2pp on identifying missing context in artifact-producing sessions — exactly this kind of session."

3. RECURRING PATTERNS: If pattern_recurring = true, set urgency = "habit" and open with "Across your last [receipt_count] sessions...". Use prior_receipt_themes to name the recurring weakness if possible.

4. FIRST PROMPT STRUCTURE: If prompt_signals.mean_structure_score <= 2, include a Direction recommendation.
   - Reference what elements were present vs missing (out of 5: role, task, context, format, constraints).
   - prompt_template should show what a structured first prompt looks like for their workflow type.

5. GOAL CONNECTION: If goal.text is not null, the first recommendation must connect to the goal.
   "debugging" -> Discernment; "producing_deliverable"/"high_stakes_deliverable" -> Discernment (5.2pp finding);
   "learning" -> Direction + iteration (2.67x finding); "exploration" -> iteration + Development.

6. BEHAVIOR UNLOCK: Use behavior.codes_missing for the 3rd recommendation when it adds a new dimension. Name the specific behavior code, explain what it looks like in practice, give a template.
   Never recommend a behavior in behavior.codes_observed.

RESEARCH CITATIONS (use only when directly connected to an observed signal):
- Iteration: "Iterating conversations show 2.67x more total fluency behaviors."
- Artifact suppression: "Discernment drops 5.2pp on identifying missing context in artifact-producing sessions."
- Collaboration terms: "Only 30% of conversations include any instruction about how the user wants the AI to interact."`;

  try {
    const completion = await chatCompletion({
      label: "fluency-recommendations",
      receiptId: receipt.id,
      participantId: receipt.participant_id,
      timeoutMs: 12_000,
      body: {
        model: SUMMARY_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 1600,
      },
      validate: (d) => {
        const raw = d?.choices?.[0]?.message?.content;
        if (typeof raw !== "string" || raw.length < 2) return false;
        try { JSON.parse(raw); return true; } catch { return false; }
      },
    });
    if (!completion.ok || !completion.data) {
      console.error("[recommendations] provider failed", completion.errorMessage);
      return {
        recommendations: [],
        goal_used: false,
        priority_rationale: "Personalized recommendations are still generating.",
        status: "pending",
      };
    }
    const json: any = completion.data;
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      return {
        recommendations: [],
        goal_used: false,
        priority_rationale: "Personalized recommendations are still generating.",
        status: "pending",
      };
    }
    const parsed = JSON.parse(content);
    let recs: any[] = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];

    // Enforce exactly 3, dimension-diverse. If the model returned >3, trim to
    // the first 3 distinct-dimension entries. If <3, top up from fallback.
    const seenDims = new Set<string>();
    const deduped: any[] = [];
    for (const r of recs) {
      const dim = typeof r?.dimension === "string" ? r.dimension.toLowerCase() : "";
      if (!dim || seenDims.has(dim)) continue;
      seenDims.add(dim);
      deduped.push(r);
      if (deduped.length === REQUIRED_COUNT) break;
    }
    recs = deduped;

    const valid =
      recs.length === REQUIRED_COUNT &&
      recs.every(
        (r: any) =>
          r &&
          typeof r.title === "string" &&
          typeof r.body === "string" &&
          typeof r.dimension === "string" &&
          typeof r.urgency === "string" &&
          (r.prompt_template === null || typeof r.prompt_template === "string"),
      );
    if (!valid) {
      return {
        recommendations: [],
        goal_used: false,
        priority_rationale: "Personalized recommendations are still generating.",
        status: "pending",
      };
    }

    const personalized: RecommendationsResult = {
      recommendations: recs.map((r: any): Recommendation => {
        const u = URGENCIES.includes(r.urgency) ? r.urgency : "opportunity";
        return {
          title: String(r.title).slice(0, 60),
          body: String(r.body).slice(0, 400),
          prompt_template: r.prompt_template ? String(r.prompt_template).slice(0, 300) : null,
          dimension: String(r.dimension).slice(0, 60),
          urgency: u as Recommendation["urgency"],
        };
      }),
      goal_used: !!parsed.goal_used,
      priority_rationale: String(parsed.priority_rationale ?? "").slice(0, 200),
      status: "personalized",
    };
    await writeCache(personalized);
    return personalized;
  } catch (e) {
    console.error("[recommendations] error", e);
    return {
      recommendations: [],
      goal_used: false,
      priority_rationale: "Personalized recommendations are still generating.",
      status: "pending",
    };
  }
}
