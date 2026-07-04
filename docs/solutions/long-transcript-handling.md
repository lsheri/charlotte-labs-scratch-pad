# Long-Transcript Receipt Handling

**Last updated:** 2026-05-25
**Status:** Active — Flash-at-50-turns rule live.

## TL;DR

For any receipt whose combined thread transcript has **≥ 50 turns**, the
staged fluency analyzer routes the call to **Gemini Flash**
(`google/gemini-3-flash-preview`) instead of **Gemini 2.5 Pro**
(`google/gemini-2.5-pro`). Below 50 turns we still use Pro.

This lives in `src/server/fluency.server.ts → runStagedFluencyAnalysis`
behind a single boolean: `useFlash = params.turns.length >= 50`.

## Why

Cloudflare Workers cap active CPU per request. Even with `waitUntil()`
keeping the work alive in the background, **active generation time**
(model decoding tokens) counts against the budget. We observed:

| Transcript size | Pro wall time | Flash wall time | Outcome on Pro                |
|-----------------|---------------|-----------------|-------------------------------|
| ~20 turns       | 15–25s        | 6–10s           | ✅ completes                  |
| ~50 turns       | 35–55s        | 10–18s          | ⚠️ intermittent CPU-kill      |
| 100+ turns      | 60–120s       | 18–35s          | ❌ consistent CPU-kill        |
| 300+ turns      | 90s+ (DNF)    | 30–60s          | ❌ dead-letters after 3 tries |

When Pro is CPU-killed mid-stream:
1. The request is terminated; no rows are written.
2. The job stays `status=processing, stage=analyzing` until the reaper
   times it out (~1 min).
3. The reaper bumps `attempts` and requeues.
4. Same wall, same kill. After `MAX_ATTEMPTS=3` → `dead_letter`.

The `test x3` receipt (job `81daa262…`) was the canonical example: 100+
combined turns, Pro killed every attempt.

## The 50-turn boundary

Empirical. Pro reliably completes under 30s up to ~30 turns and tips over
between 40–60 turns depending on average turn length. We picked 50 as a
conservative middle that:

- Keeps short, high-signal receipts on Pro for best scoring nuance.
- Pushes any conversation long enough to risk CPU-kill onto Flash.
- Is one number — no per-bucket branching to maintain.

The `classifyBucket()` helper still exists for UI ETA copy ("long
conversation detected") but no longer drives model selection.

## Quality tradeoff

Flash on a long transcript scores ~5–10% lower on dimension nuance than
Pro on the same transcript (qualitative review, n≈12). For long
conversations this is overwhelmingly preferable to **not completing at
all**. For short conversations, Pro stays the default.

## When to revisit

Move past Flash-at-50 if any of these become true:

1. **Cloudflare raises the per-request CPU budget** (current cap is
   ~30s effective on Workers free/paid). At that point Pro becomes viable
   on 100+ turn transcripts.
2. **We move the receipt processor off Cloudflare** to a long-running
   Node service (Render / Fly / Railway). Then Pro is viable at any size.
3. **We add map-reduce chunking** (the scaffolding exists in
   `fluency_chunk_results` / `chunks_total`). Each chunk would fit in
   Pro's budget; a final merge tick stitches them.

Until one of those happens: **don't raise the threshold above 50** without
re-running the wall-time table above.

## Related code

- `src/server/fluency.server.ts` — `useFlash` decision, model constants.
- `src/server/openai.server.ts` — `SCORING_MODEL` (Pro), `CHUNK_SCORING_MODEL` (Flash).
- `src/routes/api/public/hooks/process-receipt-jobs.ts` — reaper that
  catches stuck `processing + analyzing` jobs.
- `src/server/receipt-jobs.server.ts` — job state machine, `MAX_ATTEMPTS=3`.
