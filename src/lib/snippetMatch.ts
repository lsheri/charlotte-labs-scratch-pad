// Lightweight fuzzy matcher: snippet → turn idx.
// Strategy: normalize whitespace + casefold, try substring; if no hit,
// fall back to longest-common-token-window heuristic.

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export function matchSnippetToTurn(
  snippet: string,
  turns: Array<{ idx: number; content: string; role: string }>,
): number | null {
  const q = norm(snippet);
  if (q.length < 8) return null;
  // 1. exact substring
  for (const t of turns) {
    if (norm(t.content).includes(q)) return t.idx;
  }
  // 2. token overlap — at least 60% of snippet's words appear contiguously-ish
  const qTokens = q.split(" ").filter(w => w.length > 3);
  if (qTokens.length < 3) return null;
  let best: { idx: number; score: number } | null = null;
  for (const t of turns) {
    const c = norm(t.content);
    const hits = qTokens.filter(w => c.includes(w)).length;
    const score = hits / qTokens.length;
    if (score >= 0.6 && (!best || score > best.score)) best = { idx: t.idx, score };
  }
  return best?.idx ?? null;
}
