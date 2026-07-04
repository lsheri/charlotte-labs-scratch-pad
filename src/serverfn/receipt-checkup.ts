import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fetchOpenAIWithRetry, SUMMARY_MODEL } from "@/server/openai.server";

export type ReceiptTourSection =
  | "header" | "fluency-radar" | "skill-evidence"
  | "evidence-points" | "patterns" | "conversation";

const SECTION_SET = new Set<ReceiptTourSection>([
  "header", "fluency-radar", "skill-evidence",
  "evidence-points", "patterns", "conversation",
]);

export interface ReceiptTourStop {
  section: ReceiptTourSection;
  title: string;
  insight: string;
}

export interface ReceiptPattern {
  title: string;
  takeaway: string;
  exampleFromThisReceipt: string;
  suggestedTemplate: string;
  appliesAcrossCount: number;
}

export interface ReceiptCheckupResult {
  stops: ReceiptTourStop[];
  patterns: ReceiptPattern[];
}

const CACHE_TTL_HOURS = 24 * 7; // 7 days

function snippet(s: string | null | undefined, n = 240): string {
  if (!s) return "";
  const t = String(s).replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

function pickUserPrompts(turns: Array<{ role: string; content: string }>, max = 6): string[] {
  return turns.filter(t => t.role === "user").slice(0, max).map(t => snippet(t.content, 200));
}

function localFallback(args: {
  thisTool: string;
  workflowType: string | null;
  siblingsCount: number;
  topUserPrompt: string;
  audit: any;
}): ReceiptCheckupResult {
  const { thisTool, workflowType, siblingsCount, topUserPrompt, audit } = args;
  const overall = audit?.overall_level ? `level ${audit.overall_level}` : "scored";
  const stops: ReceiptTourStop[] = [
    { section: "header", title: "What this is",
      insight: `A ${workflowType ?? "single-tool"} workflow run on ${thisTool}.` },
    { section: "fluency-radar", title: "Your shape",
      insight: `Your fluency profile here came in ${overall}. The radar shows where this run leaned.` },
    { section: "evidence-points", title: "Receipts of skill",
      insight: `These are the moves Charlotte actually saw — the basis for every score on this page.` },
    { section: "patterns", title: "Repeatable bits",
      insight: siblingsCount > 1
        ? `You have ${siblingsCount} runs like this. Patterns below are what repeats.`
        : `Once you log more runs of this type, repeatable patterns will surface here.` },
    { section: "conversation", title: "The actual transcript",
      insight: `Scroll the conversation to see the prompts and replies behind every observation above.` },
  ];
  const patterns: ReceiptPattern[] = topUserPrompt
    ? [{
        title: "Your opening move",
        takeaway: "You tend to start prompts with similar framing.",
        exampleFromThisReceipt: topUserPrompt,
        suggestedTemplate: topUserPrompt.split(" ").slice(0, 12).join(" ") + " …",
        appliesAcrossCount: Math.max(1, siblingsCount),
      }]
    : [];
  return { stops, patterns };
}

export const getReceiptCheckup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ receiptId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Load target receipt (RLS scopes to owner/admin/researcher)
    const { data: receipt, error: rErr } = await supabase
      .from("receipts")
      .select("id, tool_used, conversation_json, metadata, participant_id, updated_at")
      .eq("id", data.receiptId)
      .single();
    if (rErr || !receipt) throw new Error(rErr?.message || "Receipt not found");

    const meta = (receipt.metadata ?? {}) as Record<string, any>;
    const workflowType: string | null =
      typeof meta.workflowType === "string" ? meta.workflowType : null;
    const thisTool = receipt.tool_used ?? "AI";

    // Sibling receipts of same workflow type (or same tool) for cross-run patterns
    const siblingsQuery = supabase
      .from("receipts")
      .select("id, tool_used, conversation_json, metadata")
      .eq("participant_id", receipt.participant_id)
      .neq("id", receipt.id)
      .order("created_at", { ascending: false })
      .limit(30);
    const { data: siblings } = await siblingsQuery;
    const siblingList = (siblings ?? []).filter((s) => {
      const sm = (s.metadata ?? {}) as any;
      if (workflowType) return sm.workflowType === workflowType;
      return s.tool_used === receipt.tool_used;
    });

    // Fingerprint: receipt + how many siblings exist + receipt updated_at
    const fingerprint = `${receipt.id}:${siblingList.length}:${receipt.updated_at}`;

    // Cache check
    const { data: cached } = await supabase
      .from("receipt_checkup_cache")
      .select("payload, fingerprint, expires_at")
      .eq("receipt_id", receipt.id)
      .maybeSingle();
    if (cached && cached.fingerprint === fingerprint && new Date(cached.expires_at).getTime() > Date.now()) {
      return cached.payload as unknown as ReceiptCheckupResult;
    }

    // Fluency audit
    const { data: run } = await supabase
      .from("fluency_analysis_runs")
      .select("analysis_output_json")
      .eq("receipt_id", receipt.id)
      .order("created_at", { ascending: false })
      .limit(1).maybeSingle();
    const audit: any = run?.analysis_output_json ?? null;

    // Turns for this receipt
    const turns: Array<{ role: string; content: string }> =
      Array.isArray(receipt.conversation_json) ? (receipt.conversation_json as any) : [];
    const userPrompts = pickUserPrompts(turns, 6);

    // Sibling user-prompt snippets (compact)
    const siblingPrompts = siblingList
      .flatMap((s) => Array.isArray(s.conversation_json) ? (s.conversation_json as any[]) : [])
      .filter((t) => t?.role === "user")
      .slice(0, 20)
      .map((t) => snippet(t.content, 140));

    const compact = {
      thisReceipt: {
        tool: thisTool,
        workflowType,
        userPrompts,
        auditOverall: audit?.overall_level ?? null,
        topDimensions: Array.isArray(audit?.dimensions)
          ? audit.dimensions
              .filter((d: any) => typeof d?.score === "number")
              .sort((a: any, b: any) => (b.score ?? 0) - (a.score ?? 0))
              .slice(0, 3)
              .map((d: any) => ({ name: d.display_name, score: d.score }))
          : [],
      },
      siblings: { count: siblingList.length, recentUserPrompts: siblingPrompts },
    };

    const writeCache = async (payload: ReceiptCheckupResult) => {
      const expires = new Date(Date.now() + CACHE_TTL_HOURS * 3600 * 1000).toISOString();
      await supabase.from("receipt_checkup_cache").upsert({
        receipt_id: receipt.id, fingerprint,
        payload: payload as any, expires_at: expires,
      }, { onConflict: "receipt_id" });
    };

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      const fb = localFallback({
        thisTool, workflowType, siblingsCount: siblingList.length,
        topUserPrompt: userPrompts[0] ?? "", audit,
      });
      await writeCache(fb);
      return fb;
    }

    const systemPrompt = [
      "You are Charlotte, a research spider trained in prompt engineering and AI workflow analysis.",
      "Think like an MIT prompt-engineering researcher: empirical, observation-first, evidence-bound, no hype.",
      "You are walking a user through ONE of their AI receipts plus their other runs of the same type.",
      "",
      "OUTPUT — two arrays:",
      "1. stops: 5 short narration stops, one per receipt section, in this exact order:",
      "   header, fluency-radar, evidence-points, patterns, conversation.",
      "   Each insight ≤ 200 chars, second person, no questions, no emojis, no praise.",
      "   Each insight must reference something concrete in the JSON I gave you (a tool, a workflow type, a score, a phrase from a prompt).",
      "2. patterns: 0–4 repeatable prompt/workflow patterns the user could templatize.",
      "   For EACH pattern:",
      "   - title: short noun phrase (≤ 40 chars).",
      "   - takeaway: one sentence on what is repeatable and why it matters (≤ 140 chars).",
      "   - exampleFromThisReceipt: a quoted phrase or paraphrase from THIS receipt's prompts.",
      "   - suggestedTemplate: a reusable fill-in-the-blank version using {brackets}.",
      "   - appliesAcrossCount: integer ≥ 2; how many of the user's runs (this + siblings) show the pattern.",
      "   HARD RULES for patterns:",
      "   - NEVER invent a pattern that does not appear in the user's prompts. If you cannot find one, return an empty array.",
      "   - NEVER give generic prompt-engineering advice ('be specific', 'add context', 'use examples'). Only patterns the user already does.",
      "   - Patterns must be traits of THIS user's behavior, not general best practices.",
    ].join("\n");

    const aiPayload = {
      model: SUMMARY_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content:
          `Receipt + sibling data (compact JSON):\n${JSON.stringify(compact)}\n\n` +
          `Produce stops + patterns via the tool call.` },
      ],
      tools: [{
        type: "function",
        function: {
          name: "report_receipt_checkup",
          description: "Return tour stops and learnable patterns for this receipt.",
          parameters: {
            type: "object",
            properties: {
              stops: {
                type: "array", minItems: 5, maxItems: 5,
                items: {
                  type: "object",
                  properties: {
                    section: { type: "string", enum: [
                      "header", "fluency-radar", "skill-evidence",
                      "evidence-points", "patterns", "conversation",
                    ] },
                    title: { type: "string", maxLength: 40 },
                    insight: { type: "string", maxLength: 220 },
                  },
                  required: ["section", "title", "insight"],
                  additionalProperties: false,
                },
              },
              patterns: {
                type: "array", minItems: 0, maxItems: 4,
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string", maxLength: 60 },
                    takeaway: { type: "string", maxLength: 200 },
                    exampleFromThisReceipt: { type: "string", maxLength: 240 },
                    suggestedTemplate: { type: "string", maxLength: 240, description: "A reusable fill-in-the-blank version of the prompt using {brackets}. Max 240 chars." },
                    appliesAcrossCount: { type: "integer", minimum: 2 },
                  },
                  required: ["title", "takeaway", "exampleFromThisReceipt", "suggestedTemplate", "appliesAcrossCount"],
                  additionalProperties: false,
                },
              },
            },
            required: ["stops", "patterns"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "report_receipt_checkup" } },
      max_completion_tokens: 500,
    };

    try {
      const res = await fetchOpenAIWithRetry(
        "https://api.openai.com/v1/chat/completions",
        { method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(aiPayload) },
        "receipt-checkup",
      );
      if (!res.ok) {
        console.error("[receipt-checkup] openai status", res.status);
        const fb = localFallback({ thisTool, workflowType, siblingsCount: siblingList.length, topUserPrompt: userPrompts[0] ?? "", audit });
        await writeCache(fb);
        return fb;
      }
      const json: any = await res.json();
      const argsStr = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!argsStr) {
        const fb = localFallback({ thisTool, workflowType, siblingsCount: siblingList.length, topUserPrompt: userPrompts[0] ?? "", audit });
        await writeCache(fb);
        return fb;
      }
      const parsed = JSON.parse(argsStr);
      const stops: ReceiptTourStop[] = (parsed.stops ?? [])
        .filter((s: any) => s && SECTION_SET.has(s.section))
        .map((s: any) => ({
          section: s.section as ReceiptTourSection,
          title: String(s.title).slice(0, 40),
          insight: String(s.insight).slice(0, 220),
        }));
      const patterns: ReceiptPattern[] = (parsed.patterns ?? [])
        .filter((p: any) => p && typeof p.appliesAcrossCount === "number" && p.appliesAcrossCount >= 2)
        .map((p: any) => ({
          title: String(p.title).slice(0, 60),
          takeaway: String(p.takeaway).slice(0, 200),
          exampleFromThisReceipt: String(p.exampleFromThisReceipt).slice(0, 240),
          suggestedTemplate: String(p.suggestedTemplate).slice(0, 240),
          appliesAcrossCount: Math.max(2, Math.floor(p.appliesAcrossCount)),
        }));
      const final: ReceiptCheckupResult = stops.length
        ? { stops, patterns }
        : localFallback({ thisTool, workflowType, siblingsCount: siblingList.length, topUserPrompt: userPrompts[0] ?? "", audit });
      await writeCache(final);
      return final;
    } catch (e) {
      console.error("[receipt-checkup] error", e);
      const fb = localFallback({ thisTool, workflowType, siblingsCount: siblingList.length, topUserPrompt: userPrompts[0] ?? "", audit });
      await writeCache(fb);
      return fb;
    }
  });
