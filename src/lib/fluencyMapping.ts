// Numeric scores → directional evidence labels (ported from Charlotte Labs).
export type EvidenceState = "Strong evidence" | "Good evidence" | "Limited evidence" | "Not enough evidence yet";
export type OverallBand = "Emerging" | "Developing" | "Proficient" | "Strong";

export function overallBand(level: string): { label: OverallBand; className: string } {
  const normalized = level === "Advanced" ? "Strong" : (level || "Emerging");
  const styles: Record<string, string> = {
    Emerging:   "bg-[#F4F0E8] text-[#6a5838] border-[#D8C8A8]",
    Developing: "bg-[#FBF2E0] text-[#7a5010] border-[#E0C880]",
    Proficient: "bg-[#E0F0F0] text-[#1a5858] border-[#A8D0D0]",
    Strong:     "bg-[#EAF4E0] text-[#1a5020] border-[#B8D8A0]",
  };
  return { label: normalized as OverallBand, className: styles[normalized] || styles.Emerging };
}

export function dimensionEvidenceState(score: number | null | undefined): EvidenceState {
  if (score === null || score === undefined) return "Not enough evidence yet";
  if (score >= 4) return "Strong evidence";
  if (score >= 3) return "Good evidence";
  if (score >= 1) return "Limited evidence";
  return "Not enough evidence yet";
}

export function evidenceStateStyle(state: EvidenceState): string {
  switch (state) {
    case "Strong evidence":         return "bg-[#EAF4E0] border-[#B8D8A0] text-[#1a5020]";
    case "Good evidence":           return "bg-[#E0F0F0] border-[#A8D0D0] text-[#1a5858]";
    case "Limited evidence":        return "bg-[#FBF2E0] border-[#E0C880] text-[#7a5010]";
    case "Not enough evidence yet": return "bg-[#F4F0E8] border-[#D8C8A8] text-[#6a5838]";
  }
}

// Participant-facing band: numeric score → label + color + evidence tag.
// Used to hide raw numeric scores from students while keeping signal.
export type ScoreBandLabel = "Advanced" | "Proficient" | "Developing" | "Emerging";
export interface ScoreBand {
  label: ScoreBandLabel | null;
  className: string;
  evidenceTag: "Strong signal" | "Building" | "Not enough data yet";
}
export function scoreToBand(
  score: number | null | undefined,
  evidenceBasis?: string | null,
): ScoreBand {
  const evidenceTag: ScoreBand["evidenceTag"] =
    evidenceBasis === "direct_evidence"
      ? "Strong signal"
      : evidenceBasis === "inferred_evidence"
        ? "Building"
        : "Not enough data yet";
  if (score == null || evidenceBasis === "insufficient_evidence" || evidenceBasis === "not_enough") {
    return { label: null, className: "bg-muted text-muted-foreground border-border", evidenceTag: "Not enough data yet" };
  }
  if (score >= 4)
    return { label: "Advanced",   className: "bg-emerald-100 text-emerald-900 border-emerald-300", evidenceTag };
  if (score >= 3)
    return { label: "Proficient", className: "bg-blue-100 text-blue-900 border-blue-300",         evidenceTag };
  if (score >= 2)
    return { label: "Developing", className: "bg-amber-100 text-amber-900 border-amber-300",      evidenceTag };
  if (score >= 1)
    return { label: "Emerging",   className: "bg-rose-100 text-rose-900 border-rose-300",         evidenceTag };
  return { label: null, className: "bg-muted text-muted-foreground border-border", evidenceTag: "Not enough data yet" };
}

export function toolBadgeClass(tool: string): string {
  const t = (tool || "").toLowerCase();
  if (t.includes("chatgpt") || t.includes("openai")) return "tool-chatgpt";
  if (t.includes("claude")) return "tool-claude";
  if (t.includes("gemini")) return "tool-gemini";
  if (t.includes("copilot")) return "tool-copilot";
  if (t.includes("perplexity")) return "tool-perplexity";
  return "tool-default";
}
