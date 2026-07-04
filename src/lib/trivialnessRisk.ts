/**
 * "AI trivialness risk" — how likely a submitted receipt represents shallow,
 * single-shot AI use vs meaningful human-in-the-loop collaboration.
 *
 * Derived only, never stored. Tune freely.
 */
import { getReceiptTools, isWorkflow, type ReceiptLike } from "./displayNames";

export type RiskLevel = "low" | "medium" | "high";

export interface RiskInput extends ReceiptLike {
  conversation_json?: unknown;
  time_spent_minutes?: number | null;
}

export interface RiskResult {
  score: number; // 0 (low risk) .. 100 (high risk of trivial AI use)
  level: RiskLevel;
  reasons: string[];
}

function turnCount(r: RiskInput): number {
  const c: any = r.conversation_json;
  if (Array.isArray(c)) return c.length;
  if (c && Array.isArray(c.turns)) return c.turns.length;
  if (c && Array.isArray(c.messages)) return c.messages.length;
  return 0;
}

function promptLen(r: RiskInput): number {
  return (r.prompt_preview ?? "").trim().length;
}

export function assessTrivialnessRisk(r: RiskInput): RiskResult {
  let score = 0;
  const reasons: string[] = [];

  const tools = getReceiptTools(r);
  const turns = turnCount(r);
  const minutes = r.time_spent_minutes ?? 0;
  const pLen = promptLen(r);

  // Fewer tools = more risk
  if (tools.length <= 1) { score += 25; reasons.push("Single tool"); }
  else if (tools.length >= 3) { score -= 10; reasons.push("Multi-tool chain"); }

  // Short conversation = higher risk of single-shot copy
  if (turns <= 2) { score += 30; reasons.push("Very few turns"); }
  else if (turns >= 6) { score -= 15; reasons.push("Sustained conversation"); }

  // Very short prompts = low effort
  if (pLen > 0 && pLen < 60) { score += 20; reasons.push("Short prompt"); }
  else if (pLen >= 240) { score -= 5; reasons.push("Detailed prompt"); }

  // Little time spent
  if (minutes > 0 && minutes < 5) { score += 15; reasons.push("Under 5 min"); }
  else if (minutes >= 20) { score -= 10; reasons.push("Sustained work"); }

  // Explicit workflow (declared output type or ≥2 tools)
  if (isWorkflow(r)) { score -= 15; reasons.push("Structured workflow"); }

  // Clamp
  score = Math.max(0, Math.min(100, score));

  const level: RiskLevel = score >= 60 ? "high" : score >= 35 ? "medium" : "low";
  return { score, level, reasons: reasons.slice(0, 3) };
}
