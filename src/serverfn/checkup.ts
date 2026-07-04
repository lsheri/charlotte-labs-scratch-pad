import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { chatCompletion, ROUTING_MODEL } from "@/server/openai.server";

export interface CheckupStop {
  nodeKey: string;
  nodeType: "tool" | "workflow_type" | "purpose" | "user";
  title: string;
  insight: string;
}

export interface CheckupResult {
  stops: CheckupStop[];
  summary: {
    receiptCount: number;
    topTools: string[];
    topWorkflowTypes: string[];
    topPurposes: string[];
    labCount: number;
    personalCount: number;
    topPair: [string, string] | null;
  };
}

const VALID_TYPES = new Set(["tool", "workflow_type", "purpose", "user"]);
const CACHE_TTL_HOURS = 24;

function topN<K>(map: Map<K, number>, n: number): K[] {
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}

export const getCheckupInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: receipts } = await supabase
      .from("receipts")
      .select("id, tool_used, created_at, updated_at, metadata")
      .eq("participant_id", userId)
      .order("created_at", { ascending: false })
      .limit(80);

    const list = receipts ?? [];

    // Fingerprint: count + latest id + latest updated_at — changes only when content changes.
    const latest = list[0];
    const fingerprint = `${list.length}:${latest?.id ?? "none"}:${latest?.updated_at ?? latest?.created_at ?? "none"}`;

    // ---- Cache lookup ----
    const { data: cached } = await supabase
      .from("checkup_cache")
      .select("payload, receipts_fingerprint, expires_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (
      cached &&
      cached.receipts_fingerprint === fingerprint &&
      new Date(cached.expires_at).getTime() > Date.now()
    ) {
      return cached.payload as unknown as CheckupResult;
    }

    // ---- Aggregate ----
    const toolCount = new Map<string, number>();
    const wfTypeCount = new Map<string, number>();
    const purposeCount = new Map<string, number>();
    const pairCount = new Map<string, number>();
    let labCount = 0;
    let personalCount = 0;

    for (const r of list) {
      const meta = (r.metadata ?? {}) as Record<string, any>;
      const tools = new Set<string>();
      if (r.tool_used) tools.add(String(r.tool_used).toLowerCase());
      if (Array.isArray(meta.tools)) meta.tools.forEach((t: string) => t && tools.add(String(t).toLowerCase()));
      tools.forEach((t) => toolCount.set(t, (toolCount.get(t) ?? 0) + 1));
      const arr = Array.from(tools).sort();
      for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
        const k = `${arr[i]}::${arr[j]}`;
        pairCount.set(k, (pairCount.get(k) ?? 0) + 1);
      }
      if (typeof meta.workflowType === "string" && meta.workflowTypeSet) {
        wfTypeCount.set(meta.workflowType, (wfTypeCount.get(meta.workflowType) ?? 0) + 1);
      }
      if (typeof meta.purpose === "string") {
        purposeCount.set(meta.purpose, (purposeCount.get(meta.purpose) ?? 0) + 1);
      }
      if (meta.provenance === "lab") labCount++;
      else personalCount++;
    }

    // Per-tool fluency means: batch-fetch runs for these receipts, group by tool_used.
    const receiptIds = list.map((r) => r.id).filter(Boolean);
    const toolFluencyMeans: Array<{ tool: string; meanConfidence: number; runCount: number }> = [];
    if (receiptIds.length > 0) {
      const { data: runs } = await supabase
        .from("fluency_analysis_runs")
        .select("receipt_id, overall_confidence")
        .in("receipt_id", receiptIds);
      const receiptToolMap = new Map<string, string>();
      for (const r of list) {
        if (r.id && r.tool_used) receiptToolMap.set(r.id, String(r.tool_used).toLowerCase());
      }
      const byTool = new Map<string, number[]>();
      for (const run of runs ?? []) {
        const tool = run.receipt_id ? receiptToolMap.get(run.receipt_id) : null;
        if (!tool) continue;
        if (typeof run.overall_confidence !== "number") continue;
        const arr = byTool.get(tool) ?? [];
        arr.push(run.overall_confidence);
        byTool.set(tool, arr);
      }
      for (const [tool, scores] of byTool.entries()) {
        if (scores.length < 3) continue;
        const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
        toolFluencyMeans.push({ tool, meanConfidence: mean, runCount: scores.length });
      }
      toolFluencyMeans.sort((a, b) => b.meanConfidence - a.meanConfidence);
      toolFluencyMeans.splice(4);
    }

    const topTools = topN(toolCount, 5);
    const topWorkflowTypes = topN(wfTypeCount, 3);
    const topPurposes = topN(purposeCount, 3);
    const topPairKey = topN(pairCount, 1)[0];
    const topPair: [string, string] | null = topPairKey
      ? (topPairKey.split("::") as [string, string])
      : null;

    const summary = {
      receiptCount: list.length, topTools, topWorkflowTypes, topPurposes,
      labCount, personalCount, topPair,
    };

    const writeCache = async (payload: CheckupResult) => {
      const expires = new Date(Date.now() + CACHE_TTL_HOURS * 3600 * 1000).toISOString();
      await supabase.from("checkup_cache").upsert({
        user_id: userId, receipts_fingerprint: fingerprint,
        payload: payload as any, expires_at: expires,
      }, { onConflict: "user_id" });
    };

    if (list.length === 0) {
      const empty: CheckupResult = {
        stops: [{
          nodeKey: "user-center", nodeType: "user",
          title: "Hi, I'm Charlotte",
          insight: "I don't have enough threads to read yet. Log a few AI sessions and I'll come back with a real tour.",
        }],
        summary,
      };
      await writeCache(empty);
      return empty;
    }

    // chatCompletion() routes to Lovable AI Gateway (primary) → OpenAI (fallback);
    // it checks for keys itself, so we only need a local fallback when both fail.


    const validKeys = [
      "user-center",
      ...topTools.map((t) => `tool-${t}`),
      ...topWorkflowTypes.map((t) => `workflow-${t}`),
      ...topPurposes.map((p) => `purpose-${p}`),
    ];

    // System prompt — strict, observational, anti-hallucination, evidence-bound.
    const systemPrompt = [
      "You are Charlotte, a friendly research spider giving a brief tour of how this user collaborates with AI.",
      "Your job is OBSERVATION, not advice.",
      "Hard rules:",
      "1. Speak ONLY about facts present in the JSON I give you. Never invent tools, projects, or behaviors.",
      "2. If you cannot make a specific observation, name what you CAN see (e.g. 'mostly one tool', 'mostly personal tinkering') instead of generic prompt-engineering tips.",
      "3. Every stop must reference a number, a tool name, a workflow type, or a purpose from the data.",
      "4. Voice: second person, warm, direct, observational. No filler ('great job', 'interesting'). No emojis. No questions.",
      "5. Keep insights under 220 chars. One observation per stop.",
      "6. Never recommend tools or behaviors the user hasn't already shown.",
    ].join("\n");

    const payload = {
      model: ROUTING_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content:
            `User's recent AI receipts (last ${list.length}) — compact summary:\n` +
            JSON.stringify({ ...summary, toolFluencyMeans }) +
            `\n\nProduce 4-5 tour stops.\n` +
            `nodeKey MUST be from: ${JSON.stringify(validKeys)}.\n` +
            `nodeType matches the prefix (tool-/workflow-/purpose-/user-).\n` +
            `Order stops to tell a small narrative: start at user-center, then top tool, then a pairing or workflow, end on a purpose or back at center.`,
        },
      ],
      tools: [{
        type: "function",
        function: {
          name: "report_stops",
          description: "Return the tour stops with insights.",
          parameters: {
            type: "object",
            properties: {
              stops: {
                type: "array", minItems: 4, maxItems: 5,
                items: {
                  type: "object",
                  properties: {
                    nodeKey: { type: "string" },
                    nodeType: { type: "string", enum: ["tool", "workflow_type", "purpose", "user"] },
                    title: { type: "string", maxLength: 40 },
                    insight: { type: "string", maxLength: 220 },
                  },
                  required: ["nodeKey", "nodeType", "title", "insight"],
                  additionalProperties: false,
                },
              },
            },
            required: ["stops"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "report_stops" } },
      max_completion_tokens: 300,
    };

    try {
      const result = await chatCompletion({
        label: "checkup",
        body: payload,
        timeoutMs: 20_000,
      });
      if (!result.ok || !result.data) {
        console.error("[checkup] provider failed", result.errorMessage);
        const fb: CheckupResult = { stops: localFallback(summary), summary };
        await writeCache(fb);
        return fb;
      }
      const json: any = result.data;
      const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!args) {
        const fb: CheckupResult = { stops: localFallback(summary), summary };
        await writeCache(fb);
        return fb;
      }
      const parsed = JSON.parse(args);
      const stops: CheckupStop[] = (parsed.stops ?? [])
        .filter((s: any) => s && validKeys.includes(s.nodeKey) && VALID_TYPES.has(s.nodeType))
        .map((s: any) => ({
          nodeKey: String(s.nodeKey),
          nodeType: s.nodeType,
          title: String(s.title).slice(0, 40),
          insight: String(s.insight).slice(0, 220),
        }));
      const final: CheckupResult = stops.length
        ? { stops, summary }
        : { stops: localFallback(summary), summary };
      await writeCache(final);
      return final;
    } catch (e) {
      console.error("[checkup] error", e);
      const fb: CheckupResult = { stops: localFallback(summary), summary };
      await writeCache(fb);
      return fb;
    }
  });

