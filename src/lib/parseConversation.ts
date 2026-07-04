/**
 * Conversation parser for manually-uploaded AI transcripts.
 * Ported from Charlotte Labs.
 */

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
  confidence?: "high" | "medium" | "low";
}

const AI_OPENERS = [/^(sure|certainly|of course|great question|here's|here is|let me|absolutely|i'd be happy|i can help)/i];
const AI_FOOTERS = [/let me know if/i, /would you like me to/i, /i hope this helps/i, /feel free to/i, /is there anything else/i, /shall i/i, /happy to help/i];
const AI_STRUCTURAL = [/^#{1,4}\s/m, /^[-*]\s/m, /^\d+\.\s/m, /```[\s\S]*?```/, /\*\*[^*]+\*\*/];
const AI_HEDGING = [/it's important to note/i, /keep in mind/i, /it's worth noting/i, /please note that/i];
const AI_TRANSITIONS = [/^furthermore,/im, /^additionally,/im, /^in summary,/im, /^in conclusion,/im, /^to summarize,/im, /^moreover,/im];
const USER_IMPERATIVES = [/^(give me|show me|explain|write|create|make|tell me|list|describe|help me|generate|summarize|provide|can you|could you|how do|how can|what is|what are|why does|why is|i need|i want)/i];

function looksLikeAIResponse(text: string, medianLength?: number): number {
  let score = 0;
  const t = text.trim();
  for (const re of AI_OPENERS) if (re.test(t)) { score += 3; break; }
  for (const re of AI_FOOTERS) if (re.test(t)) { score += 3; break; }
  for (const re of AI_STRUCTURAL) if (re.test(t)) { score += 3; break; }
  if (medianLength && t.length > medianLength * 3) score += 2;
  for (const re of AI_HEDGING) if (re.test(t)) { score += 2; break; }
  for (const re of AI_TRANSITIONS) if (re.test(t)) { score += 2; break; }
  const numbered = t.match(/^\d+\.\s/gm);
  if (numbered && numbered.length >= 3) score += 2;
  if (t.length < 50) score -= 3;
  if (t.endsWith("?")) score -= 3;
  for (const re of USER_IMPERATIVES) if (re.test(t)) { score -= 3; break; }
  return score;
}

const USER_LABELS = /^(user|me|you|human|student|turn\s*\d+\s*\n?\s*user)[^:]*:/i;
const AI_LABELS = /^(assistant|ai|chatgpt|claude|gemini|copilot|perplexity|grok|deepseek|lovable|bolt|a)[^:]*:/i;

function tryLabelParsing(text: string): ConversationTurn[] | null {
  const turns: ConversationTurn[] = [];
  const lines = text.split("\n");
  let role: "user" | "assistant" = "user";
  let buf = "";
  for (const line of lines) {
    const tl = line.trim();
    if (USER_LABELS.test(tl)) {
      if (buf.trim()) turns.push({ role, content: buf.trim(), confidence: "high" });
      role = "user";
      buf = tl.replace(USER_LABELS, "").trim();
    } else if (AI_LABELS.test(tl)) {
      if (buf.trim()) turns.push({ role, content: buf.trim(), confidence: "high" });
      role = "assistant";
      buf = tl.replace(AI_LABELS, "").trim();
    } else {
      buf += "\n" + line;
    }
  }
  if (buf.trim()) turns.push({ role, content: buf.trim(), confidence: "high" });
  return turns.length >= 2 ? turns : null;
}

function heuristicParsing(text: string): ConversationTurn[] {
  const blocks = text.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
  if (blocks.length === 0) return [];
  if (blocks.length === 1) return [{ role: "user", content: blocks[0], confidence: "medium" }];
  const lengths = blocks.map(b => b.length).sort((a, b) => a - b);
  const median = lengths[Math.floor(lengths.length / 2)];
  const turns: ConversationTurn[] = [];
  let last: "user" | "assistant" | null = null;
  for (const b of blocks) {
    const score = looksLikeAIResponse(b, median);
    let role: "user" | "assistant";
    let confidence: "high" | "medium" | "low";
    if (score >= 3) { role = "assistant"; confidence = "medium"; }
    else if (score <= -2) { role = "user"; confidence = "medium"; }
    else { role = last === "user" ? "assistant" : "user"; confidence = "low"; }
    turns.push({ role, content: b, confidence });
    last = role;
  }
  return turns;
}

export function parseConversation(text: string): ConversationTurn[] {
  if (!text.trim()) return [];
  const labelResult = tryLabelParsing(text);
  if (labelResult) return labelResult;
  return heuristicParsing(text);
}

// ── Tool detection from Charlotte AI Collaboration Log header ─────────

const TOOL_PATTERNS: { tool: string; patterns: RegExp[] }[] = [
  { tool: "chatgpt", patterns: [/\bchatgpt\b/i, /\bgpt[\s-]?[345]/i, /\bopenai\b/i, /\bo[134][\s-]?(mini|preview)?\b/i] },
  { tool: "claude", patterns: [/\bclaude\b/i, /\banthropic\b/i, /\bsonnet\b/i, /\bopus\b/i, /\bhaiku\b/i] },
  { tool: "gemini", patterns: [/\bgemini\b/i, /\bbard\b/i, /\bgoogle\s+ai\b/i] },
  { tool: "copilot", patterns: [/\bcopilot\b/i, /\bmicrosoft\s+ai\b/i] },
  { tool: "perplexity", patterns: [/\bperplexity\b/i] },
  { tool: "lovable", patterns: [/\blovable\b/i] },
  { tool: "bolt", patterns: [/\bbolt\.new\b/i, /\bbolt\b/i] },
  { tool: "grok", patterns: [/\bgrok\b/i, /\bxai\b/i] },
  { tool: "deepseek", patterns: [/\bdeepseek\b/i] },
];

/** Scan the first ~600 chars of a transcript for an LLM/vendor name. */
export function detectToolFromHeader(text: string): string {
  const head = text.slice(0, 600);
  for (const { tool, patterns } of TOOL_PATTERNS) {
    for (const re of patterns) if (re.test(head)) return tool;
  }
  return "other";
}
