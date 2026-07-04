## Answers to your questions (current behavior)

- **Do templates work on mapped-thread receipts?** Yes. Mapping just tags which threads feed a receipt; the same "New receipt" dialog opens with the 3 template checkboxes.
- **Can you pick which templates?** Yes — three options in the dialog: Academic Fluency, Verification & Risk, Study Gaps (all on by default).
- **Which template goes to the professor?** The **entire receipt** is what gets attached to the assignment (`assignment_submissions.receipt_id`). The department view then reads whichever templates ran on that receipt. There's no "send only Verification" toggle today.
- **Multiple threads → context window?** All mapped threads (in the same workspace) are **stitched into ONE conversation** and analyzed in a **single Gemini call** — Gemini 2.5 Pro's 1M-token window fits any realistic transcript, so there's no chunking risk. What *is* parallel today: after the base fluency call, the 2 study templates fire **concurrently**, not one after another.

---

## Plan

### 1. Switch to the largest-context Gemini available on Lovable AI Gateway
- In `src/server/openai.server.ts`, change `SCORING_MODEL` from `google/gemini-2.5-pro` to `google/gemini-3.1-pro-preview` (also 1M context, newer generation reasoning).
- Keep `CHUNK_SCORING_MODEL` / `SUMMARY_MODEL` / `ROUTING_MODEL` on `gemini-3-flash-preview` (also 1M, cheap/fast) for short auxiliary calls.
- Update the OpenAI fallback map to include the new id.
- Bump per-call `timeoutMs` on template analyses from 90s → 120s (Pro is slower on long transcripts).

### 2. Each receipt type has its own system prompt, run **one at a time**
System prompts already exist per template:
- `classic_fluency` → the fluency analyzer template in `system_prompt_templates`
- `verification_risk` → `VERIFICATION_PROMPT` in `study-analyzers.server.ts`
- `study_gaps` → `STUDY_GAPS_PROMPT` in `study-analyzers.server.ts`

Change execution to strict sequential:
- In `src/routes/participant.receipts.$receiptId.tsx`, replace the parallel `for` loop that fires all `runStudyFn(...)` at once with an `async` sequential runner that awaits each template before starting the next, in a fixed order: `classic_fluency` (already done by pipeline) → `verification_risk` → `study_gaps`.
- Surface progress in the UI: show a small "Running Verification & Risk… (2/3)" pill while sequential runs are in flight.
- On the server side, keep `runStudyAnalysis` idempotent (already upserts on `receipt_id,template_key`) so re-entry after a page refresh doesn't double-run.

### 3. Multi-thread submission — confirm & harden the "one call" model
- Keep the current stitching (all mapped threads for one assignment → one conversation → one Gemini call). This is the safest way to stay inside the context window and give the model full cross-thread context.
- Add a **transcript-size guard** before the Gemini call: if stitched turns exceed ~800K tokens (leaving headroom for the 1M window + prompt + output), fall back to per-thread receipts and merge results. In practice a student's homework threads won't hit this, but the guard prevents a silent truncation.

### 4. "Submit to professor" — clarify what the department sees
- Today: `attachReceiptToAssignment` files the whole receipt under `assignment_submissions`. The professor's Department view reads the receipt + all completed template analyses.
- Add an explicit `submission_bundle` field (JSON) on `assignment_submissions` recording **which templates the student chose to include** at submit time. Default = all templates that ran. Later you can add a "submit only these views to my professor" checkbox — schema will already support it.

### 5. Prepare Department backend for tools, trends & fluency tracking
New/updated server functions in `src/serverfn/department.ts`:

- **`getDepartmentToolTrends({ classId, window })`** — daily/weekly counts per tool (chatgpt, claude, gemini, etc.) across the class over the last N days. Reads `receipts.tool_used` + `receipts.created_at`, grouped.
- **`getDepartmentFluencyTrends({ classId, window })`** — mean of each fluency dimension (Direction, Delegation, Discernment, Development, Ethics, Efficiency, Strategic Agency) per week, from `participant_fluency_history`. Returns a per-dimension time series.
- **`getDepartmentAssignmentTrends({ classId })`** — for each assignment, per-week submission count, avg trivialness-risk score, avg fluency dimensions of submitting students.
- **Extend `getDepartmentOverview`** with a `trends` block: `{ tools: [...], fluency: [...], submissionsByWeek: [...] }` so the existing department page can render sparklines without a second round trip.

No new tables needed — everything comes from `receipts`, `participant_fluency_history`, `participant_fluency_profiles`, `assignment_submissions`, and `chat_threads`.

### 6. UI surfacing (small, only what's needed to close the loop)
- Receipt detail page: show a "Templates" strip with per-template status (queued / running / done / error) driven by `template_analyses` rows.
- Department page: add three sparkline cards (Tool mix over time, Fluency dimensions over time, Assignment risk over time). Existing overview stays; trends are additive.

---

## Files changed / created

**Modified**
- `src/server/openai.server.ts` — model constants + fallback map + timeout.
- `src/server/study-analyzers.server.ts` — use new `SCORING_MODEL` naturally (no change beyond the export); add token-budget guard helper.
- `src/routes/participant.receipts.$receiptId.tsx` — sequential template runner + progress UI.
- `src/serverfn/assignments.ts` — `attachReceiptToAssignment` accepts an optional `templateKeys[]` written into `assignment_submissions` metadata.
- `src/serverfn/department.ts` — add trend server fns; extend overview payload.
- `src/routes/participant.department.$classId...` — render trends (small, sparkline cards).

**New**
- (no new files strictly required; trends live in `department.ts`.)

**DB migration**
- `assignment_submissions.metadata jsonb default '{}'` (nullable, additive) to store the chosen template keys. No breaking change.

## Out of scope for this pass
- Instructor-side "grade a template" workflow.
- Per-template hide-from-professor toggle in the submit dialog (schema will be ready; UI can come later).
- Real-time streaming of template output to the receipt page.