function localFallback(s: CheckupResult["summary"]): CheckupStop[] {
  const stops: CheckupStop[] = [];
  stops.push({
    nodeKey: "user-center", nodeType: "user",
    title: "Your fingerprint",
    insight: `You've logged ${s.receiptCount} receipts. ${s.labCount} lab work · ${s.personalCount} personal tinkering.`,
  });
  if (s.topTools[0]) stops.push({
    nodeKey: `tool-${s.topTools[0]}`, nodeType: "tool",
    title: `Top tool: ${s.topTools[0]}`,
    insight: `${s.topTools[0]} is the tool you reach for most often.`,
  });
  if (s.topPair) stops.push({
    nodeKey: `tool-${s.topPair[0]}`, nodeType: "tool",
    title: "Favorite combo",
    insight: `You often pair ${s.topPair[0]} with ${s.topPair[1]} in the same workflow.`,
  });
  if (s.topWorkflowTypes[0]) stops.push({
    nodeKey: `workflow-${s.topWorkflowTypes[0]}`, nodeType: "workflow_type",
    title: "Output of choice",
    insight: `Most of your declared workflows produce ${s.topWorkflowTypes[0]} outputs.`,
  });
  if (s.topPurposes[0]) stops.push({
    nodeKey: `purpose-${s.topPurposes[0]}`, nodeType: "purpose",
    title: "Where you use AI",
    insight: `Your most common purpose is ${s.topPurposes[0]}.`,
  });
  return stops.slice(0, 5);
}
